/**
 * Instagram Connection Routes
 * Handles OAuth flow, connection status, and disconnection
 * 
 * This router is mounted at both /auth and /connection in the index:
 * - /auth routes: /url, /callback
 * - /connection routes: /status, / (DELETE)
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { instagramService, InstagramError } from '../../services/InstagramService.js'
import { disconnectService, type DisconnectMode, type InstagramDeletedCounts } from '../../services/disconnect-service.js'
import { getSubscription } from '../../middleware/subscription.js'
import { adminSubscriptionPlansService, type PlanTier } from '../../services/admin/subscription-plans-service.js'
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client'

const app = new Hono()

/**
 * GET /url - Generate Instagram OAuth URL
 * Full path: /api/v1/ig/auth/url
 * Requirements: 1.1
 */
app.get('/url', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Check subscription limit for Instagram accounts
    const subscription = await getSubscription(c.user.id)
    
    // Get effective tier (treat inactive subscriptions as FREE)
    const INACTIVE_STATUSES: SubscriptionStatus[] = [
      SubscriptionStatus.EXPIRED,
      SubscriptionStatus.CANCELLED,
      SubscriptionStatus.PENDING_PAYMENT
    ]
    const effectiveTier = INACTIVE_STATUSES.includes(subscription.status) 
      ? SubscriptionTier.FREE 
      : subscription.tier
    
    // Get channel limits from admin-configurable settings
    const planTier = effectiveTier.toLowerCase() as PlanTier
    const channelLimits = await adminSubscriptionPlansService.getChannelLimits(planTier)
    
    // Count current connected Instagram accounts
    const connectedAccountsCount = await prisma.instagramAccount.count({
      where: {
        userId: c.user.id,
        connectionStatus: 'connected'
      }
    })

    if (connectedAccountsCount >= channelLimits.maxInstagramAccounts) {
      return c.json({
        error: {
          code: 'LimitReached',
          message: `You have reached the maximum number of Instagram accounts (${channelLimits.maxInstagramAccounts}) for your subscription plan. Please upgrade or disconnect an existing account.`
        }
      }, 400)
    }

    // Generate OAuth URL with encrypted state
    const authResponse = await instagramService.generateAuthUrl(c.user.id)

    return c.json({
      success: true,
      data: {
        authUrl: authResponse.authUrl,
        expiresAt: authResponse.expiresAt
      }
    })
  } catch (error) {
    console.error('Generate auth URL error:', error)

    if (error instanceof InstagramError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to generate auth URL'
      }
    }, 500)
  }
})


/**
 * GET /callback - Handle Instagram OAuth callback
 * Full path: /api/v1/ig/auth/callback
 * Requirements: 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8
 * 
 * This endpoint is called directly by Instagram OAuth.
 * After processing, it redirects to the frontend with success/error status.
 */
