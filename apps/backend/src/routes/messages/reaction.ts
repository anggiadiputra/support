import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { logger } from '../../utils/logger.js'
import WhatsAppAPI from '../../utils/whatsapp.js'
import { resolveCredentialsForSending } from '../../utils/whatsapp-account-helper.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { getSendTarget } from '../../utils/customer-lookup.js'

const app = new Hono()

const reactionSchema = z.object({
  emoji: z.string().max(10) // emoji or "" for unreact
})

/**
 * POST /api/v1/messages/:messageId/react
 * Send reaction to a WhatsApp message
 * 
 * Body: { emoji: "👍" } or { emoji: "" } to unreact
 */
app.post('/:messageId/react', async (c: Context) => {
  try {
    const messageId = c.req.param('messageId')
    const body = await c.req.json()
    const data = reactionSchema.parse(body)

    const effectiveUserId = getEffectiveUserId(c)

    // Get the message to react to
    const message = await prisma.message.findUnique({
      where: { id: messageId },
      include: {
        customer: true
      }
    })

    if (!message) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Message not found'
        }
      }, 404)
    }

    // Check that message belongs to user's customer
    if (message.userId !== effectiveUserId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied'
        }
      }, 403)
    }

    // Message must have wamId (WhatsApp message ID)
    if (!message.wamId) {
      return c.json({
        error: {
          code: 'InvalidMessage',
          message: 'Cannot react to this message - no WhatsApp message ID'
        }
      }, 400)
    }

    // Resolve WhatsApp credentials
    const credentials = await resolveCredentialsForSending(effectiveUserId, message.customerId)

    if (!credentials) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'No connected WhatsApp Business Account found'
        }
      }, 400)
    }

    // Create WhatsApp client
    const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken })

    // Get send target (to/recipient)
    const sendTarget = getSendTarget(message.customer)

    // Send reaction
    const result = await whatsapp.sendReaction({
      phoneNumberId: credentials.phoneNumberId,
      ...sendTarget,
      messageId: message.wamId,
      emoji: data.emoji
    })

    logger.info('Reaction sent', {
      messageId: message.id,
      wamId: message.wamId,
      emoji: data.emoji,
      userId: effectiveUserId
    })

    return c.json({
      success: true,
      data: {
        messageId: message.id,
        wamId: message.wamId,
        emoji: data.emoji,
        whatsappResult: result
      }
    })
  } catch (error: any) {
    logger.error('Send reaction error:', {
      error: error.response?.data || error.message
    })

    return c.json({
      error: {
        code: 'ReactionFailed',
        message: error.response?.data?.error?.message || error.message || 'Failed to send reaction'
      }
    }, 500)
  }
})

export default app
