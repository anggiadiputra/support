import cron from 'node-cron'
import { prisma } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { PLAN_LIMITS } from '../config/plans.js'
import {
  MESSAGE_RETENTION_CATEGORY,
  TIER_BASED_ENABLED_KEY,
  TIER_BASED_ENABLED_AT_KEY,
  GRANDFATHERED_RETENTION_DAYS
} from '../config/message-retention.js'
import { notificationService } from '../services/notification-service.js'
import { SubscriptionTier } from '@prisma/client'

/**
 * Get message retention system settings
 */
async function getRetentionSettings(): Promise<{
  tierBasedEnabled: boolean
  tierBasedEnabledAt: Date | null
}> {
  const settings = await prisma.systemSetting.findMany({
    where: {
      category: MESSAGE_RETENTION_CATEGORY,
      key: {
        in: [TIER_BASED_ENABLED_KEY, TIER_BASED_ENABLED_AT_KEY]
      }
    }
  })

  const enabledSetting = settings.find(s => s.key === TIER_BASED_ENABLED_KEY)
  const enabledAtSetting = settings.find(s => s.key === TIER_BASED_ENABLED_AT_KEY)

  return {
    tierBasedEnabled: enabledSetting?.value === 'true',
    tierBasedEnabledAt: enabledAtSetting?.value ? new Date(enabledAtSetting.value) : null
  }
}

/**
 * Get retention days for a user based on their subscription tier
 */
function getRetentionDaysForTier(tier: string): number {
  const subscriptionTier = tier as SubscriptionTier
  const limits = PLAN_LIMITS[subscriptionTier]

  if (limits) {
    return limits.messageRetentionDays
  }

  // Default to FREE tier retention if tier not found
  return PLAN_LIMITS[SubscriptionTier.FREE].messageRetentionDays
}

/**
 * Soft-delete messages based on tier-based retention policy
 *
 * Logic:
 * 1. Check if tier_based_enabled is true in system settings
 * 2. If false, skip deletion (no messages deleted)
 * 3. If true, for each user with messages:
 *    - Get user's subscription tier
 *    - For messages BEFORE tier_based_enabled_at: use 30-day retention (grandfathered)
 *    - For messages AFTER tier_based_enabled_at: use tier-based retention
 * 4. Soft-delete expired messages (set deletedAt, clear content, mediaUrl)
 * 5. Create notification for users who had messages deleted
 */
export async function deleteOldMessages(): Promise<{
  totalDeleted: number
  usersAffected: number
}> {
  const result = {
    totalDeleted: 0,
    usersAffected: 0
  }

  try {
    // Step 1: Check if tier-based retention is enabled
    const { tierBasedEnabled, tierBasedEnabledAt } = await getRetentionSettings()

    if (!tierBasedEnabled) {
      logger.info('Tier-based message retention is disabled, skipping deletion')
      return result
    }

    if (!tierBasedEnabledAt) {
      logger.warn('Tier-based retention enabled but enabledAt timestamp not set, skipping deletion')
      return result
    }

    const now = new Date()

    // Step 2: Get all users who have messages that are not yet deleted
    const usersWithMessages = await prisma.user.findMany({
      where: {
        messages: {
          some: {
            deletedAt: null
          }
        }
      },
      select: {
        id: true,
        subscriptionTier: true
      }
    })

    // Step 3: Process each user
    for (const user of usersWithMessages) {
      const retentionDays = getRetentionDaysForTier(user.subscriptionTier)

      // Skip deletion if retention is unlimited (retentionDays <= 0)
      if (retentionDays <= 0) {
        logger.debug('Skipping deletion for user with unlimited retention', {
          userId: user.id,
          tier: user.subscriptionTier
        })
        continue
      }

      const tierBasedCutoffDate = new Date(now)
      tierBasedCutoffDate.setDate(tierBasedCutoffDate.getDate() - retentionDays)

      const grandfatheredCutoffDate = new Date(now)
      grandfatheredCutoffDate.setDate(grandfatheredCutoffDate.getDate() - GRANDFATHERED_RETENTION_DAYS)

      let userDeletedCount = 0

      // Delete messages created BEFORE tierBasedEnabledAt using grandfathered retention (30 days)
      const grandfatheredResult = await prisma.message.updateMany({
        where: {
          userId: user.id,
          deletedAt: null,
          createdAt: {
            lt: tierBasedEnabledAt, // Messages before tier-based was enabled
            lte: grandfatheredCutoffDate // Older than 30 days
          }
        },
        data: {
          deletedAt: now,
          content: null,
          mediaUrl: null
        }
      })
      userDeletedCount += grandfatheredResult.count

      // Delete messages created AFTER tierBasedEnabledAt using tier-based retention
      const tierBasedResult = await prisma.message.updateMany({
        where: {
          userId: user.id,
          deletedAt: null,
          createdAt: {
            gte: tierBasedEnabledAt, // Messages after tier-based was enabled
            lte: tierBasedCutoffDate // Older than tier retention days
          }
        },
        data: {
          deletedAt: now,
          content: null,
          mediaUrl: null
        }
      })
      userDeletedCount += tierBasedResult.count

      // Step 4: If user had messages deleted, update stats and create notification
      if (userDeletedCount > 0) {
        result.totalDeleted += userDeletedCount
        result.usersAffected++

        // Create retention notification for the user
        // Use 0 days until deletion since messages were just deleted
        await notificationService.createRetentionWarning(
          user.id,
          userDeletedCount,
          0 // Messages already deleted
        )

        logger.info('Deleted messages for user due to retention policy', {
          userId: user.id,
          tier: user.subscriptionTier,
          retentionDays,
          deletedCount: userDeletedCount
        })
      }
    }

    return result
  } catch (error) {
    logger.error('Error in deleteOldMessages', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })
    throw error
  }
}

/**
 * Cron job to delete messages based on tier-based retention policy
 * Runs daily at 2:00 AM
 */
export function startMessageDeletionJob() {
  // Run daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    try {
      logger.info('Starting message retention deletion job...')
      const result = await deleteOldMessages()

      if (result.totalDeleted > 0) {
        logger.info('Message retention deletion completed', {
          totalDeleted: result.totalDeleted,
          usersAffected: result.usersAffected
        })
      } else {
        logger.info('Message retention deletion completed - no messages to delete')
      }
    } catch (error) {
      logger.error('Error in message deletion cron job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })

  logger.info('Message deletion cron job started (runs daily at 2:00 AM)')
}