app.get('/callback', async (c: Context) => {
  // Get frontend URL for redirects (strip any accidental quotes from env var)
  const rawFrontendUrl = process.env.FRONTEND_URL || process.env.CORS_ALLOWED_ORIGINS?.split(',')[0] || 'http://localhost:3000'
  const frontendUrl = rawFrontendUrl.replace(/^["']|["']$/g, '')
  const redirectBase = `${frontendUrl}/instagram/callback`

  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')
    const errorReason = c.req.query('error_reason')
    const errorDescription = c.req.query('error_description')

    // Handle OAuth cancellation (Requirement 1.6)
    if (error === 'access_denied') {
      const redirectUrl = `${redirectBase}?error=access_denied&message=${encodeURIComponent(errorDescription || 'Authorization cancelled by user')}`
      return c.redirect(redirectUrl)
    }

    if (error) {
      const redirectUrl = `${redirectBase}?error=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || 'Authorization failed')}`
      return c.redirect(redirectUrl)
    }

    if (!code || !state) {
      const redirectUrl = `${redirectBase}?error=invalid_request&message=${encodeURIComponent('Missing authorization code or state')}`
      return c.redirect(redirectUrl)
    }

    // Decrypt state to get userId
    let stateData: { userId: string; nonce: string; timestamp: number }
    try {
      stateData = instagramService.decryptState(state)
    } catch (stateError) {
      const redirectUrl = `${redirectBase}?error=invalid_state&message=${encodeURIComponent('Invalid or expired state. Please try again.')}`
      return c.redirect(redirectUrl)
    }

    const userId = stateData.userId

    // Exchange code for short-lived token (Requirement 1.3)
    const tokenResponse = await instagramService.exchangeCodeForToken(code, state)

    // Exchange for long-lived token (Requirement 1.4)
    const longLivedToken = await instagramService.exchangeForLongLivedToken(tokenResponse.accessToken)

    // Fetch account profile (Requirement 1.8)
    const profile = await instagramService.getAccountProfile(
      longLivedToken.accessToken,
      tokenResponse.userId
    )

    // Encrypt token for storage (Requirement 1.5)
    const encryptedToken = instagramService.encryptToken(longLivedToken.accessToken)

    // Calculate token expiration
    const tokenExpiresAt = new Date(Date.now() + longLivedToken.expiresIn * 1000)

    // Check if this Instagram account is already connected to another user
    const existingIgAccount = await prisma.instagramAccount.findFirst({
      where: {
        OR: [
          { igId: profile.id },
          { igUserId: tokenResponse.userId }
        ]
      }
    })

    if (existingIgAccount && existingIgAccount.userId !== userId) {
      const redirectUrl = `${redirectBase}?error=already_connected&message=${encodeURIComponent('This Instagram account is already connected to another user')}`
      return c.redirect(redirectUrl)
    }

    // Create or update Instagram account (Requirement 1.5)
    const igAccount = await prisma.instagramAccount.upsert({
      where: {
        igId: profile.id
      },
      create: {
        userId,
        igId: profile.id,
        igUserId: tokenResponse.userId,
        username: profile.username,
        profilePicUrl: profile.profilePictureUrl,
        accessToken: encryptedToken.ciphertext,
        accessTokenIV: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        tokenExpiresAt,
        grantedPermissions: tokenResponse.permissions || [],
        connectionStatus: 'connected',
        connectedAt: new Date()
      },
      update: {
        igUserId: tokenResponse.userId,
        username: profile.username,
        profilePicUrl: profile.profilePictureUrl,
        accessToken: encryptedToken.ciphertext,
        accessTokenIV: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        tokenExpiresAt,
        grantedPermissions: tokenResponse.permissions || [],
        connectionStatus: 'connected',
        connectedAt: new Date(),
        lastSyncAt: new Date()
      }
    })

    // Step 3: Enable webhook subscriptions for this Instagram account
    // This is REQUIRED to receive message webhooks per Meta documentation
    let webhookSubscriptionSuccess = false
    try {
      webhookSubscriptionSuccess = await instagramService.enableWebhookSubscriptions(
        longLivedToken.accessToken,
        profile.id,
        ['messages'] // Subscribe to messages webhook field
      )
      console.log(`[IG OAuth] Webhook subscription enabled: ${webhookSubscriptionSuccess}`)
    } catch (webhookError) {
      // Log error but don't fail the connection - user can retry later
      console.error('[IG OAuth] Failed to enable webhook subscriptions:', webhookError)
    }

    // Create connection log
    await prisma.iGConnectionLog.create({
      data: {
        instagramAccountId: igAccount.id,
        action: 'connected',
        details: {
          igId: profile.id,
          username: profile.username,
          tokenExpiresAt: tokenExpiresAt.toISOString(),
          permissions: tokenResponse.permissions,
          webhookSubscriptionEnabled: webhookSubscriptionSuccess
        }
      }
    })

    // Audit log
    await auditLog(
      'INSTAGRAM_CONNECTED',
      'InstagramAccount',
      igAccount.id,
      {
        igId: profile.id,
        username: profile.username,
        userId
      },
      userId
    )

    // Redirect to frontend with success
    const redirectUrl = `${redirectBase}?success=true&username=${encodeURIComponent(profile.username)}`
    return c.redirect(redirectUrl)
  } catch (error) {
    console.error('OAuth callback error:', error)

    const errorMessage = error instanceof Error ? error.message : 'Failed to complete Instagram connection'
    const redirectUrl = `${redirectBase}?error=connection_failed&message=${encodeURIComponent(errorMessage)}`
    return c.redirect(redirectUrl)
  }
})


/**
 * GET /status - Get current Instagram connection status
 * Requirements: 1.5, 6.1 (Agent access)
 * Returns all connected Instagram accounts for the user
 */
app.get('/status', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // For agents, use their business owner's ID to get connection status
    const userId = c.user.role === 'AGENT' && c.user.businessOwnerId 
      ? c.user.businessOwnerId 
      : c.user.id

    // Get ALL user's Instagram accounts (not just first one)
    const igAccounts = await prisma.instagramAccount.findMany({
      where: { userId },
      select: {
        id: true,
        igId: true,
        username: true,
        profilePicUrl: true,
        connectionStatus: true,
        connectedAt: true,
        lastSyncAt: true,
        tokenExpiresAt: true,
        grantedPermissions: true,
        _count: {
          select: {
            conversations: true
          }
        }
      },
      orderBy: { connectedAt: 'desc' }
    })

    if (igAccounts.length === 0) {
      return c.json({
        success: true,
        data: {
          connected: false,
          connectionStatus: 'not_connected',
          accounts: []
        }
      })
    }

    const now = new Date()
    
    // Map accounts with token status
    const accountsWithStatus = igAccounts.map(igAccount => {
      const tokenExpiresAt = new Date(igAccount.tokenExpiresAt)
      const daysUntilExpiry = Math.floor((tokenExpiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
      const isTokenExpiringSoon = daysUntilExpiry <= 7
      const isTokenExpired = tokenExpiresAt < now

      return {
        id: igAccount.id,
        igId: igAccount.igId,
        username: igAccount.username,
        profilePicUrl: igAccount.profilePicUrl,
        connectionStatus: igAccount.connectionStatus,
        connectedAt: igAccount.connectedAt.toISOString(),
        lastSyncAt: igAccount.lastSyncAt?.toISOString() || null,
        tokenExpiresAt: igAccount.tokenExpiresAt.toISOString(),
        daysUntilTokenExpiry: daysUntilExpiry,
        isTokenExpiringSoon,
        isTokenExpired,
        grantedPermissions: igAccount.grantedPermissions,
        conversationCount: igAccount._count.conversations
      }
    })

    // Check if any account is connected
    const hasConnectedAccount = accountsWithStatus.some(a => a.connectionStatus === 'connected')
    
    // For backward compatibility, also return the first account's data at root level
    const primaryAccount = accountsWithStatus[0]

    return c.json({
      success: true,
      data: {
        // Backward compatibility fields (first/primary account)
        connected: hasConnectedAccount,
        id: primaryAccount.id,
        igId: primaryAccount.igId,
        username: primaryAccount.username,
        profilePicUrl: primaryAccount.profilePicUrl,
        connectionStatus: primaryAccount.connectionStatus,
        connectedAt: primaryAccount.connectedAt,
        lastSyncAt: primaryAccount.lastSyncAt,
        tokenExpiresAt: primaryAccount.tokenExpiresAt,
        daysUntilTokenExpiry: primaryAccount.daysUntilTokenExpiry,
        isTokenExpiringSoon: primaryAccount.isTokenExpiringSoon,
        isTokenExpired: primaryAccount.isTokenExpired,
        grantedPermissions: primaryAccount.grantedPermissions,
        conversationCount: primaryAccount.conversationCount,
        // New: array of all accounts
        accounts: accountsWithStatus
      }
    })
  } catch (error) {
    console.error('Get connection status error:', error)

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get connection status'
      }
    }, 500)
  }
})

