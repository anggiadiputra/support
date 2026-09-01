import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { quickReplyService, QUICK_REPLY_ERRORS } from '../../services/quick-reply-service.js'
import { logger } from '../../utils/logger.js'

const app = new Hono()

const updateQuickReplySchema = z.object({
  categoryId: z.string().nullable().optional(),
  shortcut: z.string().min(1).max(50).optional(),
  title: z.string().min(1).max(100).optional(),
  content: z.string().min(1).max(4096).optional()
})

// PATCH /api/v1/quick-replies/:id - Update quick reply
app.patch('/:id', async (c: Context) => {
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
    const body = await c.req.json()
    const parseResult = updateQuickReplySchema.safeParse(body)

    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues.map(e => e.message).join(', ')
      return c.json({
        error: {
          code: 'ValidationError',
          message: errorMessage || 'Invalid input'
        }
      }, 400)
    }

    const data = parseResult.data

    const quickReply = await quickReplyService.updateQuickReply(c.user.id, id, {
      categoryId: data.categoryId,
      shortcut: data.shortcut,
      title: data.title,
      content: data.content
    })

    return c.json({
      success: true,
      data: quickReply
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

    if (errorMessage === QUICK_REPLY_ERRORS.SHORTCUT_EXISTS) {
      return c.json({
        error: {
          code: 'Conflict',
          message: errorMessage
        }
      }, 409)
    }

    if (errorMessage === QUICK_REPLY_ERRORS.CATEGORY_NOT_FOUND) {
      return c.json({
        error: {
          code: 'NotFound',
          message: errorMessage
        }
      }, 404)
    }

    if (
      errorMessage === QUICK_REPLY_ERRORS.INVALID_SHORTCUT_FORMAT ||
      errorMessage === QUICK_REPLY_ERRORS.SHORTCUT_TOO_LONG ||
      errorMessage === QUICK_REPLY_ERRORS.TITLE_TOO_LONG ||
      errorMessage === QUICK_REPLY_ERRORS.CONTENT_TOO_LONG
    ) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: errorMessage
        }
      }, 400)
    }

    logger.error('Update quick reply error:', { error: errorMessage })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to update quick reply'
      }
    }, 500)
  }
})

export default app
