import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../utils/database.js'
import { getSubscription } from '../middleware/subscription.js'
import { PLAN_LIMITS } from '../config/plans.js'
import { adminSubscriptionPlansService, type PlanTier } from '../services/admin/subscription-plans-service.js'
import { SubscriptionTier, SubscriptionStatus } from '@prisma/client'
import { logger } from '../utils/logger.js'

const app = new Hono()

// Inactive subscription statuses that should be treated as FREE tier
const INACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.CANCELLED,
  SubscriptionStatus.PENDING_PAYMENT
]

/**
 * Get the effective tier for a user, treating inactive subscriptions as FREE
 */
function getEffectiveTier(status: SubscriptionStatus, tier: SubscriptionTier): SubscriptionTier {
  if (INACTIVE_STATUSES.includes(status)) {
    return SubscriptionTier.FREE
  }
  return tier
}

/**
 * GET /api/v1/subscription
 * Get current user's subscription details, limits, and usage
 * 
 * Requirements: 6.1 - Return tier, status, expiresAt
 * Requirements: 6.2 - Include feature flags (aiChatbot, apiAccess, webhooksEnabled)
 * Requirements: 6.3 - Include numeric limits (maxKnowledgeDocs, maxAgents, maxApiKeys, maxWebhookEndpoints)
 * Requirements: 6.4 - Include current usage counts for each limited resource
 * Requirements: 6.5 - Return subscription expiry date if applicable
 * Requirements: 6.6 - Include channel limits (maxWhatsappDevices, maxInstagramAccounts, maxMessengerAccounts)
 */
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401)
    }

    const userId = c.user.id

    // Get subscription data (uses caching)
    const subscription = await getSubscription(userId)
    const effectiveTier = getEffectiveTier(subscription.status, subscription.tier)
    const limits = PLAN_LIMITS[effectiveTier]
    
    // Get channel limits and numeric limits from admin-configurable settings (or fall back to hardcoded defaults)
    const planTier = effectiveTier.toLowerCase() as PlanTier
    const [channelLimits, numericLimits] = await Promise.all([
      adminSubscriptionPlansService.getChannelLimits(planTier),
      adminSubscriptionPlansService.getNumericLimits(planTier)
    ])

    // Query current usage counts in parallel (including channel usage)
    const [
      knowledgeDocsCount, 
      agentsCount, 
      apiKeysCount, 
      webhookEndpointsCount,
      whatsappDevicesCount,
      instagramAccountsCount,
      messengerAccountsCount
    ] = await Promise.all([
      prisma.knowledgeDocument.count({ where: { userId } }),
      prisma.aIAgent.count({ where: { userId } }),
      prisma.apiKey.count({ where: { userId, revokedAt: null } }),
      prisma.webhookEndpoint.count({ where: { userId } }),
      // Count connected WhatsApp devices (phone numbers from connected WABA accounts)
      prisma.phoneNumber.count({ 
        where: { 
          whatsappAccount: { 
            userId,
            connectionStatus: 'connected'
          }
        }
      }),
      // Count connected Instagram accounts
      prisma.instagramAccount.count({ 
        where: { 
          userId,
          connectionStatus: 'connected'
        }
      }),
      // Count connected Messenger pages
      prisma.facebookPage.count({ 
        where: { 
          userId,
          connectionStatus: 'connected'
        }
      })
    ])

    // Handle endDate - could be Date object or string from DB
    const expiresAt = subscription.endDate 
      ? (subscription.endDate instanceof Date 
          ? subscription.endDate.toISOString() 
          : String(subscription.endDate))
      : null;

    return c.json({
      success: true,
      data: {
        tier: effectiveTier,
        status: subscription.status,
        expiresAt,
        
        features: {
          aiChatbot: limits.aiChatbot,
          apiAccess: limits.apiAccess,
          webhooksEnabled: limits.webhooksEnabled,
        },
        
        limits: {
          maxKnowledgeDocs: numericLimits.maxKnowledgeDocs,
          maxAgents: numericLimits.maxAgents,
          maxApiKeys: numericLimits.maxApiKeys,
          maxWebhookEndpoints: numericLimits.maxWebhookEndpoints,
        },
        
        usage: {
          knowledgeDocs: knowledgeDocsCount,
          agents: agentsCount,
          apiKeys: apiKeysCount,
          webhookEndpoints: webhookEndpointsCount,
        },

        // Channel limits (admin-configurable)
        channelLimits: {
          maxWhatsappDevices: channelLimits.maxWhatsappDevices,
          maxInstagramAccounts: channelLimits.maxInstagramAccounts,
          maxMessengerAccounts: channelLimits.maxMessengerAccounts,
        },

        // Channel usage
        channelUsage: {
          whatsappDevices: whatsappDevicesCount,
          instagramAccounts: instagramAccountsCount,
          messengerAccounts: messengerAccountsCount,
        },
      },
    })
  } catch (error: any) {
    logger.error('Get subscription error:', error)

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to get subscription details',
      },
    }, 500)
  }
})

export default app
