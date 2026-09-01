/**
 * Admin Message Retention Settings Routes
 *
 * API endpoints for managing message retention settings
 * - GET /api/v1/admin/settings/message-retention - Get current settings
 * - PUT /api/v1/admin/settings/message-retention - Update settings
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { logger } from '../../utils/logger.js'
import {
  MESSAGE_RETENTION_CATEGORY,
  TIER_BASED_ENABLED_KEY,
  TIER_BASED_ENABLED_AT_KEY
} from '../../config/message-retention.js'
import { deleteOldMessages } from '../../cron/deleteOldMessages.js'
import { notificationService } from '../../services/notification-service.js'

const app = new Hono()

// All routes require ADMIN role
app.use('/*', requireRole(['ADMIN']))

/**
 * GET /api/v1/admin/settings/message-retention
 * Get current message retention settings
 *
 * Returns:
 * - enabled: boolean - Whether tier-based retention is enabled
 * - enabledAt: string | null - ISO timestamp when tier-based retention was enabled
 */
app.get('/', async (c: Context) => {
  try {
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

    return c.json({
      success: true,
      data: {
        enabled: enabledSetting?.value === 'true',
        enabledAt: enabledAtSetting?.value || null
      }
    })
  } catch (error) {
    logger.error('Failed to get message retention settings', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch message retention settings'
      }
    }, 500)
  }
})

/**
 * PUT /api/v1/admin/settings/message-retention
 * Update message retention settings
 *
 * Body:
 * - enabled: boolean - Whether to enable tier-based retention
 * - enabledAt: string - ISO timestamp when tier-based retention is enabled
 */
