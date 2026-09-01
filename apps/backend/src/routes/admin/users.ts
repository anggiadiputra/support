import { Hono } from 'hono'
import type { Context } from 'hono'
import { AdminUserService } from '../../services/admin/user-service.js'
import type { Role, SubscriptionTier, SubscriptionStatus } from '@prisma/client'

const app = new Hono()

// Valid enum values
const VALID_ROLES: Role[] = ['ADMIN', 'BUSINESS_OWNER', 'AGENT']
const VALID_TIERS: SubscriptionTier[] = ['FREE', 'BASIC', 'LITE', 'PRO']
const VALID_STATUSES: SubscriptionStatus[] = ['ACTIVE', 'PENDING_PAYMENT', 'EXPIRED', 'CANCELLED']

/**
 * GET /api/v1/admin/users
 * List users with pagination, search, and filters
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
app.get('/', async (c: Context) => {
  try {
    const query = c.req.query()
    
    // Parse and validate query parameters
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20))
    const search = query.search || undefined
    const role = VALID_ROLES.includes(query.role as Role) ? query.role as Role : undefined
    const tier = VALID_TIERS.includes(query.tier as SubscriptionTier) ? query.tier as SubscriptionTier : undefined
    const status = ['active', 'inactive'].includes(query.status) ? query.status as 'active' | 'inactive' : undefined

    const result = await AdminUserService.listUsers({
      page,
      limit,
      search,
      role,
      tier,
      status
    })

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin list users error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch users'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/users/stats
 * Get user statistics for dashboard
 */
app.get('/stats', async (c: Context) => {
  try {
    const result = await AdminUserService.getUserStats()

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin get user stats error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch user statistics'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/users/:id
 * Get detailed user information
 * Requirements: 3.5
 */
app.get('/:id', async (c: Context) => {
  try {
    const userId = c.req.param('id')
    
    const result = await AdminUserService.getUserDetail(userId)

    if (!result) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'User not found'
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin get user detail error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch user details'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/users/:id/activity
 * Get paginated activity logs for a specific user
 */
app.get('/:id/activity', async (c: Context) => {
  try {
    const userId = c.req.param('id')
    const query = c.req.query()

    const result = await AdminUserService.getUserActivity(userId, {
      page: parseInt(query.page || '1', 10) || 1,
      limit: Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20)),
      category: query.category || undefined,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined
    })

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin get user activity error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch user activity'
      }
    }, 500)
  }
})

/**
 * PATCH /api/v1/admin/users/:id
 * Update user status and role
 * Requirements: 3.6
 */
app.patch('/:id', async (c: Context) => {
  try {
    const userId = c.req.param('id')
    const body = await c.req.json()
    
    // Validate request body
    const updateData: { isActive?: boolean; role?: Role } = {}
    
    if (body.isActive !== undefined) {
      if (typeof body.isActive !== 'boolean') {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'isActive must be a boolean'
          }
        }, 400)
      }
      updateData.isActive = body.isActive
    }
    
    if (body.role !== undefined) {
      if (!VALID_ROLES.includes(body.role)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: `role must be one of: ${VALID_ROLES.join(', ')}`
          }
        }, 400)
      }
      updateData.role = body.role
    }
    
    // Get admin user ID from context (set by auth middleware)
    const adminUserId = c.get('userId') as string || c.user?.id

    const result = await AdminUserService.updateUser(userId, updateData, adminUserId)

    if (!result) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'User not found'
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin update user error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update user'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/users/bulk
 * Bulk update multiple users (activate/deactivate)
 */
app.post('/bulk', async (c: Context) => {
  try {
    const body = await c.req.json()
    
    // Validate request body
    if (!Array.isArray(body.userIds) || body.userIds.length === 0) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'userIds must be a non-empty array'
        }
      }, 400)
    }

    if (body.userIds.length > 100) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Cannot update more than 100 users at once'
        }
      }, 400)
    }

    if (!['activate', 'deactivate'].includes(body.action)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'action must be either "activate" or "deactivate"'
        }
      }, 400)
    }

    const adminUserId = c.get('userId') as string || c.user?.id

    const result = await AdminUserService.bulkUpdateUsers(
      body.userIds,
      body.action,
      adminUserId
    )

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin bulk update users error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to bulk update users'
      }
    }, 500)
  }
})

/**
 * PATCH /api/v1/admin/users/:id/subscription
 * Update user subscription
 * Requirements: 3.7
 */
app.patch('/:id/subscription', async (c: Context) => {
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
    const adminUserId = c.get('userId') as string || c.user?.id

    const result = await AdminUserService.updateSubscription(userId, updateData, adminUserId)

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

export default app
