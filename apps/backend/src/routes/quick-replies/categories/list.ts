import { Hono } from 'hono'
import type { Context } from 'hono'
import { quickReplyService } from '../../../services/quick-reply-service.js'
import { logger } from '../../../utils/logger.js'

const app = new Hono()

// GET /api/v1/quick-replies/categories - List categories
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const categories = await quickReplyService.listCategories(c.user.id)

    return c.json({
      success: true,
      data: categories
    })
  } catch (error) {
    logger.error('List categories error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to list categories'
      }
    }, 500)
  }
})

export default app
