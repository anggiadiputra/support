/**
 * Coexistence History Sync Webhook Handler
 * Handles message history synchronization from WhatsApp Business App
 */

import { prisma } from '../../utils/database.js'
import { logger } from '../../utils/logger.js'
import type { MessageType, MessageDirection, MessageStatus, MessageSource } from '@prisma/client'

interface HistoryWebhookPayload {
  messaging_product: string
  metadata: {
    display_phone_number: string
    phone_number_id: string
  }
  history: Array<{
    metadata?: {
      phase: number // 0, 1, or 2
      chunk_order: number
      progress: number // 0-100
    }
    threads?: Array<{
      // Optional since the BSUID rollout: omitted when the thread's user
      // adopted a username and Meta cannot share their phone. Identity then
      // lives in `context.user_id`. See docs/bsuid.md "History webhooks".
      id?: string // WhatsApp user phone number
      context?: {
        wa_id?: string
        user_id?: string // BSUID
        parent_user_id?: string
        username?: string
      }
      messages: Array<{
        from?: string
        from_user_id?: string
        to?: string
        id: string
        timestamp: string
        type: string
        history_context?: {
          status: string
        }
        [key: string]: any // Message content based on type
      }>
    }>
    errors?: Array<{
      code: number
      title: string
      message: string
      error_data?: {
        details: string
      }
    }>
  }>
}

/**
 * Handle history sync webhook
 * Processes message history in phases and chunks
 */
