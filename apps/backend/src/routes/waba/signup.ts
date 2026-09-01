/**
 * WABA Signup & OAuth Routes
 * Handles embedded signup flow and OAuth callback
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { wabaService } from '../../services/waba/index.js'
import { TokenEncryptionService } from '../../utils/tokenEncryption.js'
import {
  WABAError,
  WABAErrorCode,
  createUserCancelledError,
  createInvalidCodeError,
  createWebhookConfigError,
  parseMetaError,
  isRetryableError
} from '../../utils/wabaErrors.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

// Validation schemas
const signupInitSchema = z.object({
  redirectUri: z.string().url().optional(),
  enableCoexistence: z.boolean().optional().default(false)
})

const signupCallbackQuerySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  providedWabaId: z.string().min(1).optional()
})

const signupCallbackBodySchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
  providedWabaId: z.string().min(1).optional()
})

// POST /signup/init - Initialize embedded signup flow
app.post('/init', async (c: Context) => {
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
    const data = signupInitSchema.parse(body)

    // Generate signup URL with encrypted state containing userId
    const signupResponse = await wabaService.generateSignupUrl(
      c.user.id,
      data.redirectUri,
      data.enableCoexistence
    )

    // Audit log
    await auditLog(
      'WABA_SIGNUP_INITIATED',
      'User',
      c.user.id,
      {
        userId: c.user.id,
        expiresAt: signupResponse.expiresAt
      },
      c.user.id
    )

    return c.json({
      success: true,
      data: signupResponse
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to initialize WABA signup'
      }
    }, 500)
  }
})

// GET /signup/callback - Handle OAuth callback
app.get('/callback', async (c: Context) => {
  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')
    const errorReason = c.req.query('error_reason')
    const errorDescription = c.req.query('error_description')

    // Handle user cancellation or errors from Meta
    if (error) {
      logDetailedError(new Error('WABA signup error from Meta'), { error, errorReason, errorDescription, path: c.req.path })

      if (error === 'access_denied' || errorReason === 'user_denied') {
        const wabaError = createUserCancelledError(errorDescription)
        return c.json(wabaError.toJSON(), wabaError.statusCode as any)
      }

      return c.json({
        error: {
          code: 'META_SIGNUP_ERROR',
          message: errorDescription || 'Signup failed',
          reason: errorReason,
          retryable: true,
          recoveryAction: 'Please try connecting again'
        }
      }, 400)
    }

    // Validate required parameters
    if (!code || !state) {
      const wabaError = createInvalidCodeError()
      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    const callbackData = signupCallbackQuerySchema.parse({
      code,
      state,
      providedWabaId: c.req.query('providedWabaId') || undefined
    })

    // Exchange code for token and get user ID
    let tokenResponse
    let accessToken
    let userId
    let expiresIn

    try {
      tokenResponse = await wabaService.exchangeCodeForToken(callbackData.code, callbackData.state)
      accessToken = tokenResponse.accessToken
      userId = tokenResponse.userId
      expiresIn = tokenResponse.expiresIn
    } catch (error: any) {
      if (error.message?.includes('State parameter expired')) {
        const wabaError = new WABAError(
          WABAErrorCode.STATE_EXPIRED,
          'Authorization session expired',
          {
            statusCode: 400,
            retryable: true,
            recoveryAction: 'Please try connecting again'
          }
        )
        return c.json(wabaError.toJSON(), wabaError.statusCode as any)
      }

      const wabaError = parseMetaError(error)
      logDetailedError(error, {
        action: 'tokenExchange',
        wabaError: {
          code: wabaError.code,
          message: wabaError.message,
          metaError: wabaError.metaError
        },
        path: c.req.path
      })

      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    // Get existing connected WABAs for this user to exclude during discovery
    // This ensures that when connecting a second WABA, we pick the NEW one
    // instead of re-discovering the already-connected one
    const existingAccounts = await prisma.whatsAppAccount.findMany({
      where: { userId, connectionStatus: 'connected' },
      select: { wabaId: true },
    })
    const excludeWabaIds = existingAccounts.map(a => a.wabaId)

    // Discover WABA resources
    let wabaResources
    try {
      wabaResources = await wabaService.discoverWABAResources(accessToken, excludeWabaIds, callbackData.providedWabaId)
    } catch (error: any) {
      const wabaError = parseMetaError(error)
      logDetailedError(error, {
        action: 'resourceDiscovery',
        wabaError: {
          code: wabaError.code,
          message: wabaError.message,
          metaError: wabaError.metaError
        },
        path: c.req.path
      })

      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    // Encrypt access token
    const tokenEncryption = new TokenEncryptionService()
    const encryptedToken = tokenEncryption.encrypt(accessToken)

    // Calculate token expiration
    const expiresAt = expiresIn
      ? new Date(Date.now() + expiresIn * 1000)
      : new Date(Date.now() + 60 * 24 * 60 * 60 * 1000) // Default 60 days

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      const wabaError = new WABAError(
        WABAErrorCode.INTERNAL_ERROR,
        'User not found',
        {
          statusCode: 404,
          retryable: false
        }
      )
      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    // Get Meta App config from settings (database-first with env fallback)
    const { wabaSettings } = await import('../../services/waba/settings.js')
    await wabaSettings.refresh() // Ensure settings are loaded from database
    const wabaConfig = wabaSettings.getConfig()
    const metaAppId = wabaConfig.appId
    const metaAppSecret = wabaConfig.appSecret

    if (!metaAppId) {
      const wabaError = new WABAError(
        WABAErrorCode.INTERNAL_ERROR,
        'Meta App ID is not configured. Please configure it in Admin Settings > WhatsApp.',
        {
          statusCode: 500,
          retryable: false,
          recoveryAction: 'Go to Admin Dashboard > Settings > WhatsApp and configure Meta App ID'
        }
      )
      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    let metaApp = await prisma.metaApp.findFirst({
      where: {
        appId: metaAppId
      }
    })

    if (!metaApp) {
      metaApp = await prisma.metaApp.create({
        data: {
          appId: metaAppId,
          appSecret: metaAppSecret,
          techProviderStatus: 'pending',
          termsAcceptedAt: new Date()
        }
      })
    }

    // Create or update WhatsApp Account
    logDetailedError(new Error('Creating/updating WhatsApp Account'), {
      userId,
      wabaId: wabaResources.wabaId,
      status: 'connected',
      metaAppId: metaApp.id,
      level: 'info'
    })

    // Ownership guard: refuse to hijack a WABA that is already connected to a
    // DIFFERENT user. Without this, the OAuth/embedded-signup path let any user
    // who could complete signup for a WABA silently steal it (and its inbox)
    // from its current owner — the manual-connect path (manual.ts) already
    // guards this; the signup path did not, so a WABA could be bounced back and
    // forth between accounts. A re-connect by the SAME owner (token refresh,
    // re-sync) is still allowed.
    const existingWabaAccount = await prisma.whatsAppAccount.findUnique({
      where: { wabaId: wabaResources.wabaId },
      select: { userId: true },
    })
    if (existingWabaAccount && existingWabaAccount.userId !== userId) {
      const wabaError = new WABAError(
        WABAErrorCode.INTERNAL_ERROR,
        'This WhatsApp Business Account is already connected to another account.',
        { statusCode: 400, retryable: false },
      )
      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    const whatsappAccount = await prisma.whatsAppAccount.upsert({
      where: { wabaId: wabaResources.wabaId },
      create: {
        wabaId: wabaResources.wabaId,
        accessToken: encryptedToken.ciphertext,
        accessTokenIV: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        tokenExpiresAt: expiresAt,
        tokenLastRefresh: new Date(),
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        connectionStatus: 'connected',
        timezoneId: wabaResources.timezone,
        currency: wabaResources.currency,
        messageTemplateNamespace: wabaResources.messageTemplateNamespace,
        messagingTier: wabaResources.messagingLimitTier,
        metaAppId: metaApp.id,
        userId: userId,
      },
      update: {
        accessToken: encryptedToken.ciphertext,
        accessTokenIV: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        tokenExpiresAt: expiresAt,
        tokenLastRefresh: new Date(),
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        connectionStatus: 'connected',
        timezoneId: wabaResources.timezone,
        currency: wabaResources.currency,
        messageTemplateNamespace: wabaResources.messageTemplateNamespace,
        messagingTier: wabaResources.messagingLimitTier,
        metaAppId: metaApp.id,
        userId: userId,
      }
    })

    // Update user's metaAppId
    await prisma.user.update({
      where: { id: userId },
      data: { metaAppId: metaApp.id }
    })

    console.log(`✅ Created/updated WhatsApp Account ${whatsappAccount.id} for WABA ${wabaResources.wabaId}`)

    // Store phone numbers linked to WhatsApp Account
    // Reset primary flags for phone numbers of THIS account
    await prisma.phoneNumber.updateMany({
      where: { whatsappAccountId: whatsappAccount.id },
      data: { isPrimary: false }
    })

    // Upsert all phone numbers from the current WABA
    const phoneNumbers = await Promise.all(
      wabaResources.phoneNumbers.map(async (pn) => {
        return prisma.phoneNumber.upsert({
          where: { phoneNumberId: pn.id },
          create: {
            phoneNumberId: pn.id,
            displayPhoneNumber: pn.displayPhoneNumber,
            verifiedName: pn.verifiedName,
            qualityRating: pn.qualityRating,
            messagingLimitTier: pn.messagingLimitTier,
            isVerified: pn.codeVerificationStatus === 'VERIFIED',
            codeVerificationStatus: pn.codeVerificationStatus,
            accountMode: pn.accountMode,
            nameStatus: pn.nameStatus,
            status: pn.status,
            isPrimary: false, // Will set primary separately
            userId: userId,
            whatsappAccountId: whatsappAccount.id,
          },
          update: {
            displayPhoneNumber: pn.displayPhoneNumber,
            verifiedName: pn.verifiedName,
            qualityRating: pn.qualityRating,
            messagingLimitTier: pn.messagingLimitTier,
            isVerified: pn.codeVerificationStatus === 'VERIFIED',
            codeVerificationStatus: pn.codeVerificationStatus,
            accountMode: pn.accountMode,
            nameStatus: pn.nameStatus,
            status: pn.status,
            whatsappAccountId: whatsappAccount.id,
            // Re-point ownership too: when the SAME WABA/phone is (re)connected
            // by a different user, the account row is updated to the new owner
            // but the phone row previously kept the OLD userId — so inbound
            // webhooks (which resolve the owner via PhoneNumber.userId) routed
            // messages to the wrong account. Keep phone owner in sync with the
            // account owner.
            userId: userId,
          }
        })
      })
    )

    // Set the first phone number as primary
    if (phoneNumbers.length > 0) {
      await prisma.phoneNumber.update({
        where: { phoneNumberId: phoneNumbers[0].phoneNumberId },
        data: { isPrimary: true }
      })
      // Update the local reference to reflect isPrimary status
      phoneNumbers[0].isPrimary = true
    }

    // Check for Coexistence (WhatsApp Business App + Cloud API)
    let isCoexistence = false
    if (phoneNumbers.length > 0) {
      try {
        const coexStatus = await wabaService.checkCoexistenceStatus(
          phoneNumbers[0].phoneNumberId,
          accessToken
        )
        isCoexistence = coexStatus.isOnBizApp && coexStatus.platformType === 'CLOUD_API'

        if (isCoexistence) {
          logDetailedError(new Error('Coexistence detected'), { message: 'Starting sync operations', level: 'info' })

          // Update WhatsApp Account to mark as coexistence
          await prisma.whatsAppAccount.update({
            where: { id: whatsappAccount.id },
            data: {
              isCoexistence: true,
              coexistenceSyncStatus: 'pending',
              coexistenceSyncProgress: 0
            }
          })

          // Trigger contact sync (fire and forget - webhook will handle)
          wabaService.syncContacts(phoneNumbers[0].phoneNumberId, accessToken)
            .then(requestId => {
              logDetailedError(new Error('Contact sync started'), { requestId, level: 'info' })
              return prisma.coexistenceSyncStatus.create({
                data: {
                  userId: userId,
                  whatsappAccountId: whatsappAccount.id,
                  syncType: 'contacts',
                  status: 'in_progress',
                  requestId: requestId,
                  progress: 0
                }
              })
            })
            .catch(err => logDetailedError(err, { action: 'syncContacts' }))

          // Trigger history sync (fire and forget - webhook will handle)
          wabaService.syncHistory(phoneNumbers[0].phoneNumberId, accessToken)
            .then(requestId => {
              logDetailedError(new Error('History sync started'), { requestId, level: 'info' })
              return prisma.coexistenceSyncStatus.create({
                data: {
                  userId: userId,
                  whatsappAccountId: whatsappAccount.id,
                  syncType: 'history',
                  status: 'in_progress',
                  requestId: requestId,
                  progress: 0
                }
              })
            })
            .catch(err => logDetailedError(err, { action: 'syncHistory' }))
        }
      } catch (error) {
        logDetailedError(error, { action: 'checkCoexistenceStatus' })
        // Non-critical error, continue with normal flow
      }
    }

    // Configure webhooks
    let webhookStatus: 'connected' | 'partial' = 'connected'
    let webhookError: string | undefined

    try {
      const webhookConfig = await wabaService.configureWebhooks(
        wabaResources.wabaId,
        accessToken
      )

      await prisma.whatsAppAccount.update({
        where: { id: whatsappAccount.id },
        data: {
          webhookSubscribedAt: new Date(),
          webhookSubscribedEvents: webhookConfig.subscriptions
        }
      })
    } catch (error: any) {
      logDetailedError(error, { action: 'webhookConfiguration', path: c.req.path })

      const wabaError = createWebhookConfigError(error)
      webhookError = wabaError.message
      webhookStatus = 'partial'

      await prisma.whatsAppAccount.update({
        where: { id: whatsappAccount.id },
        data: {
          connectionStatus: 'partial'
        }
      })

      await prisma.wABAConnectionLog.create({
        data: {
          userId: userId,
          whatsappAccountId: whatsappAccount.id,
          action: 'webhook_config_failed',
          errorMessage: wabaError.message,
          details: {
            wabaId: wabaResources.wabaId,
            error: error.message,
            recoveryAction: wabaError.recoveryAction
          }
        }
      })
    }

    // Create connection log
    await prisma.wABAConnectionLog.create({
      data: {
        userId: userId,
        whatsappAccountId: whatsappAccount.id,
        action: 'connected',
        details: {
          wabaId: wabaResources.wabaId,
          wabaName: wabaResources.wabaName,
          phoneNumbers: wabaResources.phoneNumbers.map(pn => pn.displayPhoneNumber),
          expiresAt: expiresAt.toISOString()
        }
      }
    })

    // Audit log
    await auditLog(
      'WABA_CONNECTED',
      'User',
      userId,
      {
        wabaId: wabaResources.wabaId,
        wabaName: wabaResources.wabaName,
        phoneCount: phoneNumbers.length
      },
      userId
    )

    return c.json({
      success: true,
      data: {
        waba: {
          id: wabaResources.wabaId,
          name: wabaResources.wabaName,
          timezone: wabaResources.timezone,
          currency: wabaResources.currency,
          namespace: wabaResources.messageTemplateNamespace,
          status: webhookStatus,
          isCoexistence: isCoexistence
        },
        phoneNumbers: phoneNumbers.map(pn => ({
          id: pn.phoneNumberId,
          displayPhoneNumber: pn.displayPhoneNumber,
          verifiedName: pn.verifiedName,
          qualityRating: pn.qualityRating,
          isVerified: pn.isVerified,
          isPrimary: pn.isPrimary
        })),
        expiresAt: expiresAt.toISOString(),
        coexistence: isCoexistence ? {
          enabled: true,
          syncStatus: 'in_progress',
          message: 'Synchronizing contacts and message history from WhatsApp Business App'
        } : undefined,
        warnings: webhookError ? [{
          type: 'webhook_config_failed',
          message: webhookError,
          recoveryAction: 'Webhooks can be configured later from settings'
        }] : undefined
      }
    })
  } catch (error: any) {
    logDetailedError(error, { path: c.req.path, method: c.req.method, action: 'wabaCallback' })

    if (error instanceof WABAError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    const wabaError = new WABAError(
      WABAErrorCode.INTERNAL_ERROR,
      error.message || 'Failed to complete WABA signup',
      {
        statusCode: 500,
        retryable: isRetryableError(error),
        recoveryAction: 'Please try again or contact support if the issue persists',
        cause: error
      }
    )

    return c.json(wabaError.toJSON(), wabaError.statusCode as any)
  }
})

app.post('/callback', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const body = signupCallbackBodySchema.parse(await c.req.json())
    const url = new URL(c.req.url)
    url.searchParams.set('code', body.code)
    url.searchParams.set('state', body.state)
    if (body.providedWabaId) {
      url.searchParams.set('providedWabaId', body.providedWabaId)
    }

    const request = new Request(url.toString(), {
      method: 'GET',
      headers: c.req.raw.headers,
    })

    return app.fetch(request, c.env, c.executionCtx)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to complete WABA signup'
      }
    }, 500)
  }
})

export default app
