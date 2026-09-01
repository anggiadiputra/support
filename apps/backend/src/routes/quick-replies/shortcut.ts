import { Hono } from 'hono'
import type { Context } from 'hono'
import { quickReplyService } from '../../services/quick-reply-service.js'
import { logger } from '../../utils/logger.js'

const app = new Hono()

// GET /api/v1/quick-replies/shortcut/:shortcut - Get quick reply by shortcut
app.get('/:shortcut', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const shortcut = c.req.param('shortcut')
    const quickReply = await quickReplyService.getQuickReplyByShortcut(c.user.id, shortcut)

    if (!quickReply) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Quick reply not found'
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: quickReply
    })
  } catch (error) {
    logger.error('Get quick reply by shortcut error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to get quick reply'
      }
    }, 500)
  }
})

export default app