export async function handleHistorySync(
  payload: HistoryWebhookPayload,
  user: any
): Promise<void> {
  try {
    if (!user) {
      logger.warn('History sync webhook received but user not found')
      return
    }

    logger.info('Processing history sync', { userId: user.id })

    // Defensive check - history field may be undefined in some webhook payloads
    if (!payload.history || !Array.isArray(payload.history)) {
      // NEVER dump the full payload — it contains phone numbers, contact names,
      // and message previews for many customers in a single line. Summarize keys.
      logger.warn('History sync payload missing history array', {
        userId: user.id,
        payloadKeys: Object.keys(payload || {}),
        hasMetadata: !!payload?.metadata,
      })
      return
    }

    for (const historyData of payload.history) {
      // Check for error (user declined history sharing)
      if (historyData.errors && historyData.errors.length > 0) {
        const error = historyData.errors[0]

        if (error.code === 2593109) {
          // User declined history sharing
          logger.info('User declined history sharing', { userId: user.id })

          await prisma.whatsAppAccount.updateMany({
            where: { userId: user.id },
            data: {
              historySharingConsent: false,
              coexistenceSyncStatus: 'partial',
              historySyncCompletedAt: new Date()
            }
          })

          await prisma.coexistenceSyncStatus.updateMany({
            where: {
              userId: user.id,
              syncType: 'history'
            },
            data: {
              status: 'completed',
              progress: 100,
              errorMessage: 'User declined history sharing',
              errorCode: error.code
            }
          })
        }
        continue
      }

      // User approved history sharing
      await prisma.whatsAppAccount.updateMany({
        where: { userId: user.id },
        data: {
          historySharingConsent: true
        }
      })

      const metadata = historyData.metadata
      const threads = historyData.threads || []

      if (metadata) {
        const { phase, chunk_order, progress } = metadata

        logger.debug('History sync chunk', { phase, chunkOrder: chunk_order, progress })

        // Update sync status
        await prisma.coexistenceSyncStatus.updateMany({
          where: {
            userId: user.id,
            syncType: 'history'
          },
          data: {
            phase,
            chunkOrder: chunk_order,
            progress,
            status: progress === 100 ? 'completed' : 'in_progress',
            metadata: { phase, chunk_order }
          }
        })

        // Update account progress
        await prisma.whatsAppAccount.updateMany({
          where: { userId: user.id },
          data: {
            coexistenceSyncProgress: progress,
            coexistenceSyncStatus: progress === 100 ? 'completed' : 'in_progress',
            historySyncCompletedAt: progress === 100 ? new Date() : undefined
          }
        })
      }

      // ========================================
      // PERFORMANCE OPTIMIZATION: Batch operations instead of N+1 queries
      // BEFORE: 5,000+ queries for 100 customers × 50 messages
      // AFTER: ~5 queries total (99.9% reduction!)
      // ========================================

      // STEP 1: Collect all phone numbers and message IDs upfront
      const allPhoneNumbers = threads.map(t => t.id)
      const allMessageIds = threads.flatMap(t => t.messages.map(m => m.id))

      logger.debug('Processing history threads', { threadCount: threads.length, messageCount: allMessageIds.length })

      // STEP 2: Batch fetch existing customers (1 query instead of N)
      const existingCustomers = await prisma.customer.findMany({
        where: {
          userId: user.id,
          phoneNumber: { in: allPhoneNumbers }
        },
        select: {
          id: true,
          phoneNumber: true
        }
      })

      // Create map for O(1) lookup
      const customerMap = new Map(
        existingCustomers.map(c => [c.phoneNumber, c.id])
      )

      logger.debug('Found existing customers', { count: existingCustomers.length })

      // STEP 3: Batch fetch existing messages (1 query instead of M)
      const existingMessages = await prisma.message.findMany({
        where: {
          wamId: { in: allMessageIds }
        },
        select: {
          wamId: true
        }
      })

      // Create set for O(1) lookup
      const existingMessageSet = new Set(existingMessages.map(m => m.wamId))

      logger.debug('Found existing messages', { count: existingMessages.length })

      // STEP 4: Identify new customers to create
      const newCustomerPhones = allPhoneNumbers.filter(
        phone => !customerMap.has(phone)
      )

      if (newCustomerPhones.length > 0) {
        logger.debug('Creating new customers from history', { count: newCustomerPhones.length })

        // Batch insert customers (1 query instead of N)
        await prisma.customer.createMany({
          data: newCustomerPhones.map(phone => ({
            userId: user.id,
            phoneNumber: phone,
            consentStatus: true,
            consentCapturedAt: new Date(),
            consentSource: 'AUTO_HISTORY_SYNC',
            consentPurpose: 'Service messages from WhatsApp Business App history'
          })),
          skipDuplicates: true
        })

        // Fetch newly created customers to get their IDs
        const newCustomers = await prisma.customer.findMany({
          where: {
            userId: user.id,
            phoneNumber: { in: newCustomerPhones }
          },
          select: {
            id: true,
            phoneNumber: true
          }
        })

        // Update customer map with new customers
        newCustomers.forEach(c => customerMap.set(c.phoneNumber, c.id))

        // Best-effort BSUID enrichment: when a thread carries its identity
        // context (BSUID/username) alongside a phone, stamp it onto the
        // customer so the same person is anchored on their stable BSUID and
        // won't later re-appear as a separate BSUID-only row. Never null-out an
        // existing value; only fill when the column is empty. Non-fatal — a
        // failure here must not abort the history import.
        try {
          const phoneToBsuid = new Map<string, { bsuid: string; parentBsuid?: string; username?: string }>()
          for (const t of threads) {
            const ctx = t.context
            if (t.id && ctx?.user_id) {
              phoneToBsuid.set(t.id, {
                bsuid: ctx.user_id,
                parentBsuid: ctx.parent_user_id,
                username: ctx.username,
              })
            }
          }
          for (const [phone, ident] of phoneToBsuid) {
            const customerId = customerMap.get(phone)
            if (!customerId) continue
            await prisma.customer.updateMany({
              where: { id: customerId, whatsappBsuid: null },
              data: {
                whatsappBsuid: ident.bsuid,
                ...(ident.parentBsuid ? { whatsappParentBsuid: ident.parentBsuid } : {}),
                ...(ident.username ? { whatsappUsername: ident.username } : {}),
                bsuidMappedAt: new Date(),
              },
            })
          }
        } catch (err) {
          logger.warn('History sync BSUID enrichment failed (non-fatal)', {
            error: err instanceof Error ? err.message : String(err),
          })
        }

        // Batch insert consent logs (1 query instead of N)
        await prisma.consentLog.createMany({
          data: newCustomers.map(c => ({
            customerId: c.id,
            action: 'OPT_IN' as const,
            source: 'AUTO_HISTORY_SYNC',
            purpose: 'Service messages from WhatsApp Business App history',
            userId: user.id
          }))
        })

        logger.info('Created customers with consent logs', { count: newCustomers.length, userId: user.id })
      }

      // STEP 5: Prepare all messages for batch insert
      const messagesToCreate = []

      for (const thread of threads) {
        const customerId = customerMap.get(thread.id)
        if (!customerId) {
          // thread.id is the WhatsApp phone identifier — log via logger so the
          // serializer's `phone`-key mask doesn't apply but the value is bounded;
          // we use threadIdLength + suffix to keep diagnostic signal without PII.
          logger.warn('Customer not found for history thread', {
            userId: user.id,
            threadIdLength: thread.id?.length ?? 0,
          })
          continue
        }

        for (const message of thread.messages) {
          // Skip if message already exists (O(1) lookup in Set)
          if (existingMessageSet.has(message.id)) continue

          // Determine message direction
          const isSent = message.from === payload.metadata.phone_number_id ||
                        message.from === payload.metadata.display_phone_number
          const direction: MessageDirection = isSent ? 'OUTBOUND' : 'INBOUND'

          // Map message type
          const messageType = mapMessageType(message.type)

          // Extract message content
          const content = extractMessageContent(message)

          // Map message status
          const status = mapMessageStatus(message.history_context?.status)

          // Determine source
          const source: MessageSource = message.to ? 'WHATSAPP_APP' : 'API'

          messagesToCreate.push({
            userId: user.id,
            customerId,
            wamId: message.id,
            messageType,
            direction,
            content,
            status,
            source,
            deviceTimestamp: new Date(parseInt(message.timestamp) * 1000),
            isHistoryMessage: true,
            timestamp: new Date(parseInt(message.timestamp) * 1000)
          })
        }
      }

      // STEP 6: Batch insert all messages (1 query instead of M)
      if (messagesToCreate.length > 0) {
        logger.debug('Creating new messages from history', { count: messagesToCreate.length })

        await prisma.message.createMany({
          data: messagesToCreate,
          skipDuplicates: true
        })

        logger.info('Synced messages from history', { count: messagesToCreate.length, userId: user.id })
      } else {
        logger.debug('No new messages to sync')
      }
    }

    logger.info('History sync processed', { userId: user.id })
  } catch (error) {
    logger.error('History sync webhook error', {
      error: error instanceof Error ? error.message : String(error),
      userId: user?.id,
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
    list: 'LIST',
    media_placeholder: 'IMAGE' // Default for media placeholder
  }
  return typeMap[type] || 'TEXT'
}

/**
 * Map history status to Prisma MessageStatus enum
 */
function mapMessageStatus(status?: string): MessageStatus {
  const statusMap: Record<string, MessageStatus> = {
    DELIVERED: 'DELIVERED',
    READ: 'READ',
    SENT: 'SENT',
    PLAYED: 'PLAYED',
    PENDING: 'PENDING',
    ERROR: 'FAILED'
  }
  return statusMap[status || 'DELIVERED'] || 'DELIVERED'
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
  if (message.type === 'media_placeholder') {
    return '[Media]'
  }
  return null
}
