import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// GET /api/v1/customers/export - Export customers to CSV
app.get('/export', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = getEffectiveUserId(c)

    // Optional channel filter
    const channel = (c.req.query('channel') || '').toLowerCase()
    const allowedChannels = ['whatsapp', 'instagram', 'messenger'] as const
    const isChannelFilter = allowedChannels.includes(channel as any)

    // Optional explicit ids (comma-separated)
    const idsParam = c.req.query('ids')
    const ids = idsParam
      ? idsParam.split(',').map(id => id.trim()).filter(Boolean)
      : []

    const where: any = { userId }

    if (ids.length > 0) {
      where.id = { in: ids }
    }

    if (isChannelFilter) {
      if (channel === 'whatsapp') {
        where.phoneNumber = { not: '' }
      } else if (channel === 'instagram') {
        where.instagramUsername = { not: null }
      } else if (channel === 'messenger') {
        where.messengerConversations = { some: {} }
      }
    }

    const customers = await prisma.customer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        messengerConversations: { select: { id: true }, take: 1 }
      }
    })

    // If ids filter was provided and none found, return empty CSV politely
    if (ids.length > 0 && customers.length === 0) {
      return c.text('Phone Number,Name,Consent Status,Consent Source,Blacklisted,Channels,Created At\n', 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="customers-${isChannelFilter ? channel : 'all'}-${new Date().toISOString().split('T')[0]}.csv"`
      })
    }

    // Generate CSV
    const csvHeaders = 'Phone Number,Name,Consent Status,Consent Source,Blacklisted,Channels,Created At\n'
    const csvRows = customers.map(c => {
      const channels: string[] = []
      if (c.phoneNumber) channels.push('whatsapp')
      if (c.instagramUsername) channels.push('instagram')
      if (c.messengerConversations && c.messengerConversations.length > 0) channels.push('messenger')
      const channelLabel = channels.length ? channels.join('|') : 'unknown'

      return `${c.phoneNumber},"${c.name || ''}",${c.consentStatus ? 'Yes' : 'No'},"${c.consentSource || ''}",${c.blacklisted ? 'Yes' : 'No'},${channelLabel},${c.createdAt.toISOString()}`
    }).join('\n')

    const csv = csvHeaders + csvRows

    await auditLog('CUSTOMERS_EXPORTED', 'Customer', userId, {
      count: customers.length,
      exportedBy: c.user.id,
      channel: isChannelFilter ? channel : 'all'
    }, c.user.id)

    return c.text(csv, 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="customers-${isChannelFilter ? channel : 'all'}-${new Date().toISOString().split('T')[0]}.csv"`
    })
  } catch (error) {
    console.error('Export customers error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to export customers' } }, 500)
  }
})

export default app
