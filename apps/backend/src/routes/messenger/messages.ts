/**
 * Facebook Messenger Message Routes
 * Handles sending messages and typing indicators
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import * as messengerService from '../../services/messenger/index.js'
import { MessengerError } from '../../services/messenger/errors.js'
import { webhookService } from '../../services/webhook-service.js'

const app = new Hono()

// Valid message types
const VALID_MESSAGE_TYPES = ['text', 'image', 'video', 'audio', 'file'] as const
type MessageType = (typeof VALID_MESSAGE_TYPES)[number]

/**
 * POST /conversations/:id/messages - Send a message
 * Supports text and attachment types (image, video, audio, file)
 */
app.post(
  '/conversations/:id/messages',
  requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
      }

      const conversationId = c.req.param('id')
      const body = await c.req.json()
      const { type = 'text', text, mediaUrl, mediaType } = body as {
        type?: MessageType
        text?: string
        mediaUrl?: string
        mediaType?: string
      }

      // Validate message type
      if (!VALID_MESSAGE_TYPES.includes(type)) {
        return c.json(
          {
            error: {
              code: 'BadRequest',
              message: `Invalid message type. Must be one of: ${VALID_MESSAGE_TYPES.join(', ')}`,
            },
          },
          400
        )
      }

      // Validate required fields based on type
      if (type === 'text' && (!text || text.trim().length === 0)) {
        return c.json(
          { error: { code: 'BadRequest', message: 'Text is required for text messages' } },
          400
        )
      }

      if (['image', 'video', 'audio', 'file'].includes(type) && !mediaUrl) {
        return c.json(
          { error: { code: 'BadRequest', message: `Media URL is required for ${type} messages` } },
          400
        )
      }

      // Validate conversation ownership (user must own the page)
      const conversation = await prisma.messengerConversation.findFirst({
        where: {
          id: conversationId,
          facebookPage: { userId: c.user.id },
        },
        include: {
          facebookPage: {
            select: { id: true, pageId: true, userId: true },
          },
        },
      })

      if (!conversation) {
        return c.json({ error: { code: 'NotFound', message: 'Conversation not found' } }, 404)
      }

      // Check if messaging window is active before sending
      const now = new Date()
      const isWindowActive = conversation.windowExpiresAt
        ? conversation.windowExpiresAt > now
        : conversation.isWindowActive

      if (!isWindowActive) {
        return c.json(
          {
            error: {
              code: 'WindowClosed',
              message:
                'Messaging window has closed. Wait for the user to send a message to reopen the window.',
              windowExpiresAt: conversation.windowExpiresAt?.toISOString() || null,
            },
          },
          400
        )
      }

      let result: { recipient_id: string; message_id: string }
      let savedText: string | undefined
      let savedMediaUrl: string | undefined
      let savedMediaType: string | undefined

      // Send message based on type
      try {
        if (type === 'text') {
          result = await messengerService.sendTextMessage(
            conversation.facebookPage.id,
            conversation.participantPsid,
            text!
          )
          savedText = text
        } else {
          // Attachment types: image, video, audio, file
          result = await messengerService.sendAttachment(
            conversation.facebookPage.id,
            conversation.participantPsid,
            type as 'image' | 'video' | 'audio' | 'file',
            mediaUrl!
          )
          savedMediaUrl = mediaUrl
          savedMediaType = mediaType || type
          savedText = text // Optional caption
        }
      } catch (sendError) {
        // Handle send errors - save failed message record
        if (sendError instanceof MessengerError) {
          const failedMessage = await prisma.messengerMessage.create({
            data: {
              conversationId,
              direction: 'OUTBOUND',
              messageType: type.toUpperCase() as any,
              text: type === 'text' ? text : undefined,
              mediaUrl: type !== 'text' ? mediaUrl : undefined,
              mediaType: type !== 'text' ? mediaType || type : undefined,
              status: 'FAILED',
              errorCode: sendError.code,
              errorMessage: sendError.message,
              timestamp: new Date(),
            },
          })

          // Emit webhook event for message.failed
          webhookService
            .emitEvent(conversation.facebookPage.userId, 'message.failed', 'messenger', conversation.facebookPage.id, {
              message_id: failedMessage.id,
              customer_id: conversationId,
              direction: 'outbound',
              message_type: type,
              content: text || undefined,
              media_url: mediaUrl || undefined,
            })
            .catch((err) => console.error('[Messenger] Failed to emit message.failed webhook:', err))

          return c.json(sendError.toJSON(), sendError.statusCode as any)
        }
        throw sendError
      }

      // Save sent message to database
      const message = await prisma.messengerMessage.create({
        data: {
          conversationId,
          mid: result.message_id,
          direction: 'OUTBOUND',
          messageType: type.toUpperCase() as any,
          text: savedText,
          mediaUrl: savedMediaUrl,
          mediaType: savedMediaType,
          status: 'SENT',
          timestamp: new Date(),
        },
      })

      // Update conversation lastMessageAt
      await prisma.messengerConversation.update({
        where: { id: conversationId },
        data: {
          lastMessageAt: new Date(),
          lastMessagePreview: savedText?.substring(0, 100) || getMessagePreview(type),
        },
      })

      // Emit webhook event for message.sent
      webhookService
        .emitEvent(conversation.facebookPage.userId, 'message.sent', 'messenger', conversation.facebookPage.id, {
          message_id: message.id,
          customer_id: conversationId,
          direction: 'outbound',
          message_type: type,
          content: savedText || undefined,
          media_url: savedMediaUrl || undefined,
        })
        .catch((err) => console.error('[Messenger] Failed to emit message.sent webhook:', err))

      return c.json({
        success: true,
        data: {
          id: message.id,
          mid: message.mid,
          type: message.messageType,
          text: message.text,
          mediaUrl: message.mediaUrl,
          status: message.status,
          timestamp: message.timestamp.toISOString(),
        },
      })
    } catch (error) {
      console.error('[Messenger] Send message error:', error)

      if (error instanceof MessengerError) {
        return c.json(error.toJSON(), error.statusCode as any)
      }

      return c.json(
        {
          error: {
            code: 'InternalServerError',
            message: error instanceof Error ? error.message : 'Failed to send message',
          },
        },
        500
      )
    }
  }
)

