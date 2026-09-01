import { Hono } from 'hono'
import type { Context } from 'hono'
import { quickReplyService, QUICK_REPLY_ERRORS } from '../../../services/quick-reply-service.js'
import { logger } from '../../../utils/logger.js'

const app = new Hono()

// DELETE /api/v1/quick-replies/categories/:id - Delete category
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

    await quickReplyService.deleteCategory(c.user.id, id)

    return c.json({
      success: true,
      message: 'Category deleted successfully'
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown'

    // Handle known service errors
    if (errorMessage === QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND) {
      return c.json({
        error: {
          code: 'NotFound',
          message: errorMessage
        }
      }, 404)
    }

    logger.error('Delete category error:', { error: errorMessage })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to delete category'
      }
    }, 500)
  }
})

export default app
