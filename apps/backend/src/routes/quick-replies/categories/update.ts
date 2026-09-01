import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { quickReplyService, QUICK_REPLY_ERRORS } from '../../../services/quick-reply-service.js'
import { logger } from '../../../utils/logger.js'

const app = new Hono()

const updateCategorySchema = z.object({
  name: z.string().min(1).max(50).optional(),
  order: z.number().int().min(0).optional()
})

// PATCH /api/v1/quick-replies/categories/:id - Update category
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
    const parseResult = updateCategorySchema.safeParse(body)

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

    const category = await quickReplyService.updateCategory(c.user.id, id, {
      name: data.name,
      order: data.order
    })

    return c.json({
      success: true,
      data: category
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

    if (errorMessage === QUICK_REPLY_ERRORS.CATEGORY_NAME_EXISTS) {
      return c.json({
        error: {
          code: 'Conflict',
          message: errorMessage
        }
      }, 409)
    }

    if (errorMessage === QUICK_REPLY_ERRORS.CATEGORY_NAME_TOO_LONG) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: errorMessage
        }
      }, 400)
    }

    logger.error('Update category error:', { error: errorMessage })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to update category'
      }
    }, 500)
  }
})

export default app
