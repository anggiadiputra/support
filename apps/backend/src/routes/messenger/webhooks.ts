/**
 * Facebook Messenger Webhook Routes
 * Handles webhook verification and event processing
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import * as messengerService from '../../services/messenger/index.js'
import { webhookService } from '../../services/webhook-service.js'
import { eventEmitter } from '../../websocket/index.js'
import { AIOrchestrator } from '../../services/ai/AIOrchestrator.js'
import { AutoTaggingService } from '../../services/auto-tagging-service.js'
import type {
  MessengerWebhookEvent,
  MessengerMessagingEvent,
  MessengerMessagePayload,
  MessengerReactionPayload,
  MessengerReadPayload,
  MessengerDeliveryPayload,
  MessengerPostbackPayload,
} from '../../services/messenger/types.js'

// AI Orchestrator instance for Messenger auto-reply
const aiOrchestrator = new AIOrchestrator()

const app = new Hono()

/**
 * GET /webhooks - Webhook verification endpoint
 * Used by Meta to verify webhook subscription
 */
app.get('/', async (c: Context) => {
  try {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')

    if (!mode || !token || !challenge) {
      console.log('[Messenger Webhook] Missing verification parameters')
      return c.text('Missing parameters', 400)
    }

    // Verify the webhook challenge (uses database settings with caching)
    const result = await messengerService.verifyWebhookChallenge(mode, token, challenge)

    if (result) {
      console.log('[Messenger Webhook] Verification successful')
      return c.text(result, 200)
    }

    console.log('[Messenger Webhook] Verification failed - token mismatch')
    return c.text('Verification failed', 403)
  } catch (error) {
    console.error('[Messenger Webhook] Verification error:', error)
    return c.text('Internal error', 500)
  }
})

/**
 * POST /webhooks - Receive webhook events
 * Processes incoming Messenger messaging events
 */