/**
 * POST /webhooks/subscribe - Enable webhook subscriptions for connected account
 * Use this to re-enable webhooks if initial subscription failed
 */
app.post('/webhooks/subscribe', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get decrypted token
    const accessToken = await instagramService.getDecryptedToken(igAccount.id)

    // Enable webhook subscriptions
    const success = await instagramService.enableWebhookSubscriptions(
      accessToken,
      igAccount.igId,
      ['messages']
    )

    // Log the action
    await prisma.iGConnectionLog.create({
      data: {
        instagramAccountId: igAccount.id,
        action: 'webhook_subscription_enabled',
        details: {
          success,
          timestamp: new Date().toISOString()
        }
      }
    })

    return c.json({
      success: true,
      data: {
        webhookSubscriptionEnabled: success,
        message: success 
          ? 'Webhook subscriptions enabled successfully. You should now receive message notifications.'
          : 'Webhook subscription request sent but may not have succeeded.'
      }
    })
  } catch (error) {
    console.error('Enable webhook subscriptions error:', error)

    if (error instanceof InstagramError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to enable webhook subscriptions'
      }
    }, 500)
  }
})

/**
 * GET /webhooks/status - Check current webhook subscription status
 */
app.get('/webhooks/status', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get decrypted token
    const accessToken = await instagramService.getDecryptedToken(igAccount.id)

    // Get current subscriptions
    const subscribedFields = await instagramService.getWebhookSubscriptions(
      accessToken,
      igAccount.igId
    )

    return c.json({
      success: true,
      data: {
        igId: igAccount.igId,
        username: igAccount.username,
        subscribedFields: subscribedFields || [],
        isMessagesSubscribed: subscribedFields?.includes('messages') || false
      }
    })
  } catch (error) {
    console.error('Get webhook status error:', error)

    if (error instanceof InstagramError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get webhook status'
      }
    }, 500)
  }
})

