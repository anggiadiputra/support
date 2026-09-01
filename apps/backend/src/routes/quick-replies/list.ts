import { Hono } from 'hono'
import type { Context } from 'hono'
import { quickReplyService } from '../../services/quick-reply-service.js'
import { logger } from '../../utils/logger.js'

const app = new Hono()

// GET /api/v1/quick-replies - List quick replies
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

    const categoryId = c.req.query('categoryId')
    const search = c.req.query('search')

    const quickReplies = await quickReplyService.listQuickReplies(c.user.id, {
      categoryId: categoryId || undefined,
      search: search || undefined
    })

    return c.json({
      success: true,
      data: quickReplies
    })
  } catch (error) {
    logger.error('List quick replies error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to list quick replies'
      }
    }, 500)
  }
})

export default app