app.post('/', async (c: Context) => {
  try {
    // Get raw body as buffer for reliable signature verification
    const arrayBuffer = await c.req.arrayBuffer()
    const bodyBuffer = Buffer.from(arrayBuffer)
    const rawBody = bodyBuffer.toString('utf-8')
    const signature = c.req.header('x-hub-signature-256')

    // SECURITY: Check body size limit (1MB max)
    if (bodyBuffer.length > 1048576) {
      console.warn('[Messenger Webhook] Payload too large')
      return c.json({ error: 'Payload too large' }, 413)
    }

    // Verify webhook signature - passing the raw Buffer
    const isValidSignature = await messengerService.verifyWebhookSignature(bodyBuffer, signature)
    if (!isValidSignature) {
      return c.json({ error: 'Invalid signature' }, 403)
    }

    // Parse the webhook payload
    let payload: MessengerWebhookEvent
    try {
      payload = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('[Messenger Webhook] Failed to parse payload:', parseError)
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    // Verify this is a page webhook (Messenger uses 'page' object type)
    if (payload.object !== 'page') {
      console.log('[Messenger Webhook] Not a page webhook, ignoring')
      return c.json({ status: 'ignored' }, 200)
    }

    // Process each entry asynchronously (don't block response)
    // Always return 200 immediately to prevent retries
    processWebhookEntries(payload).catch(error => {
      console.error('[Messenger Webhook] Background processing error:', error)
    })

    return c.json({ status: 'received' }, 200)
  } catch (error) {
    console.error('[Messenger Webhook] Error processing webhook:', error)
    // Always return 200 to prevent retries
    return c.json({ status: 'error' }, 200)
  }
})

/**
 * Process webhook entries in the background
 */
async function processWebhookEntries(payload: MessengerWebhookEvent): Promise<void> {
  for (const entry of payload.entry) {
    const pageId = entry.id // Facebook Page ID

    // Find the Facebook page
    const fbPage = await prisma.facebookPage.findUnique({
      where: { pageId },
      select: {
        id: true,
        pageId: true,
        accessToken: true,
        accessTokenIV: true,
        accessTokenTag: true,
        connectionStatus: true,
        userId: true,
      }
    })

    if (!fbPage) {
      console.warn('[Messenger Webhook] Page not found')
      continue
    }

    if (fbPage.connectionStatus !== 'connected') {
      console.warn('[Messenger Webhook] Page not connected')
      continue
    }

    // Process messaging events
    if (entry.messaging) {
      for (const event of entry.messaging) {
        try {
          await processMessagingEvent(fbPage.id, pageId, fbPage.userId, event)
        } catch (eventError) {
          console.error('[Messenger Webhook] Error processing event:', eventError)
          // Log error but continue processing other events
          await logWebhookError(fbPage.id, 'event_processing_error', eventError, event)
        }
      }
    }
  }
}

/**
 * Process a single messaging event
 * Routes to appropriate handler based on event type
 */
async function processMessagingEvent(
  facebookPageId: string,
  pageId: string,
  userId: string,
  event: MessengerMessagingEvent
): Promise<void> {
  const senderId = event.sender.id
  const recipientId = event.recipient.id
  const eventTimestamp = new Date(event.timestamp)

  // Determine if this is an inbound or outbound message
  // Inbound: sender is the user, recipient is our Page
  // Outbound (echo): sender is our Page
  const isInbound = recipientId === pageId

  if (event.message) {
    // Handle message event
    await handleMessageEvent(facebookPageId, pageId, userId, event, isInbound, eventTimestamp)
  } else if (event.reaction) {
    // Handle reaction event
    await handleReactionEvent(facebookPageId, event.reaction)
  } else if (event.read) {
    // Handle read receipt event
    await handleReadEvent(facebookPageId, event.read, senderId)
  } else if (event.delivery) {
    // Handle delivery receipt event
    await handleDeliveryEvent(facebookPageId, event.delivery, senderId)
  } else if (event.postback) {
    // Handle postback event (button clicks)
    await handlePostbackEvent(facebookPageId, userId, event.postback, senderId, eventTimestamp)
  }
}

/**
 * Handle incoming message event
 */
async function handleMessageEvent(
  facebookPageId: string,
  pageId: string,
  userId: string,
  event: MessengerMessagingEvent,
  isInbound: boolean,
  timestamp: Date
): Promise<void> {
  const message = event.message!
  const participantPsid = isInbound ? event.sender.id : event.recipient.id

  // Skip echo messages (messages we sent)
  if (message.is_echo) {
    return
  }

  // Find or create conversation
  let conversation = await prisma.messengerConversation.findUnique({
    where: {
      facebookPageId_participantPsid: {
        facebookPageId,
        participantPsid,
      }
    },
    include: {
      facebookPage: {
        select: {
          userId: true,
        }
      }
    }
  })

  const isNewConversation = !conversation

  if (!conversation) {
    // Create new conversation
    conversation = await prisma.messengerConversation.create({
      data: {
        facebookPageId,
        participantPsid,
        lastMessageAt: timestamp,
        unreadCount: isInbound ? 1 : 0,
      },
      include: {
        facebookPage: {
          select: {
            userId: true,
          }
        }
      }
    })
  }

  // Fetch sender profile for new conversations or if profile is missing
  if (isInbound && (isNewConversation || !conversation.participantName)) {
    try {
      const profile = await messengerService.getUserProfile(facebookPageId, participantPsid)

      if (profile && profile.name) {
        await prisma.messengerConversation.update({
          where: { id: conversation.id },
          data: {
            participantName: profile.name,
            participantProfilePic: profile.profile_pic,
          }
        })
        // Update local reference for customer creation below
        conversation.participantName = profile.name
        conversation.participantProfilePic = profile.profile_pic || null
        
        console.log('[MessengerWebhook] Updated conversation with profile:', {
          conversationId: conversation.id,
          participantName: profile.name,
        })
      } else {
        console.warn('[MessengerWebhook] Profile fetch returned no name for PSID:', participantPsid)
      }
    } catch (profileError) {
      console.error('[MessengerWebhook] Profile fetch failed:', profileError)
      // Profile fetch failed - not critical, continue
    }
  }

  // Find or create Customer record for this Messenger conversation
  if (isInbound && !conversation.customerId) {
    try {
      const participantName = conversation.participantName

      if (participantName) {
        // Use Messenger PSID as phoneNumber placeholder (prefixed with 'msg_')
        // This ensures uniqueness while indicating it's a Messenger-only customer
        const phoneNumberPlaceholder = `msg_${participantPsid}`

        // Try to find existing customer by phoneNumber placeholder
        let customer = await prisma.customer.findFirst({
          where: {
            userId,
            phoneNumber: phoneNumberPlaceholder,
          }
        })

        if (!customer) {
          // Create new customer
          customer = await prisma.customer.create({
            data: {
              userId,
              phoneNumber: phoneNumberPlaceholder,
              name: participantName,
            }
          })
        }

        // Link conversation to customer
        await prisma.messengerConversation.update({
          where: { id: conversation.id },
          data: { customerId: customer.id }
        })

        // Update conversation object for webhook emission
        conversation.customerId = customer.id
      }
    } catch (customerError) {
      // Customer creation failed - not critical, continue
    }
  }

  // Determine message type and content
  const { messageType, text, mediaUrl, mediaType, fileName, stickerUrl, quickReplyPayload } = parseMessageContent(message)

  // Create the message record (catch P2002 for duplicate webhooks)
  let msgRecord: any
  let isDuplicate = false

  try {
    msgRecord = await prisma.messengerMessage.create({
      data: {
        conversationId: conversation.id,
        mid: message.mid,
        direction: isInbound ? 'INBOUND' : 'OUTBOUND',
        messageType,
        text,
        mediaUrl,
        mediaType,
        fileName,
        stickerUrl,
        quickReplyPayload,
        status: 'SENT',
        timestamp,
      }
    })
    console.log('[Messenger Webhook] Message created')
  } catch (error: any) {
    // Handle duplicate webhook (P2002 = unique constraint violation)
    if (error?.code === 'P2002') {
      isDuplicate = true
      // For duplicates, find the existing message to get its ID
      msgRecord = await prisma.messengerMessage.findUnique({
        where: { mid: message.mid }
      })
      if (!msgRecord) {
        console.error(`[Messenger Webhook] Could not find duplicate message: ${message.mid}`)
        return
      }
    } else {
      // Re-throw other errors
      throw error
    }
  }

  // For duplicates, skip all further processing (conversation update, webhook emission)
  if (isDuplicate) {
    return
  }

  // Update conversation state
  const updateData: any = {
    lastMessageAt: timestamp,
    lastMessagePreview: text?.substring(0, 100) || getMessagePreview(messageType),
  }

  // Update messaging window for inbound messages (24h policy)
  if (isInbound) {
    const windowExpiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000) // 24 hours
    updateData.lastInboundAt = timestamp
    updateData.windowExpiresAt = windowExpiresAt
    updateData.isWindowActive = true
    updateData.unreadCount = { increment: 1 }
  }

  await prisma.messengerConversation.update({
    where: { id: conversation.id },
    data: updateData,
  })

  // Emit webhook event for inbound messages
  if (isInbound && conversation.customerId) {
    // Emit webhook event for inbound messages
    webhookService.emitEvent(
      conversation.facebookPage.userId,
      'message.received',
      'messenger',
      facebookPageId,
      {
        message_id: msgRecord.id,
        customer_id: conversation.customerId,
        direction: 'inbound',
        message_type: messageType.toLowerCase(),
        content: text || undefined,
        media_url: mediaUrl || undefined,
      }
    ).catch(err => console.error('[Messenger Webhook] Failed to emit message.received webhook:', err))

    // Emit WebSocket event for real-time UI update
    // Broadcast to business room so all team members receive the message
    eventEmitter.emitNewMessageToBusinessRoom(conversation.facebookPage.userId, {
      conversationId: `msg-${conversation.id}`,  // Add 'msg-' prefix to match frontend UnifiedConversation.id
      channel: 'messenger',
      participantId: participantPsid,
      participantName: conversation.participantName || null,
      message: {
        id: msgRecord.id,
        preview: (text || getMessagePreview(messageType)).substring(0, 100),
        timestamp: msgRecord.timestamp.toISOString(),
        direction: 'inbound',
      },
    })

    // Also emit to assigned agent if conversation is assigned to a human agent
    try {
      const assignment = await prisma.conversationAssignment.findFirst({
        where: {
          businessOwnerId: conversation.facebookPage.userId,
          conversationType: 'MESSENGER',
          conversationId: conversation.id,
          assigneeType: 'HUMAN',
          unassignedAt: null,
        },
        select: {
          assigneeId: true,
        }
      })

      // Note: With business room broadcast above, assigned agents already receive the message
      // This explicit emit to assigned agent is now redundant but kept for backward compatibility
      // TODO: Consider removing this block since business room broadcast covers all team members
      if (assignment?.assigneeId && assignment.assigneeId !== conversation.facebookPage.userId) {
        console.log(`[Messenger Webhook] Assigned agent ${assignment.assigneeId} already received message via business room broadcast`)
      }
    } catch (err) {
      console.error('[Messenger Webhook] Failed to emit to assigned agent:', err)
    }

    // Process auto-tagging rules for inbound messages
    if (text && conversation.customerId) {
      AutoTaggingService.processInboundMessage(
        userId,
        conversation.customerId,
        text
      )
        .then(result => {
          if (result.matched) {
            console.log(`[Messenger Webhook] 🏷️ Auto-tagging applied: ${result.rulesMatched.join(', ')}`)
            if (result.tagsAdded.length > 0) {
              console.log(`[Messenger Webhook]    Tags added: ${result.tagsAdded.join(', ')}`)
            }
            if (result.stageChanged) {
              console.log(`[Messenger Webhook]    Stage changed to: ${result.newStageName}`)
            }
          }
        })
        .catch(err => console.error(`[Messenger Webhook] Failed to process auto-tagging:`, err))
    }

    // --- AI Auto-Reply Logic with Assignment Check ---
    if (messageType === 'TEXT' && text) {
      try {
        // Get user to check subscription tier
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptionTier: true }
        })

        // Check subscription tier
        if (user?.subscriptionTier === 'FREE') {
          // AI Auto-Reply not available on FREE tier
        } else {
          // Process AI response with assignment check
          // - If assigned to human → skip AI response
          // - If assigned to AI Agent → use that AI Agent's configuration
          // - If unassigned with AI enabled → use default AI Agent
          const response = await aiOrchestrator.handleMessageWithAssignmentCheck(
            userId,
            text,
            conversation.id, // conversationId for Messenger is the MessengerConversation ID
            'MESSENGER',     // conversationType
            conversation.customerId || undefined // customerId for conversation history
          )

          if (response) {
            console.log('[Messenger Webhook] AI Auto-Reply generated')

            // Send typing indicator before reply
            try {
              await messengerService.sendTypingOn(facebookPageId, participantPsid)
            } catch (typingError) {
              console.error('[Messenger Webhook] Failed to send typing indicator:', typingError)
            }

            // Send the AI response
            const sendResult = await messengerService.sendTextMessage(facebookPageId, participantPsid, response)

            // Save AI reply to database
            const aiReplyMessage = await prisma.messengerMessage.create({
              data: {
                conversationId: conversation.id,
                mid: sendResult.message_id,
                direction: 'OUTBOUND',
                messageType: 'TEXT',
                text: response,
                status: 'SENT',
                timestamp: new Date(),
              }
            })

            console.log('[Messenger Webhook] AI Auto-Reply sent')

            // Emit webhook event for message.sent
            if (conversation.customerId) {
              webhookService.emitEvent(
                userId,
                'message.sent',
                'messenger',
                facebookPageId,
                {
                  message_id: aiReplyMessage.id,
                  customer_id: conversation.customerId,
                  direction: 'outbound',
                  message_type: 'text',
                  content: response,
                }
              ).catch(err => console.error('[Messenger Webhook] Failed to emit message.sent webhook:', err))
            }
          }
        }
      } catch (aiError) {
        console.error('[Messenger Webhook] ❌ Error in AI Auto-Reply:', aiError)
        // Don't throw - we don't want to fail the entire webhook processing
      }
    }
  } else if (isInbound && !conversation.customerId) {
    console.warn(`[Messenger Webhook] Cannot emit webhook - no customer linked to conversation ${conversation.id}`)
  }
}

