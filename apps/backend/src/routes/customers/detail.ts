import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// GET /api/v1/customers/:id - Get single customer
app.get('/:id', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const id = c.req.param('id')

    const customer = await prisma.customer.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true, email: true }
        },
        consentLogs: {
          orderBy: { timestamp: 'desc' }
        },
        messages: {
          orderBy: { timestamp: 'desc' },
          take: 50
        },
        // CRM Includes
        pipelineStage: true,
        customFields: {
          include: { fieldDefinition: true }
        },
        activities: {
          orderBy: { timestamp: 'desc' },
          take: 20
        },
        customerNotes: {
          include: {
            creator: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    if (!customer) {
      return c.json({ error: { code: 'NotFound', message: 'Customer not found' } }, 404)
    }

    // Use effectiveUserId for agents to access business owner's customers
    // Requirements: 5.3, 6.2
    const effectiveUserId = getEffectiveUserId(c)

    // Check access - allow if admin or if customer belongs to effective user
    if (c.user.role !== 'ADMIN' && effectiveUserId !== customer.userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Transform database fields to match frontend schema
    const transformedCustomer = {
      ...customer,
      // Map database boolean consentStatus to frontend string enum
      consentStatus: customer.consentStatus ? 'CONSENTED' : 'NOT_CONSENTED',
      // Map database field names to frontend expected names
      lastMessageAt: customer.lastInboundMessageAt,
      hasActiveWindow: customer.isWindowActive,
      // Transform notes to match frontend schema
      notes: customer.customerNotes.map(note => ({
        id: note.id,
        content: note.content,
        createdAt: note.createdAt,
        createdBy: note.creator.name || note.creator.email
      }))
    }

    return c.json({ success: true, data: transformedCustomer })
  } catch (error) {
    console.error('Get customer error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch customer' } }, 500)
  }
})

export default app
