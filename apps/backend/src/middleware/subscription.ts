import { Context } from 'hono'
import { prisma } from '../utils/database.js'
import { PLAN_LIMITS } from '../config/plans.js'
import { SubscriptionTier, SubscriptionStatus, Prisma } from '@prisma/client'
import { adminSubscriptionPlansService, type PlanTier } from '../services/admin/subscription-plans-service.js'

// Transaction client type for Prisma interactive transactions
type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>

// Type definitions for feature checking
export type BooleanFeature = 'aiChatbot' | 'apiAccess' | 'webhooksEnabled'
export type NumericLimit = 'maxKnowledgeDocs' | 'maxAgents' | 'maxApiKeys' | 'maxWebhookEndpoints'

// Inactive subscription statuses that should be treated as FREE tier
const INACTIVE_STATUSES: SubscriptionStatus[] = [
  SubscriptionStatus.EXPIRED,
  SubscriptionStatus.CANCELLED,
  SubscriptionStatus.PENDING_PAYMENT
]

interface SubscriptionData {
  tier: SubscriptionTier
  status: SubscriptionStatus
  endDate: Date | null
}

/**
 * Get subscription data for a user
 * No caching - subscription data must always be fresh for accurate billing/feature access
 */
export async function getSubscription(userId: string): Promise<SubscriptionData> {
  const subscription = await prisma.subscription.findUnique({
    where: { userId }
  })

  if (!subscription) {
    // Default to FREE if no subscription record exists
    return {
      tier: SubscriptionTier.FREE,
      status: SubscriptionStatus.ACTIVE,
      endDate: null
    }
  }

  return {
    tier: subscription.tier,
    status: subscription.status,
    endDate: subscription.endDate
  }
}


/**
 * Get the effective tier for a user, treating inactive subscriptions as FREE
 */
function getEffectiveTier(subscription: SubscriptionData): SubscriptionTier {
  if (INACTIVE_STATUSES.includes(subscription.status)) {
    return SubscriptionTier.FREE
  }
  return subscription.tier
}

/**
 * Convert SubscriptionTier enum to PlanTier string for admin service
 */
function tierToPlanTier(tier: SubscriptionTier): PlanTier {
  return tier.toLowerCase() as PlanTier
}

/**
 * Get numeric limit for a resource, with admin config taking priority over static config
 */
async function getNumericLimit(tier: SubscriptionTier, resource: NumericLimit): Promise<number> {
  try {
    // Try to get from admin-configurable limits first
    const numericLimits = await adminSubscriptionPlansService.getNumericLimits(tierToPlanTier(tier))
    
    // Map resource to numericLimits field
    switch (resource) {
      case 'maxAgents':
        return numericLimits.maxAgents
      case 'maxKnowledgeDocs':
        return numericLimits.maxKnowledgeDocs
      case 'maxApiKeys':
        return numericLimits.maxApiKeys
      case 'maxWebhookEndpoints':
        return numericLimits.maxWebhookEndpoints
      default:
        // Fallback to static config
        return PLAN_LIMITS[tier][resource]
    }
  } catch {
    // Fallback to static config if admin service fails
    return PLAN_LIMITS[tier][resource]
  }
}

/**
 * Find the minimum tier required for a feature
 */
function getRequiredTierForFeature(feature: BooleanFeature): SubscriptionTier {
  // Check tiers in order from lowest to highest
  const tiers: SubscriptionTier[] = [SubscriptionTier.FREE, SubscriptionTier.LITE, SubscriptionTier.PRO]
  
  for (const tier of tiers) {
    if (PLAN_LIMITS[tier][feature] === true) {
      return tier
    }
  }
  
  return SubscriptionTier.PRO // Default to highest tier if not found
}

export async function checkFeatureAccess(userId: string, feature: BooleanFeature) {
  const subscription = await getSubscription(userId)
  const effectiveTier = getEffectiveTier(subscription)
  const limits = PLAN_LIMITS[effectiveTier]
  
  return limits[feature] === true
}

