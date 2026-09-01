/**
 * Instagram Webhook Routes
 * Handles webhook verification and event processing
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10
 * AI Agent Assignment Requirements: 6.1, 6.2, 6.3
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import {
  instagramService,
  IGWebhookEvent,
  IGMessagingEvent,
  IGMessagePayload,
  IGReactionPayload,
  IGReadPayload,
  IGPostbackPayload,
  IGReferralPayload
} from '../../services/InstagramService.js'
import { webhookService } from '../../services/webhook-service.js'
import { eventEmitter } from '../../websocket/index.js'
import { AIOrchestrator } from '../../services/ai/AIOrchestrator.js'
import { AutoTaggingService } from '../../services/auto-tagging-service.js'

// AI Orchestrator instance for Instagram auto-reply
const aiOrchestrator = new AIOrchestrator()

const app = new Hono()

/**
 * GET /webhooks - Webhook verification endpoint
 * Used by Meta to verify webhook subscription
 * Requirements: 2.1
 */
app.get('/', async (c: Context) => {
  try {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')

    if (!mode || !token || !challenge) {
      console.log('[IG Webhook] Missing verification parameters')
      return c.text('Missing parameters', 400)
    }

    // Verify the webhook challenge (uses database settings with caching)
    const result = await instagramService.verifyWebhookChallengeAsync(mode, token, challenge)

    if (result) {
      console.log('[IG Webhook] Verification successful')
      return c.text(result, 200)
    }

    console.log('[IG Webhook] Verification failed - token mismatch')
    return c.text('Verification failed', 403)
  } catch (error) {
    console.error('[IG Webhook] Verification error:', error)
    return c.text('Internal error', 500)
  }
})

/**
 * POST /webhooks - Receive webhook events
 * Processes incoming Instagram messaging events
 * Requirements: 2.1, 2.10
 */
app.post('/', async (c: Context) => {
  console.log('[IG Webhook] 📥 Pesan diterima')
  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text()

    // SECURITY: Check body size limit (1MB max)
    if (rawBody.length > 1048576) {
      console.error('[IG Webhook] Payload too large')
      return c.json({ error: 'Payload too large' }, 413)
    }

    const signature = c.req.header('x-hub-signature-256')

    // Verify webhook signature (Requirement 2.10) - uses database settings with caching
    const isValidSignature = await instagramService.verifyWebhookSignatureAsync(rawBody, signature)
    if (!signature || !isValidSignature) {
      console.error('[IG Webhook] Invalid signature - SECURITY ALERT')
      // Return 403 for security monitoring (attackers should know they failed)
      return c.json({ error: 'Invalid signature' }, 403)
    }

    console.log('[IG Webhook] ✅ Signature verified')

    // Parse the webhook payload
    let payload: IGWebhookEvent
    try {
      payload = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('[IG Webhook] Failed to parse payload:', parseError)
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    // Verify this is an Instagram webhook
    if (payload.object !== 'instagram') {
      console.log('[IG Webhook] Not an Instagram webhook, ignoring')
      return c.json({ status: 'ignored' }, 200)
    }

    // Process each entry asynchronously (don't block response)
    // Always return 200 immediately to prevent retries (Requirement 2.10)
    processWebhookEntries(payload).catch(error => {
      console.error('[IG Webhook] Background processing error:', error)
    })

    return c.json({ status: 'received' }, 200)
  } catch (error) {
    console.error('[IG Webhook] Error processing webhook:', error)
    // Always return 200 to prevent retries (Requirement 2.10)
    return c.json({ status: 'error' }, 200)
  }
})

/**
 * Process webhook entries in the background
 */
