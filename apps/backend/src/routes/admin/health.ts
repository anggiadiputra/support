import { Hono } from 'hono'
import type { Context } from 'hono'
import { AdminHealthService } from '../../services/admin/health-service.js'

const app = new Hono()

/**
 * GET /api/v1/admin/health
 * Get system health status
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
app.get('/', async (c: Context) => {
  try {
    const health = await AdminHealthService.getSystemHealth()

    // Return appropriate HTTP status based on health
    const httpStatus = health.overall === 'healthy' ? 200 
      : health.overall === 'degraded' ? 200 
      : 503

    return c.json({
      success: true,
      data: health
    }, httpStatus)
  } catch (error) {
    console.error('Admin health check error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to check system health'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/health/database
 * Get database health only
 */
app.get('/database', async (c: Context) => {
  try {
    const health = await AdminHealthService.checkDatabase()

    return c.json({
      success: true,
      data: health
    }, health.status === 'healthy' ? 200 : 503)
  } catch (error) {
    console.error('Database health check error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to check database health'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/health/redis
 * Get Redis health only
 */
app.get('/redis', async (c: Context) => {
  try {
    const health = await AdminHealthService.checkRedis()

    return c.json({
      success: true,
      data: health
    }, health.status === 'healthy' ? 200 : 503)
  } catch (error) {
    console.error('Redis health check error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to check Redis health'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/health/queues
 * Get queue statistics
 */
app.get('/queues', async (c: Context) => {
  try {
    const stats = await AdminHealthService.getQueueStats()

    return c.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Queue stats error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get queue statistics'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/health/webhooks
 * Get webhook delivery statistics
 */
app.get('/webhooks', async (c: Context) => {
  try {
    const stats = await AdminHealthService.getWebhookStats()

    return c.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Webhook stats error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get webhook statistics'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/health/failed-jobs
 * Get failed jobs from all queues
 */
app.get('/failed-jobs', async (c: Context) => {
  try {
    const limit = parseInt(c.req.query('limit') || '20', 10)
    const result = await AdminHealthService.getFailedJobs(Math.min(limit, 100))

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Failed jobs error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get failed jobs'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/health/failed-jobs/:queue/:jobId/retry
 * Retry a failed job
 */
app.post('/failed-jobs/:queue/:jobId/retry', async (c: Context) => {
  try {
    const queue = c.req.param('queue')
    const jobId = c.req.param('jobId')

    if (!['webhook', 'message', 'webhookOutbound'].includes(queue)) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Invalid queue name. Must be: webhook, message, or webhookOutbound'
        }
      }, 400)
    }

    await AdminHealthService.retryFailedJob(queue as 'webhook' | 'message' | 'webhookOutbound', jobId)

    return c.json({
      success: true,
      message: 'Job retry initiated'
    })
  } catch (error) {
    console.error('Retry job error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to retry job'
      }
    }, 500)
  }
})

/**
 * DELETE /api/v1/admin/health/failed-jobs/:queue/:jobId
 * Delete a failed job
 */
app.delete('/failed-jobs/:queue/:jobId', async (c: Context) => {
  try {
    const queue = c.req.param('queue')
    const jobId = c.req.param('jobId')

    if (!['webhook', 'message', 'webhookOutbound'].includes(queue)) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Invalid queue name. Must be: webhook, message, or webhookOutbound'
        }
      }, 400)
    }

    await AdminHealthService.deleteFailedJob(queue as 'webhook' | 'message' | 'webhookOutbound', jobId)

    return c.json({
      success: true,
      message: 'Job deleted'
    })
  } catch (error) {
    console.error('Delete job error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to delete job'
      }
    }, 500)
  }
})

/**
 * DELETE /api/v1/admin/health/failed-jobs
 * Delete all failed jobs from all queues
 */
app.delete('/failed-jobs', async (c: Context) => {
  try {
    await AdminHealthService.deleteAllFailedJobs()

    return c.json({
      success: true,
      message: 'All failed jobs deleted'
    })
  } catch (error) {
    console.error('Delete all jobs error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to delete all failed jobs'
      }
    }, 500)
  }
})

export default app
