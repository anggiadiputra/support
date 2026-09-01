/**
 * Admin Notifications Routes
 *
 * API endpoints for admin manual notification system
 * - GET /api/v1/admin/notifications/users/search - Search users for recipient selection
 * - POST /api/v1/admin/notifications/send - Send notification to selected users
 * - GET /api/v1/admin/notifications/history - Get notification history
 * - GET /api/v1/admin/notifications/history/:batchId - Get batch details
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { logger } from '../../utils/logger.js'
import { NotificationType, NotificationPriority, NotificationRecipientType, SubscriptionTier, Prisma } from '@prisma/client'

const app = new Hono()

// All routes require ADMIN role
app.use('/*', requireRole(['ADMIN']))

// Valid enum values
const VALID_NOTIFICATION_TYPES: NotificationType[] = [
  'MESSAGE_RETENTION',
  'SUBSCRIPTION_EXPIRY',
  'PAYMENT_STATUS',
  'API_KEY_EXPIRY',
  'SYSTEM_ANNOUNCEMENT',
  'MAINTENANCE',
  'PROMOTION',
  'CUSTOM'
]

const VALID_PRIORITIES: NotificationPriority[] = ['LOW', 'NORMAL', 'HIGH', 'URGENT']
const VALID_TIERS: SubscriptionTier[] = ['FREE', 'BASIC', 'LITE', 'PRO']

/**
 * GET /api/v1/admin/notifications/users/search
 * Search users for recipient selection
 *
 * Query params:
 * - q: search query (email/name)
 * - tier: SubscriptionTier filter (optional)
 * - limit: number (default 10)
 */