async function processWebhookEntries(payload: IGWebhookEvent): Promise<void> {
  for (const entry of payload.entry) {
    const igId = entry.id // Instagram Professional Account ID
    const timestamp = entry.time

    console.log(`[IG Webhook] Processing entry for IG ID: ${igId}`)

    // Find the Instagram account
    const igAccount = await prisma.instagramAccount.findUnique({
      where: { igId },
      select: {
        id: true,
        igId: true,
        accessToken: true,
        accessTokenIV: true,
        accessTokenTag: true,
        connectionStatus: true,
      }
    })

    if (!igAccount) {
      console.log(`[IG Webhook] Instagram account not found for IG ID: ${igId}`)
      continue
    }

    if (igAccount.connectionStatus !== 'connected') {
      console.log(`[IG Webhook] Instagram account not connected: ${igId}`)
      continue
    }

    // Process messaging events
    if (entry.messaging) {
      for (const event of entry.messaging) {
        try {
          await processMessagingEvent(igAccount.id, igId, event)
        } catch (eventError) {
          console.error(`[IG Webhook] Error processing event:`, eventError)
          // Log error but continue processing other events
          await logWebhookError(igAccount.id, 'event_processing_error', eventError, event)
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
  instagramAccountId: string,
  igId: string,
  event: IGMessagingEvent
): Promise<void> {
  const senderId = event.sender.id
  const recipientId = event.recipient.id
  const eventTimestamp = new Date(event.timestamp)

  console.log(`[IG Webhook] Processing event - sender: ${senderId}, recipient: ${recipientId}`)

  // Determine if this is an inbound or outbound message
  // Inbound: sender is the Instagram user, recipient is our IG account
  // Outbound (echo): sender is our IG account
  const isInbound = recipientId === igId

  if (event.message) {
    // Handle message event (Requirement 2.2)
    await handleMessageEvent(instagramAccountId, igId, event, isInbound, eventTimestamp)

    // Also handle referral if embedded in message
    if (event.message.referral) {
      await handleReferralEvent(instagramAccountId, event.message.referral, senderId, eventTimestamp)
    }
  } else if (event.reaction) {
    // Handle reaction event (Requirement 2.9)
    await handleReactionEvent(instagramAccountId, event.reaction)
  } else if (event.read) {
    // Handle read receipt event (Requirement 2.8)
    await handleReadEvent(instagramAccountId, event.read, senderId)
  } else if (event.postback) {
    // Handle postback event
    await handlePostbackEvent(instagramAccountId, event.postback, senderId, eventTimestamp)
  } else if (event.referral) {
    // Handle standalone referral event
    await handleReferralEvent(instagramAccountId, event.referral, senderId, eventTimestamp)
  }
}

/**
 * Handle incoming message event
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.7
 */
async function handleMessageEvent(
  instagramAccountId: string,
  igId: string,
  event: IGMessagingEvent,
  isInbound: boolean,
  timestamp: Date
): Promise<void> {
  const message = event.message!
  const participantIgsid = isInbound ? event.sender.id : event.recipient.id

  // Skip echo messages (messages we sent)
  if (message.is_echo) {
    console.log(`[IG Webhook] Skipping echo message: ${message.mid}`)
    return
  }

  // Skip deleted messages
  if (message.is_deleted) {
    console.log(`[IG Webhook] Skipping deleted message: ${message.mid}`)
    return
  }

  // Find or create conversation (Requirement 2.2)
  let conversation = await prisma.iGConversation.findUnique({
    where: {
      instagramAccountId_participantIgsid: {
        instagramAccountId,
        participantIgsid,
      }
    },
    include: {
      instagramAccount: {
        select: {
          userId: true,
        }
      }
    }
  })

  const isNewConversation = !conversation

  if (!conversation) {
    // Get Instagram account to get userId
    const igAccount = await prisma.instagramAccount.findUnique({
      where: { id: instagramAccountId },
      select: { userId: true }
    })

    if (!igAccount) {
      console.log(`[IG Webhook] Instagram account not found: ${instagramAccountId}`)
      return
    }

    // Create new conversation
    conversation = await prisma.iGConversation.create({
      data: {
        instagramAccountId,
        participantIgsid,
        folder: 'primary', // Default to primary folder
        lastMessageAt: timestamp,
        unreadCount: isInbound ? 1 : 0,
      },
      include: {
        instagramAccount: {
          select: {
            userId: true,
          }
        }
      }
    })
    console.log(`[IG Webhook] Created new conversation: ${conversation.id}`)
  }

  // Fetch sender profile for new conversations or if profile is missing (Requirement 2.3)
  let profileUsername: string | undefined
  if (isInbound && (isNewConversation || !conversation.participantUsername)) {
    try {
      const accessToken = await instagramService.getDecryptedToken(instagramAccountId)
      const profile = await instagramService.getUserProfile(accessToken, participantIgsid)

      if (profile) {
        profileUsername = profile.username
        await prisma.iGConversation.update({
          where: { id: conversation.id },
          data: {
            participantUsername: profile.username,
            participantName: profile.name,
            participantProfilePic: profile.profilePic,
            followerCount: profile.followerCount,
            isFollower: profile.isUserFollowBusiness || false,
            isFollowing: profile.isBusinessFollowUser || false,
          }
        })
        console.log(`[IG Webhook] Updated profile for conversation: ${conversation.id}`)
      }
    } catch (profileError) {
      // Log but don't fail - profile fetch is not critical (Requirement 2.12)
      console.error(`[IG Webhook] Failed to fetch profile for ${participantIgsid}:`, profileError)
    }
  }

  // Find or create Customer record for this Instagram conversation
  if (isInbound && !conversation.customerId) {
    try {
      const userId = conversation.instagramAccount.userId
      const username = profileUsername || conversation.participantUsername

      if (username) {
        // Try to find existing customer by Instagram username
        let customer = await prisma.customer.findFirst({
          where: {
            userId,
            instagramUsername: username,
          }
        })

        if (!customer) {
          // Create new customer
          // Use Instagram IGSID as phoneNumber placeholder (prefixed with 'ig_')
          // This ensures uniqueness while indicating it's an Instagram-only customer
          const phoneNumberPlaceholder = `ig_${participantIgsid}`

          customer = await prisma.customer.create({
            data: {
              userId,
              phoneNumber: phoneNumberPlaceholder,
              instagramIgsid: participantIgsid,
              instagramUsername: username,
              name: conversation.participantName || username,
            }
          })
          console.log(`[IG Webhook] Created new customer: ${customer.id} for Instagram user: ${username}`)
        }

        // Link conversation to customer
        await prisma.iGConversation.update({
          where: { id: conversation.id },
          data: { customerId: customer.id }
        })

        // Update conversation object for webhook emission
        conversation.customerId = customer.id
        console.log(`[IG Webhook] Linked conversation ${conversation.id} to customer ${customer.id}`)
      }
    } catch (customerError) {
      console.error(`[IG Webhook] Failed to create/link customer:`, customerError)
      // Continue processing - not critical
    }
  }

  // Determine message type and content
  const { messageType, text, mediaUrl, mediaType, storyId, sharedPostUrl } = parseMessageContent(message)

  // Create the message record (catch P2002 for duplicate webhooks)
  let igMessage: any
  let isDuplicate = false

  try {
    igMessage = await prisma.iGMessage.create({
      data: {
        conversationId: conversation.id,
        igMessageId: message.mid,
        direction: isInbound ? 'INBOUND' : 'OUTBOUND',
        messageType,
        text,
        mediaUrl,
        mediaType,
        storyId,
        sharedPostUrl,
        status: 'SENT',
        timestamp,
      }
    })
    console.log(`[IG Webhook] Created message: ${igMessage.id}`)
  } catch (error: any) {
    // Handle duplicate webhook (P2002 = unique constraint violation)
    if (error?.code === 'P2002') {
      isDuplicate = true
      console.log(`[IG Webhook] Duplicate message detected: ${message.mid}, skipping further processing`)
      // For duplicates, find the existing message to get its ID
      igMessage = await prisma.iGMessage.findUnique({
        where: { igMessageId: message.mid }
      })
      if (!igMessage) {
        console.error(`[IG Webhook] Could not find duplicate message: ${message.mid}`)
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

  // Update messaging window for inbound messages (Requirement 2.4)
  if (isInbound) {
    const windowExpiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000) // 24 hours
    updateData.lastInboundAt = timestamp
    updateData.windowExpiresAt = windowExpiresAt
    updateData.isWindowActive = true
    updateData.unreadCount = { increment: 1 }

    // Move to general folder after first reply (if not already)
    if (conversation.folder === 'requests') {
      updateData.folder = 'general'
    }
  }

  await prisma.iGConversation.update({
    where: { id: conversation.id },
    data: updateData,
  })

  // Emit webhook event for inbound messages (Requirement 3.1, 8.1, 8.2, 8.4)
  if (isInbound && conversation.customerId) {
    webhookService.emitEvent(
      conversation.instagramAccount.userId,
      'message.received',
      'instagram',
      instagramAccountId,
      {
        message_id: igMessage.id,
        customer_id: conversation.customerId, // Always use customerId now
        customer_username: conversation.participantUsername || undefined,
        direction: 'inbound',
        message_type: messageType.toLowerCase(),
        content: text || undefined,
        media_url: mediaUrl || sharedPostUrl || undefined,
      }
    ).catch(err => console.error('[IG Webhook] Failed to emit message.received webhook:', err))

    // Emit WebSocket event for real-time UI update (Requirement 2.2)
    // Broadcast to business room so all team members receive the message
    eventEmitter.emitNewMessageToBusinessRoom(conversation.instagramAccount.userId, {
      conversationId: `ig-${conversation.id}`,  // Add 'ig-' prefix to match frontend UnifiedConversation.id
      channel: 'instagram',
      participantId: participantIgsid,
      participantName: conversation.participantName || conversation.participantUsername || null,
      message: {
        id: igMessage.id,
        preview: (text || getMessagePreview(messageType)).substring(0, 100),
        timestamp: igMessage.timestamp.toISOString(),
        direction: 'inbound',
      },
    })

    // Also emit to assigned agent if conversation is assigned to a human agent
    // Requirements: 5.3, 6.2 - Agents should receive real-time updates for their assigned conversations
    try {
      const assignment = await prisma.conversationAssignment.findFirst({
        where: {
          businessOwnerId: conversation.instagramAccount.userId,
          conversationType: 'INSTAGRAM',
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
      if (assignment?.assigneeId && assignment.assigneeId !== conversation.instagramAccount.userId) {
        console.log(`[IG Webhook] Assigned agent ${assignment.assigneeId} already received message via business room broadcast`)
      }
    } catch (err) {
      console.error('[IG Webhook] Failed to emit to assigned agent:', err)
    }

    // Process auto-tagging rules for inbound messages
    if (text && conversation.customerId) {
      AutoTaggingService.processInboundMessage(
        conversation.instagramAccount.userId,
        conversation.customerId,
        text
      )
        .then(result => {
          if (result.matched) {
            console.log(`[IG Webhook] 🏷️ Auto-tagging applied: ${result.rulesMatched.join(', ')}`)
            if (result.tagsAdded.length > 0) {
              console.log(`[IG Webhook]    Tags added: ${result.tagsAdded.join(', ')}`)
            }
            if (result.stageChanged) {
              console.log(`[IG Webhook]    Stage changed to: ${result.newStageName}`)
            }
          }
        })
        .catch(err => console.error(`[IG Webhook] Failed to process auto-tagging:`, err))
    }

    // --- AI Auto-Reply Logic with Assignment Check ---
    // Requirements: 6.1, 6.2, 6.3 - Check assignment status before AI response
    if (messageType === 'TEXT' && text) {
      try {
        const userId = conversation.instagramAccount.userId

        // Get user to check subscription tier
        const user = await prisma.user.findUnique({
          where: { id: userId },
          select: { subscriptionTier: true }
        })

        // Check subscription tier
        if (user?.subscriptionTier === 'FREE') {
          console.log('[IG Webhook] AI Auto-Reply skipped: User is on FREE tier', userId)
        } else {
          // Process AI response with assignment check (Requirements: 6.1, 6.2, 6.3)
          // - If assigned to human → skip AI response
          // - If assigned to AI Agent → use that AI Agent's configuration
          // - If unassigned with AI enabled → use default AI Agent
          // Use IGConversation ID for assignment lookup (prefixed with 'ig-' to match frontend)
          const response = await aiOrchestrator.handleMessageWithAssignmentCheck(
            userId,
            text,
            conversation.id, // conversationId for Instagram is the IGConversation ID
            'INSTAGRAM',     // conversationType
            conversation.customerId || undefined // customerId for conversation history
          )

          if (response) {
            console.log('[IG Webhook] 🤖 AI Auto-Reply generated for:', message.mid)

            // Send typing indicator before reply
            try {
              await instagramService.sendTypingOn(igId, participantIgsid)
            } catch (typingError) {
              console.error('[IG Webhook] Failed to send typing indicator:', typingError)
            }

            // Send the AI response
            const sendResult = await instagramService.sendTextMessage(igId, participantIgsid, response)

            // Save AI reply to database
            const aiReplyMessage = await prisma.iGMessage.create({
              data: {
                conversationId: conversation.id,
                igMessageId: sendResult.messageId,
                direction: 'OUTBOUND',
                messageType: 'TEXT',
                text: response,
                status: 'SENT',
                timestamp: new Date(),
              }
            })

            console.log('[IG Webhook] 🤖 AI Auto-Reply terkirim')

            // Emit webhook event for message.sent
            if (conversation.customerId) {
              webhookService.emitEvent(
                userId,
                'message.sent',
                'instagram',
                instagramAccountId,
                {
                  message_id: aiReplyMessage.id,
                  customer_id: conversation.customerId,
                  customer_username: conversation.participantUsername || undefined,
                  direction: 'outbound',
                  message_type: 'text',
                  content: response,
                }
              ).catch(err => console.error('[IG Webhook] Failed to emit message.sent webhook:', err))
            }
          }
        }
      } catch (aiError) {
        console.error('[IG Webhook] ❌ Error in AI Auto-Reply:', aiError)
        // Don't throw - we don't want to fail the entire webhook processing
      }
    }
  } else if (isInbound && !conversation.customerId) {
    console.warn(`[IG Webhook] Cannot emit webhook - no customer linked to conversation ${conversation.id}`)
  }
}

/**
 * Handle reaction event
 * Requirement: 2.9
 */
async function handleReactionEvent(
  instagramAccountId: string,
  reaction: IGReactionPayload
): Promise<void> {
  const messageId = reaction.mid
  const action = reaction.action
  const reactionType = reaction.reaction || reaction.emoji

  console.log(`[IG Webhook] Reaction event - message: ${messageId}, action: ${action}, reaction: ${reactionType}`)

  // Find the message
  const message = await prisma.iGMessage.findUnique({
    where: { igMessageId: messageId },
    include: { conversation: true }
  })

  if (!message) {
    console.log(`[IG Webhook] Message not found for reaction: ${messageId}`)
    return
  }

  // Verify the message belongs to the correct Instagram account
  if (message.conversation.instagramAccountId !== instagramAccountId) {
    console.log(`[IG Webhook] Message does not belong to this account`)
    return
  }

  // Update or remove reaction
  if (action === 'react') {
    await prisma.iGMessage.update({
      where: { id: message.id },
      data: { reaction: reactionType || 'love' }
    })
    console.log(`[IG Webhook] Added reaction to message: ${message.id}`)
  } else if (action === 'unreact') {
    await prisma.iGMessage.update({
      where: { id: message.id },
      data: { reaction: null }
    })
    console.log(`[IG Webhook] Removed reaction from message: ${message.id}`)
  }
}

/**
 * Handle read receipt event
 * Requirement: 2.8
 * 
 * Instagram can send read events with either:
 * - watermark: timestamp of when messages were read
 * - mid: specific message ID that was read
 */
async function handleReadEvent(
  instagramAccountId: string,
  read: IGReadPayload,
  senderId: string
): Promise<void> {
  const watermark = read.watermark
  const messageId = (read as any).mid // Instagram sometimes sends mid instead of watermark

  console.log(`[IG Webhook] Read event - watermark: ${watermark}, mid: ${messageId}, sender: ${senderId}`)

  // Find the conversation with this participant
  const conversation = await prisma.iGConversation.findFirst({
    where: {
      instagramAccountId,
      participantIgsid: senderId,
    }
  })

  if (!conversation) {
    console.log(`[IG Webhook] Conversation not found for read event`)
    return
  }

  let messagesToUpdate: { id: string; text: string | null; mediaUrl: string | null; messageType: string }[] = []
  const readAt = new Date()

  // Handle read event by specific message ID
  if (messageId) {
    // Find the specific message
    const message = await prisma.iGMessage.findUnique({
      where: { igMessageId: messageId },
      select: {
        id: true,
        conversationId: true,
        direction: true,
        text: true,
        mediaUrl: true,
        messageType: true,
        timestamp: true,
        readAt: true,
      }
    })

    if (message && message.conversationId === conversation.id && message.direction === 'OUTBOUND' && !message.readAt) {
      messagesToUpdate = [{
        id: message.id,
        text: message.text,
        mediaUrl: message.mediaUrl,
        messageType: message.messageType,
      }]

      // Also mark all messages before this one as read
      await prisma.iGMessage.updateMany({
        where: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          timestamp: { lte: message.timestamp },
          readAt: null,
        },
        data: {
          readAt: readAt,
          status: 'READ',
        }
      })

      console.log(`[IG Webhook] Marked message ${messageId} and prior messages as read`)
    } else {
      console.log(`[IG Webhook] Message ${messageId} not found, already read, or not outbound`)
    }
  }
  // Handle read event by watermark timestamp
  else if (watermark && typeof watermark === 'number') {
    const watermarkDate = new Date(watermark)

    // Double-check the Date is valid
    if (isNaN(watermarkDate.getTime())) {
      console.log(`[IG Webhook] Invalid Date from watermark: ${watermark}, skipping read event`)
      return
    }

    // Find messages that will be marked as read (for webhook emission)
    messagesToUpdate = await prisma.iGMessage.findMany({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        timestamp: { lte: watermarkDate },
        readAt: null,
      },
      select: {
        id: true,
        text: true,
        mediaUrl: true,
        messageType: true,
      }
    })

    // Update all outbound messages before the watermark as read
    const result = await prisma.iGMessage.updateMany({
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

    console.log(`[IG Webhook] Marked ${result.count} messages as read (by watermark)`)
  } else {
    console.log(`[IG Webhook] No valid watermark or mid provided, skipping read event`)
    return
  }

  // Emit webhook events for read messages (Requirement 3.1, 8.1, 8.2, 8.4)
  if (messagesToUpdate.length > 0 && conversation.customerId) {
    const igAccount = await prisma.instagramAccount.findUnique({
      where: { id: instagramAccountId },
      select: { userId: true }
    })

    if (igAccount) {
      // Emit message.read for each message that was marked as read
      for (const msg of messagesToUpdate) {
        webhookService.emitEvent(
          igAccount.userId,
          'message.read',
          'instagram',
          instagramAccountId,
          {
            message_id: msg.id,
            customer_id: conversation.customerId, // Use customerId
            customer_username: conversation.participantUsername || undefined,
            direction: 'outbound',
            message_type: msg.messageType.toLowerCase(),
            content: msg.text || undefined,
            media_url: msg.mediaUrl || undefined,
          }
        ).catch(err => console.error('[IG Webhook] Failed to emit message.read webhook:', err))
      }
    }
  }
}

/**
 * Handle postback event
 */
async function handlePostbackEvent(
  instagramAccountId: string,
  postback: IGPostbackPayload,
  senderId: string,
  timestamp: Date
): Promise<void> {
  console.log(`[IG Webhook] Postback event - title: ${postback.title}, payload: ${postback.payload}`)

  // Find or create conversation
  let conversation = await prisma.iGConversation.findFirst({
    where: {
      instagramAccountId,
      participantIgsid: senderId,
    }
  })

  if (!conversation) {
    conversation = await prisma.iGConversation.create({
      data: {
        instagramAccountId,
        participantIgsid: senderId,
        folder: 'primary',
        lastMessageAt: timestamp,
        unreadCount: 1,
      }
    })
  }

  // Create a message record for the postback
  await prisma.iGMessage.create({
    data: {
      conversationId: conversation.id,
      igMessageId: postback.mid,
      direction: 'INBOUND',
      messageType: 'TEXT',
      text: `[Postback] ${postback.title}: ${postback.payload}`,
      status: 'SENT',
      timestamp,
    }
  })

  // Update messaging window
  const windowExpiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000)
  await prisma.iGConversation.update({
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
 * Handle referral event
 * Referrals occur when a user clicks on an ad, link, or other entry point
 */
async function handleReferralEvent(
  instagramAccountId: string,
  referral: IGReferralPayload,
  senderId: string,
  timestamp: Date
): Promise<void> {
  console.log(`[IG Webhook] Referral event - ref: ${referral.ref}, source: ${referral.source}, type: ${referral.type}`)

  // Find or create conversation
  let conversation = await prisma.iGConversation.findFirst({
    where: {
      instagramAccountId,
      participantIgsid: senderId,
    }
  })

  if (!conversation) {
    conversation = await prisma.iGConversation.create({
      data: {
        instagramAccountId,
        participantIgsid: senderId,
        folder: 'primary',
        lastMessageAt: timestamp,
        unreadCount: 1,
      }
    })
  }

  // Create a message record for the referral
  const referralText = `[Referral] Source: ${referral.source || 'unknown'}, Type: ${referral.type || 'unknown'}${referral.ref ? `, Ref: ${referral.ref}` : ''}`

  await prisma.iGMessage.create({
    data: {
      conversationId: conversation.id,
      direction: 'INBOUND',
      messageType: 'TEXT',
      text: referralText,
      status: 'SENT',
      timestamp,
    }
  })

  // Update messaging window (referrals open the window)
  const windowExpiresAt = new Date(timestamp.getTime() + 24 * 60 * 60 * 1000)
  await prisma.iGConversation.update({
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
 * Requirements: 2.5, 2.6, 2.7
 */
function parseMessageContent(message: IGMessagePayload): {
  messageType: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | 'STICKER' | 'STORY_REPLY' | 'STORY_MENTION' | 'MEDIA_SHARE' | 'REACTION'
  text?: string
  mediaUrl?: string
  mediaType?: string
  storyId?: string
  sharedPostUrl?: string
} {
  // Check for story reply (Requirement 2.6)
  if (message.reply_to?.story) {
    return {
      messageType: 'STORY_REPLY',
      text: message.text,
      storyId: message.reply_to.story.id,
      mediaUrl: message.reply_to.story.url,
    }
  }

  // Check for attachments
  if (message.attachments && message.attachments.length > 0) {
    const attachment = message.attachments[0]
    const type = attachment.type.toLowerCase()

    // Handle different attachment types (Requirement 2.5)
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

    if (type === 'sticker' || attachment.payload.sticker_id) {
      return {
        messageType: 'STICKER',
        mediaUrl: attachment.payload.url,
      }
    }

    // Handle shared media/posts (Requirement 2.7)
    if (type === 'share' || type === 'media_share') {
      return {
        messageType: 'MEDIA_SHARE',
        sharedPostUrl: attachment.payload.url,
        text: message.text,
      }
    }

    // Handle story mention (Requirement 2.6)
    if (type === 'story_mention') {
      return {
        messageType: 'STORY_MENTION',
        mediaUrl: attachment.payload.url,
        text: message.text,
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
    STICKER: '🎨 Sticker',
    STORY_REPLY: '📖 Story Reply',
    STORY_MENTION: '📖 Story Mention',
    MEDIA_SHARE: '🔗 Shared Post',
    REACTION: '❤️ Reaction',
  }
  return previews[messageType] || 'Message'
}

/**
 * Log webhook processing errors
 */
async function logWebhookError(
  instagramAccountId: string,
  action: string,
  error: unknown,
  eventData?: any
): Promise<void> {
  try {
    await prisma.iGConnectionLog.create({
      data: {
        instagramAccountId,
        action,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        details: {
          timestamp: new Date().toISOString(),
          eventData: eventData ? JSON.stringify(eventData).substring(0, 1000) : undefined,
        }
      }
    })
  } catch (logError) {
    console.error('[IG Webhook] Failed to log error:', logError)
  }
}

export default app