/**
 * DELETE / - Disconnect Instagram account
 * Requirements: 4.1-4.4, 5.1-5.3, 6.1-6.4, 7.1-7.3
 */
app.delete('/', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const body = await c.req.json().catch(() => ({}))
    const reason = body.reason || 'User requested disconnection'
    
    // Get mode parameter with validation (Req 6.1, 6.2)
    const mode: DisconnectMode = body.mode === 'hard' ? 'hard' : 'soft'
    
    // Validate mode parameter
    if (body.mode && body.mode !== 'soft' && body.mode !== 'hard') {
      return c.json({
        error: {
          code: 'INVALID_MODE',
          message: "Invalid disconnect mode. Must be 'soft' or 'hard'"
        }
      }, 400)
    }

    // Get specific account by ID if provided, otherwise get any account
    const accountId = body.accountId
    const igAccount = await prisma.instagramAccount.findFirst({
      where: accountId 
        ? { id: accountId, userId: c.user.id }
        : { userId: c.user.id }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: accountId 
            ? 'Instagram account not found or does not belong to you'
            : 'No Instagram account connected'
        }
      }, 404)
    }

    // Check if already disconnected (only for soft mode - hard mode can still delete)
    if (igAccount.connectionStatus === 'disconnected' && mode === 'soft') {
      return c.json({
        error: {
          code: 'ALREADY_DISCONNECTED',
          message: 'Instagram account is already disconnected'
        }
      }, 400)
    }

    // Call DisconnectService based on mode (Req 6.3)
    let disconnectResult
    if (mode === 'hard') {
      disconnectResult = await disconnectService.hardDisconnectInstagram(igAccount.id)
    } else {
      disconnectResult = await disconnectService.softDisconnectInstagram(igAccount.id)
    }

    const deletedCounts = disconnectResult.deletedCounts as InstagramDeletedCounts

    // Create connection log with mode information (Req 7.1, 7.2, 7.3)
    // Note: For hard disconnect, account is deleted so we skip connection log
    if (mode === 'soft') {
      await prisma.iGConnectionLog.create({
        data: {
          instagramAccountId: igAccount.id,
          action: 'disconnected',
          details: {
            igId: igAccount.igId,
            username: igAccount.username,
            reason,
            mode,
            disconnectedBy: c.user.id,
            disconnectedAt: new Date().toISOString(),
            deletedCounts: { ...deletedCounts }
          }
        }
      })
    }

    // Audit log with mode information (Req 6.4)
    await auditLog(
      'INSTAGRAM_DISCONNECTED',
      'InstagramAccount',
      igAccount.id,
      {
        igId: igAccount.igId,
        username: igAccount.username,
        reason,
        mode,
        userId: c.user.id,
        deletedCounts
      },
      c.user.id
    )

    return c.json({
      success: true,
      message: disconnectResult.message,
      mode,
      deletedCounts
    })
  } catch (error) {
    console.error('Disconnect Instagram error:', error)

    return c.json({
      error: {
        code: 'DISCONNECT_FAILED',
        message: error instanceof Error ? error.message : 'Failed to disconnect Instagram account'
      }
    }, 500)
  }
})

export default app
