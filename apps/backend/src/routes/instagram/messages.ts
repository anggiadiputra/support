/**
 * Instagram Message Sending Routes
 * Handles sending messages and reactions
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { instagramService, InstagramError, IGErrorCode, MediaType } from '../../services/InstagramService.js'
import { webhookService } from '../../services/webhook-service.js'
import { auditLog } from '../../utils/auditLog.js'

const app = new Hono()

// Valid message types for sending
const VALID_MESSAGE_TYPES = ['text', 'image', 'video', 'audio', 'sticker'] as const
type SendMessageType = typeof VALID_MESSAGE_TYPES[number]

/**
 * POST /conversations/:id/messages - Send a message to a conversation
 * Validates messaging window before sending
 * Supports text, image, video, audio, and sticker types
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.9, 3.10
 */
app.post('/conversations/:id/messages', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const conversationId = c.req.param('id')
    const body = await c.req.json()
    
    const { type, text, mediaUrl, useHumanAgentTag } = body as {
      type: SendMessageType
      text?: string
      mediaUrl?: string
      useHumanAgentTag?: boolean
    }

    // Validate message type
    if (!type || !VALID_MESSAGE_TYPES.includes(type)) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: `Invalid message type. Must be one of: ${VALID_MESSAGE_TYPES.join(', ')}`
        }
      }, 400)
    }

    // Validate required fields based on type
    if (type === 'text' && (!text || text.trim().length === 0)) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Text is required for text messages'
        }
      }, 400)
    }

    if (['image', 'video', 'audio'].includes(type) && !mediaUrl) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: `Media URL is required for ${type} messages`
        }
      }, 400)
    }

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true, igId: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get conversation and verify ownership
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
      },
      select: {
        id: true,
        participantIgsid: true,
        windowExpiresAt: true,
        isWindowActive: true,
      }
    })

    if (!conversation) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Conversation not found'
        }
      }, 404)
    }

    // Check messaging window (Requirement 3.9)
    const now = new Date()
    const isWindowActive = conversation.windowExpiresAt ? conversation.windowExpiresAt > now : false

    if (!isWindowActive && !useHumanAgentTag) {
      return c.json({
        error: {
          code: 'MessagingWindowClosed',
          message: 'Cannot send message: 24-hour messaging window has expired. Wait for the user to send a new message to reopen the window.',
          windowExpiresAt: conversation.windowExpiresAt?.toISOString() || null
        }
      }, 400)
    }

    // Send message based on type
    let sendResult: { recipientId: string; messageId: string }
    let messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'STICKER'
    let savedText: string | undefined
    let savedMediaUrl: string | undefined
    let savedMediaType: string | undefined

    try {
      switch (type) {
        case 'text':
          // Requirement 3.1: Send text message (max 1000 bytes UTF-8)
          sendResult = await instagramService.sendTextMessage(
            igAccount.igId,
            conversation.participantIgsid,
            text!
          )
          messageType = 'TEXT'
          savedText = text
          break

        case 'image':
          // Requirement 3.2: Send image (max 8MB, png/jpeg)
          sendResult = await instagramService.sendMediaMessage(
            igAccount.igId,
            conversation.participantIgsid,
            'image' as MediaType,
            mediaUrl!
          )
          messageType = 'IMAGE'
          savedMediaUrl = mediaUrl
          savedMediaType = 'image'
          savedText = text // Optional caption
          break

        case 'video':
          // Requirement 3.3: Send video (max 25MB)
          sendResult = await instagramService.sendMediaMessage(
            igAccount.igId,
            conversation.participantIgsid,
            'video' as MediaType,
            mediaUrl!
          )
          messageType = 'VIDEO'
          savedMediaUrl = mediaUrl
          savedMediaType = 'video'
          savedText = text
          break

        case 'audio':
          // Requirement 3.4: Send audio (max 25MB)
          sendResult = await instagramService.sendMediaMessage(
            igAccount.igId,
            conversation.participantIgsid,
            'audio' as MediaType,
            mediaUrl!
          )
          messageType = 'AUDIO'
          savedMediaUrl = mediaUrl
          savedMediaType = 'audio'
          break

        case 'sticker':
          // Requirement 3.5: Send heart sticker
          sendResult = await instagramService.sendHeartSticker(
            igAccount.igId,
            conversation.participantIgsid
          )
          messageType = 'STICKER'
          break

        default:
          return c.json({
            error: {
              code: 'BadRequest',
              message: 'Unsupported message type'
            }
          }, 400)
      }
    } catch (sendError) {
      // Handle send errors (Requirement 3.8)
      if (sendError instanceof InstagramError) {
        // Create failed message record
        const failedMessage = await prisma.iGMessage.create({
          data: {
            conversationId,
            direction: 'OUTBOUND',
            messageType: type === 'sticker' ? 'STICKER' : type.toUpperCase() as any,
            text: savedText,
            mediaUrl: savedMediaUrl,
            mediaType: savedMediaType,
            status: 'FAILED',
            errorCode: sendError.code,
            errorMessage: sendError.message,
            timestamp: new Date(),
          }
        })

        // Emit webhook event for message.failed (Requirement 3.1, 8.1, 8.2, 8.4)
        webhookService.emitEvent(
          c.user!.id,
          'message.failed',
          'instagram',
          igAccount.id,
          {
            message_id: failedMessage.id,
            customer_id: conversationId,
            direction: 'outbound',
            message_type: type,
            content: savedText || undefined,
            media_url: savedMediaUrl || undefined,
          }
        ).catch(err => console.error('[IG Messages] Failed to emit message.failed webhook:', err))

        return c.json(sendError.toJSON(), sendError.statusCode as any)
      }
      throw sendError
    }

    // Create message record (Requirement 3.7)
    const message = await prisma.iGMessage.create({
      data: {
        conversationId,
        igMessageId: sendResult.messageId,
        direction: 'OUTBOUND',
        messageType,
        text: savedText,
        mediaUrl: savedMediaUrl,
        mediaType: savedMediaType,
        status: 'SENT',
        timestamp: new Date(),
      }
    })

    // Update conversation
    await prisma.iGConversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: new Date(),
        lastMessagePreview: savedText?.substring(0, 100) || getMessagePreview(messageType),
      }
    })

    // Emit webhook event for message.sent (Requirement 3.1, 8.1, 8.2, 8.4)
    webhookService.emitEvent(
      c.user!.id,
      'message.sent',
      'instagram',
      igAccount.id,
      {
        message_id: message.id,
        customer_id: conversation.id, // Use conversation id as customer reference
        customer_username: undefined, // Will be populated from conversation if available
        direction: 'outbound',
        message_type: messageType.toLowerCase(),
        content: savedText || undefined,
        media_url: savedMediaUrl || undefined,
      }
    ).catch(err => console.error('[IG Messages] Failed to emit message.sent webhook:', err))

    // Audit log
    await auditLog('INSTAGRAM_MESSAGE_SENT', 'Instagram', message.id, {
      conversationId,
      messageType,
      igMessageId: sendResult.messageId
    }, c.user!.id)

    return c.json({
      success: true,
      data: {
        id: message.id,
        igMessageId: sendResult.messageId,
        recipientId: sendResult.recipientId,
        type: messageType,
        text: savedText,
        mediaUrl: savedMediaUrl,
        status: 'SENT',
        timestamp: message.timestamp.toISOString()
      }
    })
  } catch (error) {
    console.error('Send message error:', error)

    if (error instanceof InstagramError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to send message'
      }
    }, 500)
  }
})

