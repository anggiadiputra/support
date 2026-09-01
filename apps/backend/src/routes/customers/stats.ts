import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// GET /api/v1/customers/stats - Get customer statistics
// Supports filtering by whatsappPhoneNumberId for multi-number accounts
app.get('/stats', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // Use effectiveUserId for agents to access business owner's customers
    const userId = getEffectiveUserId(c)

    // Build base where clause
    const baseWhere: any = { userId }

    // Filter by WhatsApp phone number if provided
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId')
    if (whatsappPhoneNumberId) {
      baseWhere.whatsappPhoneNumberId = whatsappPhoneNumberId
    } else {
      // If no specific phone number, only count customers from connected WhatsApp accounts
      const connectedPhoneNumbers = await prisma.phoneNumber.findMany({
        where: {
          whatsappAccount: {
            userId,
            connectionStatus: 'connected'
          }
        },
        select: { id: true }
      })
      const connectedPhoneNumberIds = connectedPhoneNumbers.map(p => p.id)
      
      if (connectedPhoneNumberIds.length > 0) {
        baseWhere.whatsappPhoneNumberId = { in: connectedPhoneNumberIds }
      }
    }

    // Get all stats in parallel for performance
    const [total, consented, activeWindow, blacklisted] = await Promise.all([
      // Total customers
      prisma.customer.count({
        where: baseWhere
      }),
      // Consented customers
      prisma.customer.count({
        where: { ...baseWhere, consentStatus: true }
      }),
      // Active messaging window (24h)
      prisma.customer.count({
        where: { ...baseWhere, isWindowActive: true }
      }),
      // Blacklisted customers
      prisma.customer.count({
        where: { ...baseWhere, blacklisted: true }
      }),
    ])

    return c.json({
      success: true,
      data: {
        total,
        consented,
        activeWindow,
        blacklisted,
      }
    })
  } catch (error) {
    console.error('Get customer stats error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch customer stats' } }, 500)
  }
})

export default app