/**
 * Handle reaction event
 */
async function handleReactionEvent(
  facebookPageId: string,
  reaction: MessengerReactionPayload
): Promise<void> {
  const messageId = reaction.mid
  const action = reaction.action
  const reactionType = reaction.reaction || reaction.emoji

  // Find the message
  const message = await prisma.messengerMessage.findUnique({
    where: { mid: messageId },
    include: { conversation: true }
  })

  if (!message) {
    return
  }

  // Verify the message belongs to the correct Facebook page
  if (message.conversation.facebookPageId !== facebookPageId) {
    return
  }

  // Update or remove reaction
  if (action === 'react') {
    await prisma.messengerMessage.update({
      where: { id: message.id },
      data: { reaction: reactionType || 'like' }
    })
  } else if (action === 'unreact') {
    await prisma.messengerMessage.update({
      where: { id: message.id },
      data: { reaction: null }
    })
  }
}

/**
 * Handle read receipt event
 */
async function handleReadEvent(
  facebookPageId: string,
  read: MessengerReadPayload,
  senderId: string
): Promise<void> {
  const watermark = read.watermark

  // Find the conversation with this participant
  const conversation = await prisma.messengerConversation.findFirst({
    where: {
      facebookPageId,
      participantPsid: senderId,
    }
  })

  if (!conversation) {
    return
  }

  if (typeof watermark !== 'number') {
    return
  }

  const watermarkDate = new Date(watermark)

  // Double-check the Date is valid
  if (isNaN(watermarkDate.getTime())) {
    return
  }

  // Update all outbound messages before the watermark as read
  const result = await prisma.messengerMessage.updateMany({
    where: {
      conversationId: conversation.id,
      direction: 'OUTBOUND',
      timestamp: { lte: watermarkDate },
      readAt: null,
    },
    data: {
      readAt: watermarkDate,
      status: 'READ',
    }
  })
  
  if (result.count > 0) {
    console.log(`[Messenger Webhook] Marked ${result.count} messages as read`)
  }
}

