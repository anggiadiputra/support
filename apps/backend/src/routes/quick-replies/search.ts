import { Hono } from 'hono'
import type { Context } from 'hono'
import { quickReplyService } from '../../services/quick-reply-service.js'
import { logger } from '../../utils/logger.js'

const app = new Hono()

// GET /api/v1/quick-replies/search - Search quick replies (autocomplete)
app.get('/search', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const query = c.req.query('q') || ''

    if (!query.trim()) {
      return c.json({
        success: true,
        data: []
      })
    }

    const quickReplies = await quickReplyService.searchQuickReplies(c.user.id, query)

    // Return simplified data for autocomplete
    const results = quickReplies.map(qr => ({
      id: qr.id,
      shortcut: qr.shortcut,
      title: qr.title,
      content: qr.content
    }))

    return c.json({
      success: true,
      data: results
    })
  } catch (error) {
    logger.error('Search quick replies error:', { error: error instanceof Error ? error.message : 'Unknown' })
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to search quick replies'
      }
    }, 500)
  }
})

export default app
