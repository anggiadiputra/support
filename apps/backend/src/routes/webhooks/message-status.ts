import { prisma } from '../../utils/database.js'
import { webhookService, WebhookEventType } from '../../services/webhook-service.js'
import { eventEmitter } from '../../websocket/event-emitter.js'
import { auditLog } from '../../utils/auditLog.js'
import { getWhatsAppErrorMessage } from '../../services/error-messages/index.js'
import { logger } from '../../utils/logger.js'
import type { MessageStatus } from '@prisma/client'

/**
 * Get human-readable error message for Meta error code
 * Uses centralized error-messages service with Indonesian locale for internal webhooks
 */
function getReadableErrorMessage(errorCode: number, fallbackMessage: string): string {
  const errorMsg = getWhatsAppErrorMessage(errorCode, 'id')
  return errorMsg?.message || fallbackMessage
}

/**
 * Shape of a single entry in the status webhook `contacts` array (Meta BSUID
 * update, docs/bsuid.md).
 *
 * IMPORTANT: The whole `contacts` array is OMITTED for `failed` status
 * webhooks (docs/bsuid.md line 653). Callers must handle undefined input.
 */
export interface StatusWebhookContact {
  profile?: { name?: string; username?: string }
  wa_id?: string
  user_id?: string
  parent_user_id?: string
}

export interface ExtractedStatusContact {
  bsuid: string | null
  parentBsuid: string | null
  username: string | null
  waId: string | null
  profileName: string | null
}

/**
 * Extract BSUID / username / phone from status webhook contacts array.
 * Returns all-nulls when `contacts` is undefined or empty, which is the case
 * for `failed` status webhooks per docs/bsuid.md line 653.
 */
export function extractStatusContactData(
  contacts: StatusWebhookContact[] | undefined,
): ExtractedStatusContact {
  const empty: ExtractedStatusContact = {
    bsuid: null,
    parentBsuid: null,
    username: null,
    waId: null,
    profileName: null,
  }
  if (!contacts || contacts.length === 0) return empty

  const first = contacts[0]
  return {
    bsuid: first.user_id ?? null,
    parentBsuid: first.parent_user_id ?? null,
    username: first.profile?.username ?? null,
    waId: first.wa_id ?? null,
    profileName: first.profile?.name ?? null,
  }
}