/**
 * Handle delivery receipt event
 */
async function handleDeliveryEvent(
  facebookPageId: string,
  delivery: MessengerDeliveryPayload,
  senderId: string
): Promise<void> {
  const watermark = delivery.watermark
  const mids = delivery.mids

  // Find the conversation with this participant
  const conversation = await prisma.messengerConversation.findFirst({
    where: {
      facebookPageId,
      participantPsid: senderId,
    }
  })

  if (!conversation) {
    return
  }

  const deliveredAt = new Date()

  // If specific message IDs are provided, update those
  if (mids && mids.length > 0) {
    await prisma.messengerMessage.updateMany({
      where: {
        mid: { in: mids },
        deliveredAt: null,
      },
      data: {
        deliveredAt,
        status: 'DELIVERED',
      }
    })
    console.log(`[Messenger Webhook] Marked ${mids.length} messages as delivered`)
  } else if (typeof watermark === 'number') {
    // Otherwise use watermark timestamp
    const watermarkDate = new Date(watermark)

    if (!isNaN(watermarkDate.getTime())) {
      const result = await prisma.messengerMessage.updateMany({
        where: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          timestamp: { lte: watermarkDate },
          deliveredAt: null,
        },
        data: {
          deliveredAt: watermarkDate,
          status: 'DELIVERED',
        }
      })
      if (result.count > 0) {
        console.log(`[Messenger Webhook] Marked ${result.count} messages as delivered`)
      }
    }
  }
}

