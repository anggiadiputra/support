import { Hono } from 'hono'
import type { Context } from 'hono'
import { AdminAuditService } from '../../services/admin/audit-service.js'

const app = new Hono()

/**
 * GET /api/v1/admin/audit
 * Get paginated audit logs with filters
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
app.get('/', async (c: Context) => {
  try {
    const query = c.req.query()

    // Parse and validate query parameters
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
    const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20', 10) || 20))
    const action = query.action || undefined
    const userId = query.userId || undefined
    const entityType = query.entityType || undefined
    const startDate = query.startDate || undefined
    const endDate = query.endDate || undefined
    const search = query.search || undefined

    // Validate date formats if provided
    if (startDate && isNaN(new Date(startDate).getTime())) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'startDate must be a valid date string'
        }
      }, 400)
    }

    if (endDate && isNaN(new Date(endDate).getTime())) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'endDate must be a valid date string'
        }
      }, 400)
    }

    const result = await AdminAuditService.getAuditLogs({
      page,
      limit,
      action,
      userId,
      entityType,
      startDate,
      endDate,
      search
    })

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin get audit logs error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch audit logs'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/audit/actions
 * Get distinct action types for filter dropdown
 */
app.get('/actions', async (c: Context) => {
  try {
    const actions = await AdminAuditService.getActionTypes()
    return c.json({
      success: true,
      data: actions
    })
  } catch (error) {
    console.error('Admin get audit actions error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch action types'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/audit/entities
 * Get distinct entity types for filter dropdown
 */
app.get('/entities', async (c: Context) => {
  try {
    const entities = await AdminAuditService.getEntityTypes()
    return c.json({
      success: true,
      data: entities
    })
  } catch (error) {
    console.error('Admin get audit entities error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch entity types'
      }
    }, 500)
  }
})

export default app