export async function handleMessageStatus(
  status: any,
  user: any
): Promise<void> {
  try {
    if (!user) {
      logger.error('User not found for status update')
      return
    }

    logger.debug('Processing message status', {
      messageId: status.id,
      status: status.status,
      userId: user.id,
      // status.errors goes through sanitizer; nested phone fields are masked
      // (see logger-serializer PII_PHONE_KEYS).
      ...(status.errors && { errors: status.errors }),
    })

    // Log detailed error info when message fails
    if (status.status === 'failed' && status.errors) {
      // Pass errors as structured meta so the sanitizer can mask any nested
      // recipient phone (Meta error_data.details sometimes includes it).
      logger.error('Message failed with errors', {
        messageId: status.id,
        errors: status.errors,
      })
    }

    // Find the message first to get customer info for webhook and broadcast job tracking
    const message = await prisma.message.findFirst({
      where: {
        wamId: status.id,
        userId: user.id
      },
      select: {
        id: true,
        customerId: true,
        direction: true,
        messageType: true,
        content: true,
        mediaUrl: true,
        status: true,
        bulkSendJobId: true,
        whatsappPhoneNumberId: true,
        whatsappPhoneNumber: {
          select: {
            id: true,
            displayPhoneNumber: true,
          }
        },
        customer: {
          select: {
            id: true,
            phoneNumber: true,
          }
        }
      }
    })

    // Extract BSUID data from status contacts array (docs/bsuid.md).
    // Note: `contacts` is OMITTED for failed status webhooks (bsuid.md line 653).
    const extractedContact = extractStatusContactData(
      status.contacts as StatusWebhookContact[] | undefined,
    )

    if (extractedContact.bsuid) {
      // username is PII (customer's WhatsApp handle) — masked by serializer.
      logger.debug('Status webhook contains BSUID', {
        messageId: status.id,
        hasBsuid: true,
        hasParentBsuid: !!extractedContact.parentBsuid,
        username: extractedContact.username,
      })
    }

    // Build update data
    const updateData: {
      status: MessageStatus;
      timestamp: Date;
      errorCode?: string;
      errorMessage?: string;
    } = {
      status: status.status.toUpperCase() as MessageStatus,
      timestamp: new Date(parseInt(status.timestamp) * 1000)
    }

    // Error details for failed messages
    let errorCode: string | undefined
    let errorMessage: string | undefined

    // Add error details if message failed
    if (status.status === 'failed' && status.errors && status.errors.length > 0) {
      const firstError = status.errors[0]
      errorCode = String(firstError.code || '')
      // Get human-readable error message
      errorMessage = getReadableErrorMessage(
        firstError.code,
        firstError.title || firstError.message || 'Pesan gagal dikirim'
      )
      updateData.errorCode = errorCode
      updateData.errorMessage = errorMessage
    }

    // Auto-suppress: Meta error 131050 means the recipient has opted out of
    // marketing messages from this business. We flip the customer's
    // marketingOptOut flag so future broadcast queries exclude them, and
    // log the action for audit. Non-fatal — failures here must not block
    // the normal status update.
    if (errorCode === '131050' && message?.customer) {
      try {
        await prisma.$transaction([
          prisma.customer.update({
            where: { id: message.customer.id },
            data: {
              marketingOptOut: true,
              marketingOptOutAt: new Date(),
              marketingOptOutSource: 'META_ERROR_131050',
            },
          }),
          prisma.marketingPreferenceLog.create({
            data: {
              customerId: message.customer.id,
              action: 'STOP',
              source: 'META_ERROR_131050',
              detail: errorMessage || 'User stopped marketing messages (detected via error 131050)',
            },
          }),
        ])
        logger.info('Auto-suppressed customer due to error 131050', {
          customerId: message.customer.id,
          messageId: message.id,
        })
      } catch (suppressError) {
        logger.error('Failed to auto-suppress customer for 131050', {
          error: suppressError instanceof Error ? suppressError.message : String(suppressError),
          customerId: message.customer.id,
        })
      }
    }

    // Use atomic update with conditional WHERE to prevent race conditions
    // This ensures we only update if the status is actually progressing forward
    const statusProgression = ['PENDING', 'SENT', 'DELIVERED', 'READ']
    const newStatusUpper = status.status.toUpperCase()
    const newIndex = statusProgression.indexOf(newStatusUpper)
    
    // For broadcast statistics, we need to track the actual previous status
    // Use a transaction to ensure atomicity
    const previousStatus = message?.status || 'PENDING'
    const previousIndex = statusProgression.indexOf(previousStatus)
    
    // Determine valid previous statuses for this update (prevent duplicate processing)
    // A status update is only valid if coming from a lower status in the progression
    const validPreviousStatuses: MessageStatus[] = []
    if (newIndex > 0) {
      // For forward progressions (sent, delivered, read), only accept if current status is lower
      for (let i = 0; i < newIndex; i++) {
        validPreviousStatuses.push(statusProgression[i] as MessageStatus)
      }
    }
    
    // For failed status, only accept from PENDING
    if (status.status.toLowerCase() === 'failed') {
      validPreviousStatuses.push('PENDING')
    }
    
    // Atomic conditional update - only updates if status is in valid previous states
    // This prevents double counting from duplicate webhooks or race conditions
    const updateResult = await prisma.message.updateMany({
      where: {
        wamId: status.id,
        userId: user.id,
        // Only update if current status allows progression to new status
        ...(validPreviousStatuses.length > 0 && {
          status: { in: validPreviousStatuses }
        })
      },
      data: updateData
    })
    
    // Check if update actually happened (idempotency check)
    const statusActuallyChanged = updateResult.count > 0
    
    if (statusActuallyChanged) {
      logger.debug('Message status updated', { messageId: status.id, status: status.status })
    } else {
      logger.debug('Message status update skipped (already processed or invalid progression)', {
        messageId: status.id,
        status: status.status,
      })
    }

    // Audit log for message status updates
    if (message) {
      const statusLower = status.status.toLowerCase()
      const actionMap: Record<string, string> = {
        delivered: 'MESSAGE_DELIVERED',
        read: 'MESSAGE_READ',
        failed: 'MESSAGE_FAILED',
        sent: 'MESSAGE_SENT',
      }
      const auditAction = actionMap[statusLower] || 'WEBHOOK_STATUS_UPDATE'
      await auditLog(
        auditAction,
        'Message',
        message.id,
        {
          wamId: status.id,
          status: status.status,
          customerId: message.customerId,
          statusActuallyChanged, // Track if this was a real change
          ...(errorCode && { errorCode }),
          ...(errorMessage && { errorMessage })
        },
        user.id
      )
    }

    // Update customer BSUID if received in status webhook and not yet stored
    if (message?.customer && extractedContact.bsuid) {
      const customerBsuid = extractedContact.bsuid
      const customerParentBsuid = extractedContact.parentBsuid
      const customerUsername = extractedContact.username

      try {
        // Only update if BSUID not yet stored
        const existingCustomer = await prisma.customer.findUnique({
          where: { id: message.customer.id },
          select: { whatsappBsuid: true }
        })

        if (!existingCustomer?.whatsappBsuid && customerBsuid) {
          await prisma.customer.update({
            where: { id: message.customer.id },
            data: {
              whatsappBsuid: customerBsuid,
              whatsappParentBsuid: customerParentBsuid || undefined,
              whatsappUsername: customerUsername || undefined,
              bsuidMappedAt: new Date(),
            }
          })
          logger.debug('Customer BSUID updated from status webhook', { customerId: message.customer.id })
        }
      } catch (err) {
        logger.error('Failed to update customer BSUID from status', {
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }

    // Update broadcast job statistics if this message is part of a bulk send
    // ONLY update counters if the status actually changed (prevents double counting)
    if (message?.bulkSendJobId && statusActuallyChanged) {
      const statusLower = status.status.toLowerCase()

      // Handle failed status - only update when message was previously PENDING
      if (statusLower === 'failed' && previousStatus === 'PENDING') {
        // Message failed - decrement successCount (was counted at API call time) and increment failedCount
        await prisma.bulkTemplateSend.update({
          where: { id: message.bulkSendJobId },
          data: {
            successCount: { decrement: 1 },
            failedCount: { increment: 1 },
          },
        })
        logger.debug('Updated broadcast job counters', { jobId: message.bulkSendJobId, change: 'successCount--, failedCount++' })
      }

      // Increment delivery tracking counters based on status
      // WhatsApp may skip statuses (e.g., PENDING → READ directly), so we need to increment all skipped counters
      // Status progression: PENDING → SENT → DELIVERED → READ

      // Only process if this is a forward progression (not failed, not going backward)
      if (newIndex > previousIndex && newIndex > 0) {
        const incrementData: Record<string, { increment: number }> = {}
        const incrementedCounters: string[] = []

        // Increment all counters from previousIndex+1 to newIndex (inclusive)
        for (let i = previousIndex + 1; i <= newIndex; i++) {
          if (i === 1) {
            incrementData.sentCount = { increment: 1 }
            incrementedCounters.push('sentCount')
          } else if (i === 2) {
            incrementData.deliveredCount = { increment: 1 }
            incrementedCounters.push('deliveredCount')
          } else if (i === 3) {
            incrementData.readCount = { increment: 1 }
            incrementedCounters.push('readCount')
          }
        }

        if (Object.keys(incrementData).length > 0) {
          await prisma.bulkTemplateSend.update({
            where: { id: message.bulkSendJobId },
            data: incrementData,
          })
          logger.debug('Updated broadcast job counters', { jobId: message.bulkSendJobId, counters: incrementedCounters })
        }
      }
    }

    // Emit real-time event to user's OneInbox via WebSocket
    if (message) {
      eventEmitter.emitMessageStatus(user.id, {
        messageId: message.id,
        conversationId: message.customerId, // conversationId is the customerId for WA
        status: status.status.toLowerCase() as 'sent' | 'delivered' | 'read' | 'failed',
        ...(errorCode && { errorCode }),
        ...(errorMessage && { errorMessage })
      })
      logger.debug('Emitted message_status', { userId: user.id })
    }

    // Emit webhook event for status updates (Requirement 3.1, 8.1, 8.2, 8.4)
    if (message && message.customer) {
      const statusLower = status.status.toLowerCase()
      let eventType: WebhookEventType | null = null

      if (statusLower === 'delivered') {
        eventType = 'message.delivered'
      } else if (statusLower === 'read') {
        eventType = 'message.read'
      } else if (statusLower === 'failed') {
        eventType = 'message.failed'
      }

      if (eventType) {
        // Include raw status object for status events
        // Contains: id, status, timestamp, recipient_id, errors (if failed)
        webhookService.emitEvent(
          user.id,
          eventType,
          'whatsapp',
          message.whatsappPhoneNumber?.id || '',
          {
            message_id: message.id,
            customer_id: message.customer.id,
            customer_phone: message.customer.phoneNumber,
            direction: message.direction.toLowerCase() as 'inbound' | 'outbound',
            message_type: message.messageType.toLowerCase(),
            content: message.content || undefined,
            media_url: message.mediaUrl || undefined,
            phone_number_id: message.whatsappPhoneNumber?.id,
            business_phone: message.whatsappPhoneNumber?.displayPhoneNumber,
          },
          status // Pass raw WhatsApp status object
        ).catch(err => logger.error('Failed to emit webhook event', { eventType, error: err instanceof Error ? err.message : String(err) }))
      }
    }
  } catch (error) {
    logger.error('Error handling message status', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
