import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// Apply context resolution middleware
// This ensures agents can view their business owner's templates
// Requirements: 6.1
app.use('*', resolveContext)

// GET /api/v1/templates/:id - Get single template
app.get('/:id', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const id = c.req.param('id')

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          }
        },
        templateQualityLogs: {
          orderBy: {
            measuredAt: 'desc'
          },
          take: 10
        },
        _count: {
          select: {
            messages: true
          }
        }
      }
    })

    if (!template) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Template not found'
        }
      }, 404)
    }

    // Check access - allow if admin or if template belongs to effective user (business owner)
    // For agents, effectiveUserId is their business owner's ID
    // Requirements: 6.1
    if (c.user?.role !== 'ADMIN' && userId !== template.userId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied'
        }
      }, 403)
    }

    return c.json({
      success: true,
      data: template
    })
  } catch (error) {
    console.error('Get template error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch template'
      }
    }, 500)
  }
})

export default app
