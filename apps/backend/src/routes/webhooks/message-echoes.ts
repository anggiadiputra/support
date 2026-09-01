/**
 * Coexistence Message Echoes Webhook Handler
 * Handles messages sent via WhatsApp Business App (smb_message_echoes)
 * Mirrors these messages in the platform for unified message history
 */

import { prisma } from '../../utils/database.js'
import type { MessageType, MessageDirection, MessageStatus, MessageSource } from '@prisma/client'
import { memoryQueue } from '../../utils/queue.js'
import { createMemoryVectorStore } from '../../services/ai/memory/index.js'
import { OpenAIProvider } from '../../services/ai/providers/OpenAIProvider.js'
import { logger } from '../../utils/logger.js'

interface MessageEchoPayload {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  message_echoes: Array<{
    from: string
    to: string
    id: string
    timestamp: string
    type: string
    [key: string]: any // Message content based on type
  }>
}

/**
 * Check if user has AI chatbot feature (non-FREE subscription tier)
 */
async function hasAIChatbotFeature(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true }
  });
  return user?.subscriptionTier !== 'FREE';
}

/**
 * Handle message echoes webhook (smb_message_echoes)
 * Processes messages sent by business via WhatsApp Business App
 */
export async function handleMessageEchoes(
  payload: MessageEchoPayload,
  user: any
): Promise<void> {
  try {
    if (!user) {
      logger.warn('Message echoes webhook received but user not found')
      return
    }

    logger.debug('Processing message echoes', { userId: user.id, count: payload.message_echoes?.length ?? 0 })

    for (const echoMessage of payload.message_echoes) {
      try {
        // Skip if message already exists
        const existing = await prisma.message.findFirst({
          where: { wamId: echoMessage.id }
        })
        if (existing) {
          logger.debug('Echo message already exists, skipping', { messageId: echoMessage.id })
          continue
        }

        // Get or create customer
        const customerPhoneNumber = echoMessage.to
        let customer = await prisma.customer.findFirst({
          where: {
            userId: user.id,
            phoneNumber: customerPhoneNumber
          }
        })

        if (!customer) {
          customer = await prisma.customer.create({
            data: {
              userId: user.id,
              phoneNumber: customerPhoneNumber,
              consentStatus: false
            }
          })
          // phoneNumber key gets masked by the serializer (PII_PHONE_KEYS).
          logger.info('Created customer from message echo', { customerId: customer.id, phoneNumber: customerPhoneNumber })
        }

        // Map message type
        const messageType = mapMessageType(echoMessage.type)

        // Extract message content
        const content = extractMessageContent(echoMessage)

        // Extract media URL if present
        const mediaUrl = extractMediaUrl(echoMessage)

        // Create message record with source = WHATSAPP_APP
        const message = await prisma.message.create({
          data: {
            userId: user.id,
            customerId: customer.id,
            wamId: echoMessage.id,
            messageType,
            direction: 'OUTBOUND', // Business always sends outbound
            content,
            mediaUrl,
            status: 'SENT', // Initial status
            source: 'WHATSAPP_APP',
            deviceTimestamp: new Date(parseInt(echoMessage.timestamp) * 1000),
            timestamp: new Date(parseInt(echoMessage.timestamp) * 1000),
            isHistoryMessage: false
          }
        })

        logger.debug('Mirrored WhatsApp Business App message', { messageId: message.id, wamId: echoMessage.id })

        // Queue memory for SMB echo if user has AI chatbot feature
        if (await hasAIChatbotFeature(user.id) && content) {
          try {
            // Get last customer inbound message
            const lastInboundMessage = await prisma.message.findFirst({
              where: {
                customerId: customer.id,
                direction: 'INBOUND',
                messageType: 'TEXT',
                content: { not: null },
              },
              orderBy: { timestamp: 'desc' },
            });

            // Get WhatsApp account for this phone number
            const phoneNumber = await prisma.phoneNumber.findFirst({
              where: { phoneNumberId: payload.metadata.phone_number_id },
              select: { whatsappAccountId: true }
            });

            if (lastInboundMessage?.content && phoneNumber?.whatsappAccountId) {
              const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '');
              const memoryStore = createMemoryVectorStore(openaiProvider);

              const memory = await memoryStore.createMemory({
                userId: user.id,
                customerId: customer.id,
                whatsappAccountId: phoneNumber.whatsappAccountId,
                memoryType: 'SMB_ECHO',
                customerMessage: lastInboundMessage.content,
                responseMessage: content,
                inboundMessageId: lastInboundMessage.id,
                outboundMessageId: message.id,
              });

              await memoryQueue.add('embed-memory', {
                type: 'embed-memory',
                memoryId: memory.id
              });
              logger.debug('Memory queued for SMB echo embedding', { memoryId: memory.id })
            }
          } catch (memoryError) {
            logger.error('Failed to queue SMB echo memory', {
              error: memoryError instanceof Error ? memoryError.message : String(memoryError),
            })
            // Don't throw - memory failure shouldn't affect main flow
          }
        }
      } catch (msgError) {
        logger.error('Failed to process message echo', {
          messageId: echoMessage.id,
          error: msgError instanceof Error ? msgError.message : String(msgError),
        })
      }
    }

    logger.debug('Message echoes processed', { userId: user.id })
  } catch (error) {
    logger.error('Message echoes webhook error', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

/**
 * Map WhatsApp message type to Prisma MessageType enum
 */
function mapMessageType(type: string): MessageType {
  const typeMap: Record<string, MessageType> = {
    text: 'TEXT',
    image: 'IMAGE',
    audio: 'AUDIO',
    video: 'VIDEO',
    document: 'DOCUMENT',
    sticker: 'STICKER',
    contacts: 'CONTACTS',
    location: 'LOCATION',
    template: 'TEMPLATE',
    button: 'BUTTONS',
    list: 'LIST'
  }
  return typeMap[type] || 'TEXT'
}

/**
 * Extract message content based on message type
 */
function extractMessageContent(message: any): string | null {
  if (message.text?.body) {
    return message.text.body
  }
  if (message.image?.caption) {
    return message.image.caption
  }
  if (message.video?.caption) {
    return message.video.caption
  }
  if (message.document?.caption) {
    return message.document.caption
  }
  if (message.document?.filename) {
    return `[Document: ${message.document.filename}]`
  }
  if (message.contacts) {
    return '[Contact]'
  }
  if (message.location) {
    return '[Location]'
  }
  return null
}

/**
 * Extract media URL from message
 */
function extractMediaUrl(message: any): string | null {
  if (message.image?.link || message.image?.id) {
    return message.image.link || message.image.id
  }
  if (message.video?.link || message.video?.id) {
    return message.video.link || message.video.id
  }
  if (message.audio?.link || message.audio?.id) {
    return message.audio.link || message.audio.id
  }
  if (message.document?.link || message.document?.id) {
    return message.document.link || message.document.id
  }
  return null
}