app.put('/', async (c: Context) => {
  try {
    const body = await c.req.json()

    // Validate request body
    if (typeof body.enabled !== 'boolean') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'enabled must be a boolean'
        }
      }, 400)
    }

    if (body.enabled && typeof body.enabledAt !== 'string') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'enabledAt must be a valid ISO timestamp string when enabling retention'
        }
      }, 400)
    }

    // Validate enabledAt is a valid date if provided
    if (body.enabledAt) {
      const parsedDate = new Date(body.enabledAt)
      if (isNaN(parsedDate.getTime())) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'enabledAt must be a valid ISO timestamp'
          }
        }, 400)
      }

      // Prevent future dates - enabledAt should be now or in the past
      if (parsedDate > new Date()) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'enabledAt cannot be a future date. Use current or past date.'
          }
        }, 400)
      }
    }

    // Get admin user ID
    const adminId = c.user?.id
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    // Upsert tier_based_enabled setting
    await prisma.systemSetting.upsert({
      where: {
        category_key: {
          category: MESSAGE_RETENTION_CATEGORY,
          key: TIER_BASED_ENABLED_KEY
        }
      },
      update: {
        value: body.enabled.toString(),
        updatedBy: adminId
      },
      create: {
        category: MESSAGE_RETENTION_CATEGORY,
        key: TIER_BASED_ENABLED_KEY,
        value: body.enabled.toString(),
        isSensitive: false,
        updatedBy: adminId
      }
    })

    // Upsert tier_based_enabled_at setting (only if enabling or value provided)
    if (body.enabledAt) {
      await prisma.systemSetting.upsert({
        where: {
          category_key: {
            category: MESSAGE_RETENTION_CATEGORY,
            key: TIER_BASED_ENABLED_AT_KEY
          }
        },
        update: {
          value: body.enabledAt,
          updatedBy: adminId
        },
        create: {
          category: MESSAGE_RETENTION_CATEGORY,
          key: TIER_BASED_ENABLED_AT_KEY,
          value: body.enabledAt,
          isSensitive: false,
          updatedBy: adminId
        }
      })
    }

    logger.info('Message retention settings updated', {
      adminId,
      enabled: body.enabled,
      enabledAt: body.enabledAt
    })

    return c.json({
      success: true,
      message: 'Message retention settings updated successfully'
    })
  } catch (error) {
    logger.error('Failed to update message retention settings', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update message retention settings'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/settings/message-retention/preview
 * Preview what messages would be deleted without actually deleting them
 *
 * Returns stats about messages that would be affected by the retention policy
 */
app.get('/preview', async (c: Context) => {
  try {
    // Get retention settings
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

    const tierBasedEnabled = enabledSetting?.value === 'true'
    const tierBasedEnabledAt = enabledAtSetting?.value ? new Date(enabledAtSetting.value) : null

    if (!tierBasedEnabled) {
      return c.json({
        success: true,
        data: {
          enabled: false,
          message: 'Tier-based retention is disabled',
          preview: []
        }
      })
    }

    if (!tierBasedEnabledAt) {
      return c.json({
        success: true,
        data: {
          enabled: true,
          enabledAt: null,
          message: 'Tier-based retention enabled but no activation date set',
          preview: []
        }
      })
    }

    const now = new Date()

    // Get all users with messages
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
        email: true,
        name: true,
        subscriptionTier: true,
        _count: {
          select: {
            messages: {
              where: { deletedAt: null }
            }
          }
        }
      }
    })

    // PLAN_LIMITS for retention days
    // Database tiers: FREE, BASIC, LITE, PRO
    const PLAN_RETENTION: Record<string, number> = {
      FREE: 7,        // Free tier: 7 days
      BASIC: 30,      // Basic tier: 30 days
      LITE: 90,       // Lite tier: 90 days
      PRO: -1         // Pro tier: unlimited (never delete)
    }
    const PLAN_DISPLAY_NAMES: Record<string, string> = {
      FREE: 'Free',
      BASIC: 'Basic',
      LITE: 'Lite',
      PRO: 'Pro'
    }
    const GRANDFATHERED_DAYS = 30

    const preview = []

    for (const user of usersWithMessages) {
      const retentionDays = PLAN_RETENTION[user.subscriptionTier] ?? 7
      const tierDisplayName = PLAN_DISPLAY_NAMES[user.subscriptionTier] || user.subscriptionTier

      // Enterprise tier (-1) = indefinite retention, skip tier-based deletion
      const hasIndefiniteRetention = retentionDays === -1

      const tierBasedCutoffDate = new Date(now)
      if (!hasIndefiniteRetention) {
        tierBasedCutoffDate.setDate(tierBasedCutoffDate.getDate() - retentionDays)
      }

      const grandfatheredCutoffDate = new Date(now)
      grandfatheredCutoffDate.setDate(grandfatheredCutoffDate.getDate() - GRANDFATHERED_DAYS)

      // Count messages that would be deleted (grandfathered - before enabledAt)
      const grandfatheredCount = await prisma.message.count({
        where: {
          userId: user.id,
          deletedAt: null,
          createdAt: {
            lt: tierBasedEnabledAt,
            lte: grandfatheredCutoffDate
          }
        }
      })

      // Count messages that would be deleted (tier-based - after enabledAt)
      // Enterprise tier users have indefinite retention, so no tier-based deletion
      const tierBasedCount = hasIndefiniteRetention ? 0 : await prisma.message.count({
        where: {
          userId: user.id,
          deletedAt: null,
          createdAt: {
            gte: tierBasedEnabledAt,
            lte: tierBasedCutoffDate
          }
        }
      })

      const totalToDelete = grandfatheredCount + tierBasedCount

      // Get oldest and newest message dates for debugging
      const oldestMessage = await prisma.message.findFirst({
        where: { userId: user.id, deletedAt: null },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true }
      })
      const newestMessage = await prisma.message.findFirst({
        where: { userId: user.id, deletedAt: null },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true }
      })

      if (totalToDelete > 0 || user._count.messages > 0) {
        preview.push({
          userId: user.id,
          email: user.email,
          name: user.name,
          tier: tierDisplayName,
          tierCode: user.subscriptionTier,
          retentionDays: hasIndefiniteRetention ? null : retentionDays,
          retentionLabel: hasIndefiniteRetention ? 'Indefinite' : `${retentionDays} days`,
          totalMessages: user._count.messages,
          toDeleteGrandfathered: grandfatheredCount,
          toDeleteTierBased: tierBasedCount,
          totalToDelete,
          cutoffDates: {
            grandfathered: grandfatheredCutoffDate.toISOString(),
            tierBased: hasIndefiniteRetention ? null : tierBasedCutoffDate.toISOString()
          },
          messageDates: {
            oldest: oldestMessage?.createdAt?.toISOString() || null,
            newest: newestMessage?.createdAt?.toISOString() || null
          }
        })
      }
    }

    // Sort by totalToDelete desc
    preview.sort((a, b) => b.totalToDelete - a.totalToDelete)

    return c.json({
      success: true,
      data: {
        enabled: true,
        enabledAt: tierBasedEnabledAt.toISOString(),
        now: now.toISOString(),
        summary: {
          usersWithMessages: usersWithMessages.length,
          usersWithDeletions: preview.filter(p => p.totalToDelete > 0).length,
          totalMessagesToDelete: preview.reduce((sum, p) => sum + p.totalToDelete, 0)
        },
        preview: preview.slice(0, 50) // Limit to first 50 users
      }
    })
  } catch (error) {
    logger.error('Failed to preview message retention', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to preview message retention'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/settings/message-retention/run
 * Manually trigger the message retention cron job
 *
 * This is useful for testing without waiting for the scheduled 2:00 AM run
 */
app.post('/run', async (c: Context) => {
  try {
    const adminId = c.user?.id
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    logger.info('Manual message retention job triggered', { adminId })

    // Run the deletion job
    const result = await deleteOldMessages()

    logger.info('Manual message retention job completed', {
      adminId,
      totalDeleted: result.totalDeleted,
      usersAffected: result.usersAffected
    })

    return c.json({
      success: true,
      data: {
        totalDeleted: result.totalDeleted,
        usersAffected: result.usersAffected
      },
      message: result.totalDeleted > 0
        ? `Deleted ${result.totalDeleted} messages for ${result.usersAffected} users`
        : 'No messages to delete'
    })
  } catch (error) {
    logger.error('Failed to run message retention job manually', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to run message retention job'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/settings/message-retention/test-notification
 * Send a test retention notification to a specific user
 *
 * Body:
 * - userId: string - The user ID to send the notification to
 * - messageCount: number (optional) - Number of messages in the notification (default: 10)
 * - daysUntilDeletion: number (optional) - Days until deletion in the notification (default: 3)
 */
app.post('/test-notification', async (c: Context) => {
  try {
    const adminId = c.user?.id
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const body = await c.req.json()

    // Validate userId
    if (!body.userId || typeof body.userId !== 'string') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'userId is required'
        }
      }, 400)
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: body.userId },
      select: { id: true, email: true, name: true }
    })

    if (!user) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'User not found'
        }
      }, 404)
    }

    const messageCount = body.messageCount || 10
    const daysUntilDeletion = body.daysUntilDeletion ?? 3

    // Send test notification
    await notificationService.createRetentionWarning(
      body.userId,
      messageCount,
      daysUntilDeletion
    )

    logger.info('Test retention notification sent', {
      adminId,
      targetUserId: body.userId,
      messageCount,
      daysUntilDeletion
    })

    return c.json({
      success: true,
      message: `Test notification sent to ${user.email || user.name || body.userId}`,
      data: {
        userId: body.userId,
        messageCount,
        daysUntilDeletion
      }
    })
  } catch (error) {
    logger.error('Failed to send test notification', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to send test notification'
      }
    }, 500)
  }
})

export default app
