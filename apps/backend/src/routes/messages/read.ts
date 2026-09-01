import { Hono } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { WhatsAppAPI } from '../../utils/whatsapp.js'
import { resolveCredentialsForSending } from '../../utils/whatsapp-account-helper.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { eventEmitter } from '../../websocket/index.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

const markAsReadSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
})

/**
 * POST /messages/read
 * Mark all unread messages from a customer as read
 * This is called when user opens a chat in the inbox
 */
app.post('/', async (c) => {
  try {
    const userId = getEffectiveUserId(c)
    if (!userId) {
      return c.json({ error: 'Unauthorized' }, 401)
    }

    const body = await c.req.json()
    const validation = markAsReadSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { customerId } = validation.data

    // Resolve WhatsApp credentials for this customer
    const credentials = await resolveCredentialsForSending(userId, customerId)

    if (!credentials) {
      return c.json({ error: 'WhatsApp not connected' }, 400)
    }

    // Get unread inbound messages from this customer
    const unreadMessages = await prisma.message.findMany({
      where: {
        userId,
        customerId,
        direction: 'INBOUND',
        status: { in: ['DELIVERED', 'SENT'] } // Not yet read
      },
      orderBy: { timestamp: 'desc' },
      take: 10 // Limit to last 10 messages to avoid rate limiting
    })

    if (unreadMessages.length === 0) {
      return c.json({
        success: true,
        message: 'No unread messages',
        markedCount: 0,
        unreadCount: 0
      })
    }

    // Send mark as read to WhatsApp
    try {
      const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken })

      // Mark the most recent message as read (WhatsApp marks all prior as read too)
      const latestMessage = unreadMessages[0]
      if (latestMessage.wamId) {
        await whatsapp.markAsRead(credentials.phoneNumberId, latestMessage.wamId)
        console.log(`✅ Marked message ${latestMessage.wamId} as read for customer ${customerId}`)
      }
    } catch (error) {
      logDetailedError(error, { path: c.req.path, method: c.req.method })
      // Don't fail the request - still update local status
    }

    // Update local message status to READ
    await prisma.message.updateMany({
      where: {
        id: { in: unreadMessages.map(m => m.id) }
      },
      data: {
        status: 'READ'
      }
    })

    // Emit WebSocket event for unread count update (Requirement 4.2)
    try {
      console.log(`[MarkAsRead] Emitting conversation_updated with unreadCount: 0 for customer ${customerId}`)
      eventEmitter.emitConversationUpdated(userId, {
        conversationId: customerId,
        changes: {
          unreadCount: 0
        }
      })
    } catch (err) {
      logDetailedError(err, { path: c.req.path, method: c.req.method })
    }

    // After marking as read, unread count for this customer is 0
    return c.json({ 
      success: true, 
      message: 'Messages marked as read',
      markedCount: unreadMessages.length,
      unreadCount: 0
    })

  } catch (error: any) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: 'Failed to mark messages as read',
      details: error.message
    }, 500)
  }
})

export default app