/**
 * Handle postback event (button clicks)
 */
async function handlePostbackEvent(
  facebookPageId: string,
  userId: string,
  postback: MessengerPostbackPayload,
  senderId: string,
  timestamp: Date
): Promise<void> {
  // Find or create conversation
  let conversation = await prisma.messengerConversation.findFirst({
    where: {
      facebookPageId,
      participantPsid: senderId,
    }
  })

  if (!conversation) {
    conversation = await prisma.messengerConversation.create({
      data: {
        facebookPageId,
        participantPsid: senderId,
        lastMessageAt: timestamp,
        unreadCount: 1,
      }
    })
  }

  // Create a message record for the postback
  await prisma.messengerMessage.create({
    data: {
      conversationId: conversation.id,
      mid: postback.mid,
      direction: 'INBOUND',
      messageType: 'TEXT',
      text: `[Postback] ${postback.title}: ${postback.payload}`,
      status: 'SENT',
      timestamp,
    }
  })

  // Update messaging window
  const windowExpiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000)
  await prisma.messengerConversation.update({
    where: { id: conversation.id },
    data: {
      lastMessageAt: timestamp,
      lastInboundAt: timestamp,
      windowExpiresAt,
      isWindowActive: true,
      unreadCount: { increment: 1 },
    }
  })
}

