import { Hono } from 'hono'
import type { Context } from 'hono'
import { quickReplyService, QUICK_REPLY_ERRORS } from '../../services/quick-reply-service.js'
import { logger } from '../../utils/logger.js'

const app = new Hono()

// DELETE /api/v1/quick-replies/:id - Delete quick reply
app.delete('/:id', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const id = c.req.param('id')

    await quickReplyService.deleteQuickReply(c.user.id, id)

    return c.json({
      success: true,
      message: 'Quick reply deleted successfully'
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown'

    // Handle known service errors
    if (errorMessage === QUICK_REPLY_ERRORS.QUICK_REPLY_NOT_FOUND) {
      return c.json({
        error: {
          code: 'NotFound',
          message: errorMessage
        }
      }, 404)
    }

    logger.error('Delete quick reply error:', { error: errorMessage })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to delete quick reply'
      }
    }, 500)
  }
})

export default app
