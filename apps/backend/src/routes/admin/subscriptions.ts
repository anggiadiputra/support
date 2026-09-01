import { Hono } from 'hono'
import type { Context } from 'hono'
import { AdminSubscriptionService } from '../../services/admin/subscription-service.js'
import type { SubscriptionTier, SubscriptionStatus } from '@prisma/client'

const app = new Hono()

// Valid enum values
const VALID_TIERS: SubscriptionTier[] = ['FREE', 'BASIC', 'LITE', 'PRO']
const VALID_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED']

/**
 * GET /api/v1/admin/subscriptions/stats
 * Get subscription statistics by tier counts
 * Requirements: 4.1
 */
app.get('/stats', async (c: Context) => {
  try {
    const stats = await AdminSubscriptionService.getSubscriptionStats()

    return c.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Admin subscription stats error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch subscription statistics'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/subscriptions/pending
 * Get list of subscriptions with pending payment status
 * Requirements: 4.2
 */
app.get('/pending', async (c: Context) => {
  try {
    const pendingPayments = await AdminSubscriptionService.getPendingPayments()

    return c.json({
      success: true,
      data: pendingPayments
    })
  } catch (error) {
    console.error('Admin pending payments error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch pending payments'
      }
    }, 500)
  }
})


/**
 * GET /api/v1/admin/subscriptions/expiring
 * Get list of subscriptions expiring within 30 days
 * Requirements: 4.3
 */
app.get('/expiring', async (c: Context) => {
  try {
    const query = c.req.query()
    const days = Math.min(90, Math.max(1, parseInt(query.days || '30', 10) || 30))
    
    const expiringSubscriptions = await AdminSubscriptionService.getExpiringSubscriptions(days)

    return c.json({
      success: true,
      data: expiringSubscriptions
    })
  } catch (error) {
    console.error('Admin expiring subscriptions error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch expiring subscriptions'
      }
    }, 500)
  }
})

/**
 * PATCH /api/v1/admin/subscriptions/users/:id
 * Update user subscription
 * Requirements: 4.4, 4.5
 */
app.patch('/users/:id', async (c: Context) => {
  try {
    const userId = c.req.param('id')
    const body = await c.req.json()
    
    // Validate request body
    const updateData: {
      tier?: SubscriptionTier
      status?: SubscriptionStatus
      endDate?: string
      notes?: string
    } = {}
    
    if (body.tier !== undefined) {
      if (!VALID_TIERS.includes(body.tier)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: `tier must be one of: ${VALID_TIERS.join(', ')}`
          }
        }, 400)
      }
      updateData.tier = body.tier
    }
    
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: `status must be one of: ${VALID_STATUSES.join(', ')}`
          }
        }, 400)
      }
      updateData.status = body.status
    }
    
    if (body.endDate !== undefined) {
      const date = new Date(body.endDate)
      if (isNaN(date.getTime())) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'endDate must be a valid date string'
          }
        }, 400)
      }
      updateData.endDate = body.endDate
    }
    
    if (body.notes !== undefined) {
      if (typeof body.notes !== 'string') {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'notes must be a string'
          }
        }, 400)
      }
      updateData.notes = body.notes
    }
    
    // Get admin user ID from context (set by auth middleware)
    const adminUserId = c.get('userId') as string || (c as any).user?.id

    const result = await AdminSubscriptionService.updateSubscription(userId, updateData, adminUserId)

    if (!result.success) {
      return c.json({
        error: {
          code: 'NotFound',
          message: result.error
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: result.subscription
    })
  } catch (error) {
    console.error('Admin update subscription error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update subscription'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/subscriptions/users/:id/approve
 * Approve a pending payment
 * Requirements: 4.4
 */
app.post('/users/:id/approve', async (c: Context) => {
  try {
    const userId = c.req.param('id')
    const body = await c.req.json().catch(() => ({}))
    
    // Get admin user ID from context (set by auth middleware)
    const adminUserId = c.get('userId') as string || (c as any).user?.id

    const result = await AdminSubscriptionService.approvePayment(
      userId,
      adminUserId,
      body.notes
    )

    if (!result.success) {
      const statusCode = result.error === 'Subscription not found' ? 404 : 400
      return c.json({
        error: {
          code: statusCode === 404 ? 'NotFound' : 'ValidationError',
          message: result.error
        }
      }, statusCode)
    }

    return c.json({
      success: true,
      data: result.subscription
    })
  } catch (error) {
    console.error('Admin approve payment error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to approve payment'
      }
    }, 500)
  }
})

export default app
