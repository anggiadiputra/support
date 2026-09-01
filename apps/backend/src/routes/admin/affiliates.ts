/**
 * Admin Affiliate Routes
 *
 * API endpoints for managing affiliates and commissions (admin only)
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { affiliateService } from '../../services/affiliate-service.js'
import { logger } from '../../utils/logger.js'
import type { AffiliateTier, AffiliateCommissionStatus } from '@prisma/client'

const app = new Hono()

// Valid enum values
const VALID_TIERS: AffiliateTier[] = ['STANDARD', 'SILVER', 'GOLD', 'PLATINUM']
const VALID_COMMISSION_STATUSES: AffiliateCommissionStatus[] = ['PENDING', 'CREDITED', 'CANCELLED']

/**
 * GET /api/v1/admin/affiliates
 * List all affiliates with filters
 */
app.get('/', async (c: Context) => {
  try {
    const query = c.req.query()

    // Parse and validate query parameters
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20))
    const search = query.search || undefined

    // Parse isActive filter (boolean)
    let isActive: boolean | undefined
    if (query.isActive === 'true') {
      isActive = true
    } else if (query.isActive === 'false') {
      isActive = false
    }

    const result = await affiliateService.listAffiliates({
      page,
      limit,
      search,
      isActive
    })

    return c.json({
      success: true,
      data: {
        affiliates: result.affiliates,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit)
        }
      }
    })
  } catch (error) {
    logger.error('Admin list affiliates error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch affiliates'
      }
    }, 500)
  }
})

/**
 * PATCH /api/v1/admin/affiliates/:id
 * Update affiliate settings
 */
app.patch('/:id', async (c: Context) => {
  try {
    const affiliateId = c.req.param('id')
    const body = await c.req.json()

    // Validate request body
    const updateData: {
      tier?: AffiliateTier
      isActive?: boolean
      customCommission?: number | null
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

    if (body.customCommission !== undefined) {
      // Allow null to clear custom commission
      if (body.customCommission !== null) {
        if (typeof body.customCommission !== 'number' || body.customCommission < 0 || body.customCommission > 100) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: 'customCommission must be a number between 0 and 100, or null'
            }
          }, 400)
        }
      }
      updateData.customCommission = body.customCommission
    }

    // Get admin user ID from context
    const adminUserId = c.get('userId') as string || (c as any).user?.id
    if (!adminUserId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const result = await affiliateService.updateAffiliate(affiliateId, updateData, adminUserId)

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error('Admin update affiliate error:', { error: message })

    if (message === 'Affiliate not found') {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Affiliate not found'
        }
      }, 404)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update affiliate'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/affiliates/commissions
 * List all commissions (admin view)
 */
app.get('/commissions', async (c: Context) => {
  try {
    const query = c.req.query()

    // Parse and validate query parameters
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20))
    const affiliateId = query.affiliateId || undefined
    const status = VALID_COMMISSION_STATUSES.includes(query.status as AffiliateCommissionStatus)
      ? (query.status as AffiliateCommissionStatus)
      : undefined

    const result = await affiliateService.listCommissions({
      page,
      limit,
      affiliateId,
      status
    })

    return c.json({
      success: true,
      data: {
        commissions: result.commissions,
        pagination: {
          page,
          limit,
          total: result.total,
          totalPages: Math.ceil(result.total / limit)
        }
      }
    })
  } catch (error) {
    logger.error('Admin list commissions error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch commissions'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/affiliates/commissions/:id/release
 * Release commission early (admin action)
 */
app.post('/commissions/:id/release', async (c: Context) => {
  try {
    const commissionId = c.req.param('id')

    // Get admin user ID from context
    const adminUserId = c.get('userId') as string || (c as any).user?.id
    if (!adminUserId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const result = await affiliateService.releaseCommission(commissionId, adminUserId)

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error('Admin release commission error:', { error: message })

    if (message === 'Commission not found') {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Commission not found'
        }
      }, 404)
    }

    if (message.startsWith('Commission is already')) {
      return c.json({
        error: {
          code: 'BadRequest',
          message
        }
      }, 400)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to release commission'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/affiliates/commissions/:id/cancel
 * Cancel pending commission
 */
app.post('/commissions/:id/cancel', async (c: Context) => {
  try {
    const commissionId = c.req.param('id')

    // Get admin user ID from context
    const adminUserId = c.get('userId') as string || (c as any).user?.id
    if (!adminUserId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const result = await affiliateService.cancelCommission(commissionId, adminUserId)

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown'
    logger.error('Admin cancel commission error:', { error: message })

    if (message === 'Commission not found') {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Commission not found'
        }
      }, 404)
    }

    if (message.startsWith('Cannot cancel commission')) {
      return c.json({
        error: {
          code: 'BadRequest',
          message
        }
      }, 400)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to cancel commission'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/affiliates/settings
 * Get affiliate system settings
 */
app.get('/settings', async (c: Context) => {
  try {
    const config = await affiliateService.getConfig()

    return c.json({
      success: true,
      data: config
    })
  } catch (error) {
    logger.error('Admin get affiliate settings error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch affiliate settings'
      }
    }, 500)
  }
})

/**
 * PUT /api/v1/admin/affiliates/settings
 * Update affiliate system settings
 */
app.put('/settings', async (c: Context) => {
  try {
    const body = await c.req.json()

    // Validate request body
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Request body must be a non-empty object'
        }
      }, 400)
    }

    const updateData: {
      isEnabled?: boolean
      holdingPeriodDays?: number
      commissionPercentage?: number
      referredUserBonusEnabled?: boolean
      referredUserBonusAmount?: number
    } = {}

    if (body.isEnabled !== undefined) {
      if (typeof body.isEnabled !== 'boolean') {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'isEnabled must be a boolean'
          }
        }, 400)
      }
      updateData.isEnabled = body.isEnabled
    }

    if (body.holdingPeriodDays !== undefined) {
      if (typeof body.holdingPeriodDays !== 'number' || body.holdingPeriodDays < 0 || body.holdingPeriodDays > 365) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'holdingPeriodDays must be a number between 0 and 365'
          }
        }, 400)
      }
      updateData.holdingPeriodDays = body.holdingPeriodDays
    }

    if (body.commissionPercentage !== undefined) {
      if (typeof body.commissionPercentage !== 'number' || body.commissionPercentage < 0 || body.commissionPercentage > 100) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'commissionPercentage must be a number between 0 and 100'
          }
        }, 400)
      }
      updateData.commissionPercentage = body.commissionPercentage
    }

    if (body.referredUserBonusEnabled !== undefined) {
      if (typeof body.referredUserBonusEnabled !== 'boolean') {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'referredUserBonusEnabled must be a boolean'
          }
        }, 400)
      }
      updateData.referredUserBonusEnabled = body.referredUserBonusEnabled
    }

    if (body.referredUserBonusAmount !== undefined) {
      if (typeof body.referredUserBonusAmount !== 'number' || body.referredUserBonusAmount < 0) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'referredUserBonusAmount must be a non-negative number'
          }
        }, 400)
      }
      updateData.referredUserBonusAmount = body.referredUserBonusAmount
    }

    // Get admin user ID from context
    const adminUserId = c.get('userId') as string || (c as any).user?.id
    if (!adminUserId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const result = await affiliateService.updateConfig(updateData, adminUserId)

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    logger.error('Admin update affiliate settings error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update affiliate settings'
      }
    }, 500)
  }
})

export default app