/**
 * POST /conversations/:id/typing - Send typing indicator
 */
app.post(
  '/conversations/:id/typing',
  requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
      }

      const conversationId = c.req.param('id')

      // Validate conversation ownership
      const conversation = await prisma.messengerConversation.findFirst({
        where: {
          id: conversationId,
          facebookPage: { userId: c.user.id },
        },
        include: {
          facebookPage: { select: { id: true } },
        },
      })

      if (!conversation) {
        return c.json({ error: { code: 'NotFound', message: 'Conversation not found' } }, 404)
      }

      await messengerService.sendTypingOn(conversation.facebookPage.id, conversation.participantPsid)

      return c.json({ success: true })
    } catch (error) {
      console.error('[Messenger] Typing indicator error:', error)
      return c.json(
        {
          error: {
            code: 'InternalServerError',
            message: error instanceof Error ? error.message : 'Failed to send typing indicator',
          },
        },
        500
      )
    }
  }
)

/**
 * POST /messages/:messageId/reaction - Send a reaction to a message
 * Supports: love, haha, wow, sad, angry, like, dislike
 */
app.post(
  '/messages/:messageId/reaction',
  requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
      }

      const messageId = c.req.param('messageId')
      const body = await c.req.json()
      const { reaction } = body as { reaction?: string }

      // Validate reaction type
      const validReactions = ['love', 'haha', 'wow', 'sad', 'angry', 'like', 'dislike']
      if (!reaction || !validReactions.includes(reaction)) {
        return c.json(
          {
            error: {
              code: 'BadRequest',
              message: `Invalid reaction. Must be one of: ${validReactions.join(', ')}`,
            },
          },
          400
        )
      }

      // Find the message and verify ownership
      const message = await prisma.messengerMessage.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              facebookPage: {
                select: { id: true, userId: true },
              },
            },
          },
        },
      })

      if (!message) {
        return c.json({ error: { code: 'NotFound', message: 'Message not found' } }, 404)
      }

      if (message.conversation.facebookPage.userId !== c.user.id) {
        return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
      }

      // Send reaction via Facebook API
      await messengerService.sendReaction(
        message.conversation.facebookPage.id,
        message.conversation.participantPsid,
        message.mid!, // Use the Facebook message ID (mid)
        reaction as 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'like' | 'dislike'
      )

      // Update message record with reaction
      await prisma.messengerMessage.update({
        where: { id: messageId },
        data: { reaction },
      })

      return c.json({
        success: true,
        data: {
          messageId,
          reaction,
        },
      })
    } catch (error) {
      console.error('[Messenger] Send reaction error:', error)

      if (error instanceof MessengerError) {
        return c.json(error.toJSON(), error.statusCode as any)
      }

      return c.json(
        {
          error: {
            code: 'InternalServerError',
            message: error instanceof Error ? error.message : 'Failed to send reaction',
          },
        },
        500
      )
    }
  }
)

/**
 * DELETE /messages/:messageId/reaction - Remove a reaction from a message
 */
app.delete(
  '/messages/:messageId/reaction',
  requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
      }

      const messageId = c.req.param('messageId')

      // Find the message and verify ownership
      const message = await prisma.messengerMessage.findUnique({
        where: { id: messageId },
        include: {
          conversation: {
            include: {
              facebookPage: {
                select: { id: true, userId: true },
              },
            },
          },
        },
      })

      if (!message) {
        return c.json({ error: { code: 'NotFound', message: 'Message not found' } }, 404)
      }

      if (message.conversation.facebookPage.userId !== c.user.id) {
        return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
      }

      // Remove reaction via Facebook API
      await messengerService.removeReaction(
        message.conversation.facebookPage.id,
        message.conversation.participantPsid,
        message.mid!
      )

      // Update message record
      await prisma.messengerMessage.update({
        where: { id: messageId },
        data: { reaction: null },
      })

      return c.json({
        success: true,
        message: 'Reaction removed',
      })
    } catch (error) {
      console.error('[Messenger] Remove reaction error:', error)

      if (error instanceof MessengerError) {
        return c.json(error.toJSON(), error.statusCode as any)
      }

      return c.json(
        {
          error: {
            code: 'InternalServerError',
            message: error instanceof Error ? error.message : 'Failed to remove reaction',
          },
        },
        500
      )
    }
  }
)

/**
 * Get a preview string for non-text messages
 */
function getMessagePreview(messageType: string): string {
  const previews: Record<string, string> = {
    image: '[Image]',
    video: '[Video]',
    audio: '[Audio]',
    file: '[File]',
    IMAGE: '[Image]',
    VIDEO: '[Video]',
    AUDIO: '[Audio]',
    FILE: '[File]',
  }
  return previews[messageType] || '[Message]'
}

export default app
