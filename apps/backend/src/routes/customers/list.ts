import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// GET /api/v1/customers - List customers
// Only returns customers from connected WhatsApp accounts
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // Use effectiveUserId for agents to access business owner's customers
    // Requirements: 5.3, 6.2
    const userId = getEffectiveUserId(c)

    // Get phone numbers from connected WhatsApp accounts only
    const includeDisconnected = c.req.query('includeDisconnected') === 'true'
    
    let connectedPhoneNumberIds: string[] = []
    if (!includeDisconnected) {
      const connectedPhoneNumbers = await prisma.phoneNumber.findMany({
        where: {
          whatsappAccount: {
            userId,
            connectionStatus: 'connected'
          }
        },
        select: { id: true }
      })
      connectedPhoneNumberIds = connectedPhoneNumbers.map(p => p.id)
    }

    const where: any = { userId }

    // Filter by WhatsApp phone number (multi-number support)
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId')
    if (whatsappPhoneNumberId) {
      // Specific phone number selected - show ONLY customers for that number
      where.whatsappPhoneNumberId = whatsappPhoneNumberId
    } else if (!includeDisconnected && connectedPhoneNumberIds.length > 0) {
      // "All Accounts" selected - show customers from all connected phone numbers
      // Also include legacy customers without whatsappPhoneNumberId for backward compatibility
      where.OR = [
        { whatsappPhoneNumberId: { in: connectedPhoneNumberIds } },
        { whatsappPhoneNumberId: null }
      ]
    } else if (!includeDisconnected && connectedPhoneNumberIds.length === 0) {
      // No connected accounts - only show customers without whatsappPhoneNumberId
      // (Instagram, Messenger, or legacy customers)
      where.whatsappPhoneNumberId = null
    }

    // Filter by consent status
    const consentStatus = c.req.query('consentStatus')
    if (consentStatus !== undefined) {
      where.consentStatus = consentStatus === 'true'
    }

    // Filter by blacklisted
    const blacklisted = c.req.query('blacklisted')
    if (blacklisted !== undefined) {
      where.blacklisted = blacklisted === 'true'
    }

    const customers = await prisma.customer.findMany({
      where,
      include: {
        pipelineStage: true,
        messengerConversations: { select: { id: true }, take: 1 },
        customerNotes: {
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true
              }
            }
          },
          orderBy: {
            createdAt: 'desc'
          }
        },
        // TODO: Uncomment when CustomerCustomField table is created via migration
        // customFields: {
        //   include: { fieldDefinition: true }
        // },
        _count: {
          select: {
            messages: true,
            consentLogs: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    // Transform database fields to match frontend schema
    const transformedCustomers = customers.map(customer => ({
      ...customer,
      // Map database boolean consentStatus to frontend string enum
      consentStatus: customer.consentStatus ? 'CONSENTED' : 'NOT_CONSENTED',
      // Map database field names to frontend expected names
      lastMessageAt: customer.lastInboundMessageAt,
      hasActiveWindow: customer.isWindowActive
    }))

    return c.json({ success: true, data: transformedCustomers })
  } catch (error) {
    console.error('List customers error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch customers' } }, 500)
  }
})

export default app