export async function checkUsageLimit(
  userId: string, 
  resource: NumericLimit
): Promise<{ allowed: boolean; limit: number; current: number }> {
  const subscription = await getSubscription(userId)
  const effectiveTier = getEffectiveTier(subscription)
  
  // Get limit from admin config (with fallback to static config)
  const limit = await getNumericLimit(effectiveTier, resource)
  
  let current = 0
  
  switch (resource) {
    case 'maxKnowledgeDocs':
      current = await prisma.knowledgeDocument.count({
        where: { userId }
      })
      break
    case 'maxAgents':
      current = await prisma.aIAgent.count({
        where: { userId }
      })
      break
    case 'maxApiKeys':
      current = await prisma.apiKey.count({
        where: { 
          userId,
          revokedAt: null // Only count active (non-revoked) keys
        }
      })
      break
    case 'maxWebhookEndpoints':
      current = await prisma.webhookEndpoint.count({
        where: { userId }
      })
      break
  }

  return {
    allowed: current < limit,
    limit,
    current
  }
}

/**
 * Atomic check-and-create for resources with limits.
 * Uses a transaction with SERIALIZABLE isolation to prevent race conditions (TOCTOU).
 * Returns the created resource or throws an error if limit exceeded.
 */
export async function checkAndCreateWithLimit<T>(
  userId: string,
  resource: NumericLimit,
  createFn: (tx: TransactionClient) => Promise<T>
): Promise<{ success: true; data: T } | { success: false; error: string; limit: number; current: number }> {
  const subscription = await getSubscription(userId)
  const effectiveTier = getEffectiveTier(subscription)
  
  // Get limit from admin config (with fallback to static config)
  const limit = await getNumericLimit(effectiveTier, resource)

  try {
    // Use interactive transaction with serializable isolation
    const result = await prisma.$transaction(async (tx) => {
      let current = 0

      switch (resource) {
        case 'maxKnowledgeDocs':
          current = await tx.knowledgeDocument.count({ where: { userId } })
          break
        case 'maxAgents':
          current = await tx.aIAgent.count({ where: { userId } })
          break
        case 'maxApiKeys':
          current = await tx.apiKey.count({ where: { userId, revokedAt: null } })
          break
        case 'maxWebhookEndpoints':
          current = await tx.webhookEndpoint.count({ where: { userId } })
          break
      }

      if (current >= limit) {
        throw new Error(`LIMIT_EXCEEDED:${limit}:${current}`)
      }

      // Create the resource within the same transaction
      return await createFn(tx)
    }, {
      isolationLevel: 'Serializable', // Prevents concurrent reads during transaction
      timeout: 10000, // 10 second timeout
    })

    return { success: true, data: result }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('LIMIT_EXCEEDED:')) {
      const [, limitStr, currentStr] = error.message.split(':')
      return {
        success: false,
        error: `You have reached the maximum limit (${limitStr}) for your plan.`,
        limit: parseInt(limitStr, 10),
        current: parseInt(currentStr, 10),
      }
    }
    throw error
  }
}


export function requireFeature(feature: BooleanFeature) {
  return async (c: Context, next: () => Promise<void>) => {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const subscription = await getSubscription(c.user.id)
    const effectiveTier = getEffectiveTier(subscription)
    const hasAccess = PLAN_LIMITS[effectiveTier][feature] === true

    if (!hasAccess) {
      const requiredTier = getRequiredTierForFeature(feature)
      
      return c.json({ 
        error: { 
          code: 'SubscriptionRequired', 
          message: `This feature requires a ${requiredTier} or higher subscription.`,
          requiredTier,
          currentTier: effectiveTier,
          upgradeUrl: '/settings/billing'
        } 
      }, 403)
    }

    await next()
  }
}

/**
 * Invalidate subscription cache for a user
 * No-op since caching was removed - kept for backward compatibility with callers
 */
export async function invalidateSubscriptionCache(_userId: string): Promise<void> {
  // No-op: caching removed to ensure subscription changes reflect immediately
}