app.get('/users/search', async (c: Context) => {
  try {
    const query = c.req.query()
    const q = query.q || ''
    const tier = VALID_TIERS.includes(query.tier as SubscriptionTier) ? query.tier as SubscriptionTier : undefined
    const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10', 10) || 10))

    const users = await prisma.user.findMany({
      where: {
        AND: [
          q ? {
            OR: [
              { email: { contains: q, mode: 'insensitive' } },
              { name: { contains: q, mode: 'insensitive' } }
            ]
          } : {},
          tier ? { subscriptionTier: tier } : {},
          { isActive: true }
        ]
      },
      select: {
        id: true,
        email: true,
        name: true,
        subscriptionTier: true,
        role: true
      },
      take: limit,
      orderBy: { name: 'asc' }
    })

    return c.json({
      success: true,
      data: { users }
    })
  } catch (error) {
    logger.error('Failed to search users', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to search users'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/notifications/users/count
 * Get count of users by filter criteria (for preview)
 *
 * Query params:
 * - type: 'all' | 'by_tier'
 * - tiers: comma-separated tier names (for by_tier)
 */
app.get('/users/count', async (c: Context) => {
  try {
    const query = c.req.query()
    const type = query.type || 'all'
    const tiers = query.tiers ? query.tiers.split(',').filter(t => VALID_TIERS.includes(t as SubscriptionTier)) : []

    let count = 0

    if (type === 'all') {
      count = await prisma.user.count({
        where: { isActive: true }
      })
    } else if (type === 'by_tier' && tiers.length > 0) {
      count = await prisma.user.count({
        where: {
          isActive: true,
          subscriptionTier: { in: tiers }
        }
      })
    }

    return c.json({
      success: true,
      data: { count }
    })
  } catch (error) {
    logger.error('Failed to count users', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to count users'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/notifications/send
 * Send notification to selected users
 *
 * Body:
 * - recipients: { type: 'single' | 'multiple' | 'all' | 'by_tier', userIds?: string[], tiers?: string[] }
 * - notification: { title, message, type, priority, actionUrl?, actionLabel?, expiresAt? }
 */
app.post('/send', async (c: Context) => {
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

    // Validate recipients
    if (!body.recipients || !body.recipients.type) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'recipients.type is required'
        }
      }, 400)
    }

    const recipientType = body.recipients.type.toUpperCase() as NotificationRecipientType
    if (!['SINGLE', 'MULTIPLE', 'ALL', 'BY_TIER'].includes(recipientType)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'recipients.type must be one of: single, multiple, all, by_tier'
        }
      }, 400)
    }

    // Validate notification content
    if (!body.notification?.title || typeof body.notification.title !== 'string') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'notification.title is required'
        }
      }, 400)
    }

    if (body.notification.title.length > 100) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'notification.title must be 100 characters or less'
        }
      }, 400)
    }

    if (!body.notification?.message || typeof body.notification.message !== 'string') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'notification.message is required'
        }
      }, 400)
    }

    if (body.notification.message.length > 500) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'notification.message must be 500 characters or less'
        }
      }, 400)
    }

    const notificationType = (body.notification.type || 'CUSTOM').toUpperCase() as NotificationType
    if (!VALID_NOTIFICATION_TYPES.includes(notificationType)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `notification.type must be one of: ${VALID_NOTIFICATION_TYPES.join(', ')}`
        }
      }, 400)
    }

    const priority = (body.notification.priority || 'NORMAL').toUpperCase() as NotificationPriority
    if (!VALID_PRIORITIES.includes(priority)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `notification.priority must be one of: ${VALID_PRIORITIES.join(', ')}`
        }
      }, 400)
    }

    // Resolve recipient user IDs
    let userIds: string[] = []
    let recipientFilter: Prisma.InputJsonValue | null = null

    if (recipientType === 'SINGLE' || recipientType === 'MULTIPLE') {
      if (!Array.isArray(body.recipients.userIds) || body.recipients.userIds.length === 0) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'recipients.userIds is required for single/multiple type'
          }
        }, 400)
      }
      userIds = body.recipients.userIds
      recipientFilter = { userIds }
    } else if (recipientType === 'ALL') {
      const users = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true }
      })
      userIds = users.map(u => u.id)
    } else if (recipientType === 'BY_TIER') {
      if (!Array.isArray(body.recipients.tiers) || body.recipients.tiers.length === 0) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'recipients.tiers is required for by_tier type'
          }
        }, 400)
      }
      const tiers = body.recipients.tiers.filter((t: string) => VALID_TIERS.includes(t as SubscriptionTier))
      if (tiers.length === 0) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: `recipients.tiers must include valid tiers: ${VALID_TIERS.join(', ')}`
          }
        }, 400)
      }
      const users = await prisma.user.findMany({
        where: {
          isActive: true,
          subscriptionTier: { in: tiers }
        },
        select: { id: true }
      })
      userIds = users.map(u => u.id)
      recipientFilter = { tiers }
    }

    if (userIds.length === 0) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'No recipients found matching the criteria'
        }
      }, 400)
    }

    // Parse expiresAt if provided
    let expiresAt: Date | null = null
    if (body.notification.expiresAt) {
      expiresAt = new Date(body.notification.expiresAt)
      if (isNaN(expiresAt.getTime())) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'notification.expiresAt must be a valid date'
          }
        }, 400)
      }
    }

    // Create notification batch
    const batch = await prisma.notificationBatch.create({
      data: {
        title: body.notification.title,
        message: body.notification.message,
        type: notificationType,
        priority,
        actionUrl: body.notification.actionUrl || null,
        actionLabel: body.notification.actionLabel || null,
        expiresAt,
        recipientType,
        recipientFilter,
        recipientCount: userIds.length,
        sentBy: adminId
      }
    })

    // Create notifications for all recipients (batch insert)
    const notificationData = userIds.map(userId => ({
      userId,
      type: notificationType,
      title: body.notification.title,
      message: body.notification.message,
      priority,
      actionUrl: body.notification.actionUrl || null,
      actionLabel: body.notification.actionLabel || null,
      expiresAt,
      batchId: batch.id
    }))

    await prisma.notification.createMany({
      data: notificationData
    })

    logger.info('Admin notification sent', {
      adminId,
      batchId: batch.id,
      recipientType,
      recipientCount: userIds.length,
      notificationType
    })

    return c.json({
      success: true,
      data: {
        notificationBatchId: batch.id,
        recipientCount: userIds.length,
        sentAt: batch.sentAt.toISOString()
      },
      message: `Notification sent to ${userIds.length} users`
    })
  } catch (error) {
    logger.error('Failed to send admin notification', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to send notification'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/notifications/history
 * Get notification history with pagination
 *
 * Query params:
 * - page: number (default 1)
 * - limit: number (default 20)
 * - type: NotificationType (optional filter)
 * - from: ISO date (optional)
 * - to: ISO date (optional)
 * - search: string (search title)
 */
app.get('/history', async (c: Context) => {
  try {
    const query = c.req.query()
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20))
    const skip = (page - 1) * limit

    const type = VALID_NOTIFICATION_TYPES.includes(query.type as NotificationType)
      ? query.type as NotificationType
      : undefined

    const search = query.search || undefined

    // Build date filters
    const dateFilters: { sentAt?: { gte?: Date; lte?: Date } } = {}
    if (query.from) {
      const fromDate = new Date(query.from)
      if (!isNaN(fromDate.getTime())) {
        dateFilters.sentAt = { ...dateFilters.sentAt, gte: fromDate }
      }
    }
    if (query.to) {
      const toDate = new Date(query.to)
      if (!isNaN(toDate.getTime())) {
        dateFilters.sentAt = { ...dateFilters.sentAt, lte: toDate }
      }
    }

    // Build where clause
    const where = {
      ...(type ? { type } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
      ...dateFilters
    }

    // Query batches and total count in parallel
    const [batches, total] = await Promise.all([
      prisma.notificationBatch.findMany({
        where,
        orderBy: { sentAt: 'desc' },
        skip,
        take: limit,
        include: {
          admin: {
            select: {
              id: true,
              email: true,
              name: true
            }
          }
        }
      }),
      prisma.notificationBatch.count({ where })
    ])

    return c.json({
      success: true,
      data: {
        items: batches.map(batch => ({
          id: batch.id,
          title: batch.title,
          message: batch.message,
          type: batch.type,
          priority: batch.priority,
          recipientType: batch.recipientType,
          recipientCount: batch.recipientCount,
          sentAt: batch.sentAt.toISOString(),
          sentBy: {
            id: batch.admin.id,
            email: batch.admin.email,
            name: batch.admin.name
          }
        })),
        total,
        page,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    logger.error('Failed to get notification history', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get notification history'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/notifications/history/:batchId
 * Get details of a notification batch
 */
app.get('/history/:batchId', async (c: Context) => {
  try {
    const batchId = c.req.param('batchId')

    const batch = await prisma.notificationBatch.findUnique({
      where: { id: batchId },
      include: {
        admin: {
          select: {
            id: true,
            email: true,
            name: true
          }
        },
        notifications: {
          select: {
            id: true,
            userId: true,
            isRead: true,
            readAt: true,
            user: {
              select: {
                id: true,
                email: true,
                name: true
              }
            }
          }
        }
      }
    })

    if (!batch) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Notification batch not found'
        }
      }, 404)
    }

    // Calculate stats
    const readCount = batch.notifications.filter(n => n.isRead).length
    const unreadCount = batch.notifications.length - readCount

    return c.json({
      success: true,
      data: {
        batch: {
          id: batch.id,
          title: batch.title,
          message: batch.message,
          type: batch.type,
          priority: batch.priority,
          actionUrl: batch.actionUrl,
          actionLabel: batch.actionLabel,
          expiresAt: batch.expiresAt?.toISOString() || null,
          recipientType: batch.recipientType,
          recipientFilter: batch.recipientFilter,
          recipientCount: batch.recipientCount,
          sentAt: batch.sentAt.toISOString(),
          sentBy: {
            id: batch.admin.id,
            email: batch.admin.email,
            name: batch.admin.name
          }
        },
        recipients: batch.notifications.map(n => ({
          userId: n.user.id,
          email: n.user.email,
          name: n.user.name,
          isRead: n.isRead,
          readAt: n.readAt?.toISOString() || null
        })),
        stats: {
          total: batch.notifications.length,
          read: readCount,
          unread: unreadCount
        }
      }
    })
  } catch (error) {
    logger.error('Failed to get notification batch details', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get notification batch details'
      }
    }, 500)
  }
})

export default app