/**
 * POST /messages/:id/react - React to a message with 'love' reaction
 * Requirements: 3.6
 */
app.post('/messages/:id/react', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const messageId = c.req.param('id')

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true, igId: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get message and verify ownership
    const message = await prisma.iGMessage.findFirst({
      where: { id: messageId },
      include: {
        conversation: {
          select: {
            id: true,
            instagramAccountId: true,
            participantIgsid: true,
            windowExpiresAt: true,
          }
        }
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

    // Verify message belongs to user's Instagram account
    if (message.conversation.instagramAccountId !== igAccount.id) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Message not found'
        }
      }, 404)
    }

    // Check if message has Instagram message ID (required for reaction)
    if (!message.igMessageId) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Cannot react to this message - no Instagram message ID'
        }
      }, 400)
    }

    // Check messaging window
    const now = new Date()
    const isWindowActive = message.conversation.windowExpiresAt 
      ? message.conversation.windowExpiresAt > now 
      : false

    if (!isWindowActive) {
      return c.json({
        error: {
          code: 'MessagingWindowClosed',
          message: 'Cannot react: 24-hour messaging window has expired'
        }
      }, 400)
    }

    // Send reaction (Requirement 3.6)
    try {
      await instagramService.sendReaction(
        igAccount.igId,
        message.conversation.participantIgsid,
        message.igMessageId
      )
    } catch (reactionError) {
      if (reactionError instanceof InstagramError) {
        return c.json(reactionError.toJSON(), reactionError.statusCode as any)
      }
      throw reactionError
    }

    // Update message with reaction
    await prisma.iGMessage.update({
      where: { id: messageId },
      data: { reaction: 'love' }
    })

    return c.json({
      success: true,
      message: 'Reaction sent successfully',
      data: {
        messageId,
        reaction: 'love'
      }
    })
  } catch (error) {
    console.error('React to message error:', error)

    if (error instanceof InstagramError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to react to message'
      }
    }, 500)
  }
})

/**
 * Get a preview string for non-text messages
 */
function getMessagePreview(messageType: string): string {
  const previews: Record<string, string> = {
    IMAGE: '📷 Image',
    VIDEO: '🎥 Video',
    AUDIO: '🎵 Audio',
    STICKER: '❤️ Sticker',
    STORY_REPLY: '📖 Story Reply',
    STORY_MENTION: '📖 Story Mention',
    MEDIA_SHARE: '🔗 Shared Post',
    REACTION: '❤️ Reaction',
  }
  return previews[messageType] || 'Message'
}

export default app