/**
 * Parse message content and determine type
 */
function parseMessageContent(message: MessengerMessagePayload): {
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'FILE' | 'STICKER' | 'TEMPLATE' | 'QUICK_REPLY' | 'REACTION'
  text?: string
  mediaUrl?: string
  mediaType?: string
  fileName?: string
  stickerUrl?: string
  quickReplyPayload?: string
} {
  // Check for quick reply first
  if (message.quick_reply) {
    return {
      messageType: 'QUICK_REPLY',
      text: message.text,
      quickReplyPayload: message.quick_reply.payload,
    }
  }

  // Check for attachments
  if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0]
    const type = attachment.type

    // Handle different attachment types
    if (type === 'image') {
      return {
        messageType: 'IMAGE',
        mediaUrl: attachment.payload.url,
        mediaType: 'image',
        text: message.text,
      }
    }

    if (type === 'video') {
      return {
        messageType: 'VIDEO',
        mediaUrl: attachment.payload.url,
        mediaType: 'video',
        text: message.text,
      }
    }

    if (type === 'audio') {
      return {
        messageType: 'AUDIO',
        mediaUrl: attachment.payload.url,
        mediaType: 'audio',
        text: message.text,
      }
    }

    if (type === 'file') {
      return {
        messageType: 'FILE',
        mediaUrl: attachment.payload.url,
        mediaType: 'file',
        fileName: attachment.payload.title,
        text: message.text,
      }
    }

    // Check for sticker
    if (attachment.payload.sticker_id) {
      return {
        messageType: 'STICKER',
        stickerUrl: attachment.payload.url,
      }
    }

    // Handle template or fallback
    if (type === 'template' || type === 'fallback') {
      return {
        messageType: 'TEMPLATE',
        text: message.text || attachment.payload.title,
      }
    }
  }

  // Default to text message
  return {
    messageType: 'TEXT',
    text: message.text,
  }
}

/**
 * Get a preview string for non-text messages
 */
function getMessagePreview(messageType: string): string {
  const previews: Record<string, string> = {
    IMAGE: '📷 Image',
    VIDEO: '🎥 Video',
    AUDIO: '🎵 Audio',
    FILE: '📎 File',
    STICKER: '🎨 Sticker',
    TEMPLATE: '📋 Template',
    QUICK_REPLY: '⚡ Quick Reply',
    REACTION: '❤️ Reaction',
  }
  return previews[messageType] || 'Message'
}

/**
 * Log webhook processing errors
 */
async function logWebhookError(
  facebookPageId: string,
  action: string,
  error: unknown,
  eventData?: any
): Promise<void> {
  try {
    await prisma.messengerConnectionLog.create({
      data: {
        facebookPageId,
        action,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        details: {
          timestamp: new Date().toISOString(),
          eventData: eventData ? JSON.stringify(eventData).substring(0, 1000) : undefined,
        }
      }
    })
  } catch (logError) {
    console.error('[Messenger Webhook] Failed to log error:', logError)
  }
}

export default app
