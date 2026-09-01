console.log('📦 Loading webhookWorker module...')

import { Worker, Job } from 'bullmq'
import { Redis } from 'ioredis'
import { Prisma } from '@prisma/client'
import { prisma } from '../utils/database.js'
import { openMessageWindow } from '../utils/messageWindow.js'
import { AIOrchestrator } from '../services/ai/AIOrchestrator.js'
import WhatsAppAPI from '../utils/whatsapp.js'
import { TokenEncryptionService } from '../utils/tokenEncryption.js'
import { QUEUE_NAMES, memoryQueue } from '../utils/queue.js'
import { LeadScoringService } from '../services/lead-scoring.js'
import { ActivityService } from '../services/activity-service.js'
import { webhookService } from '../services/webhook-service.js'
import { eventEmitter } from '../websocket/index.js'
import { mediaDownloadService } from '../services/media-download-service.js'
import { AuditLogService } from '../services/audit-log-service.js'
import { AutoTaggingService } from '../services/auto-tagging-service.js'
import { CtwaService } from '../services/ctwa-service.js'
import { createMemoryVectorStore } from '../services/ai/memory/index.js'
import { OpenAIProvider } from '../services/ai/providers/OpenAIProvider.js'
import { getSendTarget } from '../utils/customer-lookup.js'
import { decideMerge, executeMerge } from '../utils/customer-merge.js'
import { isValidBsuid } from '../types/whatsapp-bsuid.js'
import { acquireCustomerLocks } from '../utils/advisory-lock.js'
import { runAfterWhatsAppTypingDelay } from './webhook-typing.js'
import { logger, extractAxiosError } from '../utils/logger.js'

console.log('📦 webhookWorker imports loaded')

/**
 * Convert standard Markdown formatting to WhatsApp markdown
 * This ensures AI responses work correctly in WhatsApp regardless of LLM output format
 *
 * Conversions:
 * - **text** or __text__ → *text* (bold)
 * - *text* → _text_ (italic, if not already bold)
 * - ## Heading → Heading (strip headings)
 */
function convertToWhatsAppMarkdown(text: string): string {
    let converted = text;

    // Use placeholder to avoid conflicts between bold and italic conversion
    const BOLD_PLACEHOLDER = '⚡BOLD_';
    const BOLD_END = '_BOLD⚡';

    // 1. Replace Markdown bold with temporary placeholder
    converted = converted.replace(/\*\*(.+?)\*\*/g, `${BOLD_PLACEHOLDER}$1${BOLD_END}`);  // **text**
    converted = converted.replace(/__(.+?)__/g, `${BOLD_PLACEHOLDER}$1${BOLD_END}`);      // __text__

    // 2. Now convert single asterisk italic (safe, won't conflict with placeholders)
    converted = converted.replace(/\*(.+?)\*/g, '_$1_');

    // 3. Replace placeholders with WhatsApp bold format
    converted = converted.replace(new RegExp(`${BOLD_PLACEHOLDER.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(.+?)${BOLD_END.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g'), '*$1*');

    // 4. Strip Markdown headings (##, ###, etc.) - WhatsApp doesn't support them
    converted = converted.replace(/^#{1,6}\s+(.+)$/gm, '$1');

    // 5. Convert Markdown horizontal rules to simple line
    converted = converted.replace(/^---+$/gm, '---');

    return converted;
}

// Redis connection for worker (same config as queue.ts)
const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    family: 4,
})

// AI Orchestrator instance
const aiOrchestrator = new AIOrchestrator()

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

// Webhook job data interface
interface WebhookJobData {
    message: any
    metadata: any
    contacts?: WhatsAppContact[] // Optional contacts array from webhook payload
    user: any
    phoneNumberRecord?: {
        id: string
        phoneNumberId: string
        displayPhoneNumber: string
    } | null
    whatsappAccount?: {
        id: string
        wabaId: string
        accessToken: string
        accessTokenIV: string
        accessTokenTag: string
    } | null
}

/**
 * WhatsApp contact object from webhook payload
 * Extended to support BSUID (starting 31 Mar 2026)
 */
interface WhatsAppContact {
    profile?: {
        name?: string
        /** Username if user enabled the feature */
        username?: string
    }
    /** Phone number - may be omitted if user enabled username */
    wa_id?: string
    /** Business-Scoped User ID - always present after 31 Mar 2026 */
    user_id?: string
    /** Parent BSUID for linked business portfolios */
    parent_user_id?: string
}

/**
 * Extracted contact data including profile name and BSUID
 */
interface ExtractedContactData {
    name: string | null
    bsuid: string | null
    parentBsuid: string | null
    username: string | null
}

/**
 * Extract profile data from contacts array by matching wa_id or user_id with sender
 * @param contacts - Array of contacts from webhook payload
 * @param senderWaId - The wa_id of the message sender (optional)
 * @param senderBsuid - The user_id of the message sender (optional)
 * @returns Extracted contact data including name and BSUID
 */
export function extractContactData(
    contacts: WhatsAppContact[] | undefined,
    senderWaId?: string,
    senderBsuid?: string
): ExtractedContactData {
    const result: ExtractedContactData = {
        name: null,
        bsuid: null,
        parentBsuid: null,
        username: null,
    }

    if (!contacts || contacts.length === 0) return result

    // Find contact matching sender's wa_id or user_id
    const contact = contacts.find(c => 
        (senderWaId && c.wa_id === senderWaId) ||
        (senderBsuid && c.user_id === senderBsuid)
    )

    if (!contact) return result

    // Extract profile name (truncate if exceeds 255 characters)
    if (contact.profile?.name) {
        const name = contact.profile.name
        result.name = name.length > 255 ? name.substring(0, 255) : name
    }

    // Extract BSUID data
    result.bsuid = contact.user_id || null
    result.parentBsuid = contact.parent_user_id || null
    result.username = contact.profile?.username || null

    return result
}

// Keep backward compatible wrapper
export function extractProfileName(contacts: WhatsAppContact[] | undefined, senderWaId: string): string | null {
    return extractContactData(contacts, senderWaId).name
}

/**
 * Get a preview string for non-text messages
 */
function getMessagePreview(messageType: string): string {
    const previews: Record<string, string> = {
        image: '📷 Image',
        video: '🎥 Video',
        audio: '🎵 Audio',
        document: '📄 Document',
        location: '📍 Location',
        contacts: '👤 Contact',
        sticker: '🎨 Sticker',
        reaction: '👍 Reaction',
    }
    return previews[messageType.toLowerCase()] || 'Message'
}

/**
 * Parsed identity-change from a WhatsApp `type: "system"` message.
 */
export interface ParsedSystemIdentityChange {
    changeType: string
    previousBsuid: string
    newBsuid: string
    newParentBsuid: string | null
    /** New phone number, if Meta still shares it (null for username adopters). */
    newPhone: string | null
}

/**
 * Extract an identity-change from a WhatsApp `type: "system"` message.
 *
 * Meta reports a user changing their phone number (`user_changed_number`) or a
 * BSUID rotation with no phone to share (`user_changed_user_id`) on the
 * `messages` field as a system message (docs/bsuid.md "System messages
 * webhooks"). We rotate the customer's stored BSUID in place from this — we do
 * NOT persist a chat bubble or create a customer.
 *
 * Returns null (caller ignores) when this is not a rotatable system message —
 * i.e. not `type: "system"`, no `system` object, or missing either the
 * previous or new BSUID (we cannot safely rotate without both).
 */
export function parseSystemMessage(message: any): ParsedSystemIdentityChange | null {
    if (!message || message.type !== 'system' || !message.system) return null
    const sys = message.system
    const previousBsuid = sys.previous_user_id
    const newBsuid = sys.user_id
    if (!previousBsuid || !newBsuid) return null
    return {
        changeType: sys.type || 'user_changed_number',
        previousBsuid,
        newBsuid,
        newParentBsuid: sys.parent_user_id || null,
        newPhone: sys.wa_id || null,
    }
}

// Process webhook job
async function processWebhook(job: Job<WebhookJobData>): Promise<void> {
    const { message, metadata, contacts, user, phoneNumberRecord, whatsappAccount } = job.data

    try {
        if (!user) {
            logger.error('User not found for incoming message')
            return
        }

        logger.debug('Inbound message received, processing')

        // Identity-change system message (docs/bsuid.md "System messages
        // webhooks"): Meta reports a customer changing their phone number, or a
        // BSUID rotation, as a `type: "system"` message. We rotate the stored
        // BSUID (and phone, if shared) on the EXISTING customer in place and
        // return early — we do NOT create a customer or persist a chat bubble
        // (that would leave an empty UNSUPPORTED row). If no customer matches
        // the old BSUID, we log and drop: creating one from an identity-change
        // event would be a phantom contact.
        const identityChange = parseSystemMessage(message)
        if (identityChange) {
            try {
                const existing = await prisma.customer.findFirst({
                    where: {
                        userId: user.id,
                        whatsappBsuid: identityChange.previousBsuid,
                        whatsappPhoneNumberId: phoneNumberRecord?.id || null,
                    },
                    select: { id: true, phoneNumber: true },
                })

                if (existing) {
                    const updateData: Record<string, any> = {
                        whatsappBsuid: identityChange.newBsuid,
                        bsuidMappedAt: new Date(),
                    }
                    if (identityChange.newParentBsuid) {
                        updateData.whatsappParentBsuid = identityChange.newParentBsuid
                    }
                    // Only advance the phone when Meta actually shared a new one
                    // AND the stored value looks like a phone (not a BSUID we
                    // previously stored in the phoneNumber column for a
                    // username-only customer). Never overwrite a real number
                    // blindly here.
                    if (identityChange.newPhone) {
                        updateData.phoneNumber = identityChange.newPhone
                    }
                    await prisma.customer.update({
                        where: { id: existing.id },
                        data: updateData,
                    })
                    logger.info('Customer BSUID rotated via system message', {
                        customerId: existing.id,
                        changeType: identityChange.changeType,
                    })
                } else {
                    logger.warn('System identity-change: no customer matched old BSUID, dropping', {
                        userId: user.id,
                        changeType: identityChange.changeType,
                    })
                }
            } catch (err) {
                logger.error('Failed to process system identity-change message', {
                    error: err instanceof Error ? err.message : String(err),
                })
            }
            return
        }

        // Extract profile data including BSUID from contacts array
        // BSUID support starting 31 Mar 2026
        const contactData = extractContactData(
            contacts,
            message.from,           // wa_id (phone number)
            message.from_user_id    // BSUID (new field)
        )
        const customerName = contactData.name

        // Get BSUID from message or contact
        const customerBsuid = message.from_user_id || contactData.bsuid
        const customerParentBsuid = message.from_parent_user_id || contactData.parentBsuid
        const customerUsername = contactData.username

        // Find or create customer per phone number (multi-number support)
        // Each business phone number has its own customer records
        let customer
        let retryCount = 0
        const maxRetries = 3

        while (retryCount < maxRetries) {
            try {
                customer = await prisma.$transaction(async (tx) => {
                    // Serialize concurrent resolve/merge for the SAME person.
                    // Chat is high-traffic: two webhooks for one customer (phone
                    // + BSUID, or two rapid messages) can race this transaction
                    // and produce a duplicate row or a merge that collides with a
                    // concurrent create. Transaction-scoped advisory locks on the
                    // customer's identities make those transactions queue instead
                    // of racing; they auto-release at COMMIT/ROLLBACK. Fine-grained
                    // (per identity) so unrelated customers never wait. Acquired
                    // FIRST, before any read. See utils/advisory-lock.ts.
                    await acquireCustomerLocks(tx as any, user.id, [message.from, customerBsuid])

                    // Look up by phone and by BSUID SEPARATELY (not a single OR)
                    // so we can detect the split-identity case: one real person
                    // living as two rows — an old phone-only row and a newer
                    // BSUID-only row. A single webhook carrying BOTH the phone
                    // and the BSUID is Meta's proof they are the same person, so
                    // we MERGE them (evidence-based, never a guess). See
                    // utils/customer-merge.ts.
                    const scope = {
                        userId: user.id,
                        whatsappPhoneNumberId: phoneNumberRecord?.id || null,
                    }
                    const byPhone = message.from
                        ? await tx.customer.findFirst({ where: { ...scope, phoneNumber: message.from } })
                        : null
                    const byBsuid = customerBsuid
                        ? await tx.customer.findFirst({ where: { ...scope, whatsappBsuid: customerBsuid } })
                        : null

                    let customer = byPhone ?? byBsuid

                    const decision = decideMerge(byPhone as any, byBsuid as any, {
                        realPhone: message.from,
                        isBsuid: isValidBsuid,
                    })
                    if (decision.action === 'merge') {
                        // Evidence-based merge inside this same transaction. After
                        // it, `customer` is the survivor (winner) with the loser's
                        // children + identity folded in.
                        await executeMerge(tx as any, decision)
                        customer = await tx.customer.findUnique({ where: { id: decision.winnerId } })
                        logger.info('Merged split-identity customers on evidence (phone + BSUID)', {
                            userId: user.id,
                            winnerId: decision.winnerId,
                            loserId: decision.loserId,
                        })
                    }

                    if (customer) {
                        // Update name and BSUID if changed
                        const updateData: Record<string, any> = {}
                        
                        if (customerName && customer.name !== customerName) {
                            updateData.name = customerName
                        }
                        
                        // Store BSUID if newly received (don't overwrite existing)
                        if (customerBsuid && !customer.whatsappBsuid) {
                            updateData.whatsappBsuid = customerBsuid
                            updateData.bsuidMappedAt = new Date()
                            logger.debug('BSUID mapped', { customerId: customer.id })
                        }
                        
                        // Update parent BSUID (can change if business links portfolios)
                        if (customerParentBsuid && customer.whatsappParentBsuid !== customerParentBsuid) {
                            updateData.whatsappParentBsuid = customerParentBsuid
                        }
                        
                        // Update username if changed
                        if (customerUsername && customer.whatsappUsername !== customerUsername) {
                            updateData.whatsappUsername = customerUsername
                        }
                        
                        if (Object.keys(updateData).length > 0) {
                            customer = await tx.customer.update({
                                where: { id: customer.id },
                                data: updateData,
                            })
                            logger.debug('Customer updated', { customerId: customer.id, fields: Object.keys(updateData) })
                        }
                    } else {
                        // Use phone number if available, otherwise BSUID (username-only users)
                        const phoneNumber = message.from || customerBsuid
                        if (!phoneNumber) {
                            throw new Error('No phone number or BSUID available to identify customer')
                        }
                        
                        customer = await tx.customer.create({
                            data: {
                                userId: user.id,
                                phoneNumber: phoneNumber,
                                name: customerName,
                                consentStatus: true,
                                consentCapturedAt: new Date(),
                                consentSource: 'AUTO_INBOUND',
                                consentPurpose: 'Service messages after customer initiated contact',
                                whatsappPhoneNumberId: phoneNumberRecord?.id || null,
                                // BSUID fields
                                whatsappBsuid: customerBsuid || null,
                                whatsappParentBsuid: customerParentBsuid || null,
                                whatsappUsername: customerUsername || null,
                                bsuidMappedAt: customerBsuid ? new Date() : null,
                            },
                        })

                        // Create consent log for new customer
                        await tx.consentLog.create({
                            data: {
                                customerId: customer.id,
                                action: 'OPT_IN',
                                source: 'AUTO_INBOUND',
                                purpose: 'Service messages after customer initiated contact',
                                userId: user.id,
                            },
                        })
                        logger.info('New customer created with auto-consent', { customerId: customer.id, userId: user.id })
                        // Audit log: New customer created
                        AuditLogService.logCustomerCreated(user.id, customer.id, {
                            phoneNumber: message.from || customerBsuid || 'unknown',
                            name: customerName || undefined,
                            source: 'INBOUND_MESSAGE',
                            ...(customerBsuid && { bsuid: customerBsuid }),
                        }).catch(e => logger.error('Failed to log customer created', { error: e instanceof Error ? e.message : String(e) }))
                    }

                    return customer
                })
                break // Success, exit retry loop
            } catch (error: any) {
                // Retry transient concurrency errors:
                //   P2002 = unique constraint violation (two workers created the
                //           same customer at once)
                //   P2025 = record required by an operation no longer exists —
                //           happens when a CONCURRENT evidence-based merge deleted
                //           the loser row between our read and our delete. On retry
                //           the merged-away row is simply not found, so the merge
                //           branch is skipped and the survivor is used.
                if ((error.code === 'P2002' || error.code === 'P2025') && retryCount < maxRetries - 1) {
                    retryCount++
                    logger.warn('Transient DB conflict, retrying customer resolve/merge', {
                        retryCount,
                        maxRetries,
                        code: error.code,
                    })
                    await new Promise(resolve => setTimeout(resolve, 50 * retryCount))
                    continue
                }
                throw error
            }
        }

        if (!customer) {
            throw new Error('Failed to create/update customer after retries')
        }

        // Open 24-hour messaging window
        await openMessageWindow(customer.id)
        logger.debug('Message window opened', { customerId: customer.id })

        // Extract message content based on type
        let content = null
        let mediaUrl = null
        let mediaId = null // Original WhatsApp media ID

        switch (message.type) {
            case 'text':
                content = message.text?.body
                break
            case 'image':
                content = message.image?.caption
                mediaId = message.image?.id
                break
            case 'document':
                content = message.document?.caption
                mediaId = message.document?.id
                break
            case 'audio':
                mediaId = message.audio?.id
                break
            case 'video':
                content = message.video?.caption
                mediaId = message.video?.id
                break
            case 'sticker':
                // Stickers have media ID that can be downloaded
                mediaId = message.sticker?.id || message.sticker?.png_url
                // Stickers don't have caption/content
                content = null
                break
            case 'location':
                content = `Location: ${message.location?.latitude}, ${message.location?.longitude}`
                break
            case 'contacts':
                content = `Contact: ${message.contacts?.[0]?.name?.formatted_name}`
                break
            case 'reaction':
                // Store emoji as content, empty emoji means reaction removed
                content = message.reaction?.emoji || null
                // Store the message_id being reacted to in mediaUrl field for reference
                mediaUrl = message.reaction?.message_id || null
                break
            case 'interactive':
                // Handle button reply from interactive messages (template buttons)
                if (message.interactive?.type === 'button_reply') {
                    content = message.interactive.button_reply?.title || message.interactive.button_reply?.id
                } else if (message.interactive?.type === 'list_reply') {
                    content = message.interactive.list_reply?.title || message.interactive.list_reply?.id
                } else {
                    content = message.interactive?.body?.text || 'Interactive message'
                }
                break
            case 'button':
                // Handle quick reply button responses
                content = message.button?.text || message.button?.payload
                break
            case 'edit':
                // Handle edited messages - store info about the edit
                content = message.text?.body || null
                // Store the original message_id being edited in mediaUrl field
                mediaUrl = message.context?.message_id || null
                break
        }

        // Map message type to valid MessageType enum, fallback to UNSUPPORTED
        const validMessageTypes = [
            'TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'TEMPLATE',
            'BUTTONS', 'LIST', 'STICKER', 'CONTACTS', 'LOCATION',
            'INTERACTIVE', 'REACTION', 'BUTTON', 'EDIT'
        ]
        const messageTypeUpper = message.type.toUpperCase()
        const dbMessageType = validMessageTypes.includes(messageTypeUpper)
            ? messageTypeUpper
            : 'UNSUPPORTED'

        // Download and store media for supported types (Requirements: 6.1, 6.3, 6.4)
        if (mediaId && ['image', 'video', 'audio', 'document', 'sticker'].includes(message.type)) {
            try {
                // Decrypt per-account token for media download (multi-WABA support)
                let mediaAccessToken: string | undefined
                if (whatsappAccount?.accessToken) {
                    try {
                        const tokenEnc = new TokenEncryptionService()
                        mediaAccessToken = tokenEnc.decrypt({
                            ciphertext: whatsappAccount.accessToken,
                            iv: whatsappAccount.accessTokenIV,
                            authTag: whatsappAccount.accessTokenTag,
                            algorithm: 'aes-256-gcm',
                        })
                    } catch (e) {
                        console.error('⚠️ Failed to decrypt account token for media download, using global:', e)
                    }
                }

                console.log(`📥 Downloading media for message ${message.id}, mediaId: ${mediaId}`)
                const downloadResult = await mediaDownloadService.downloadAndStore(mediaId, mediaAccessToken)
                
                if (downloadResult.success && downloadResult.localUrl) {
                    mediaUrl = downloadResult.localUrl
                    console.log(`✅ Media downloaded and stored: ${mediaUrl}`)
                    // Audit log: Media download success
                    AuditLogService.logMediaDownload(user.id, mediaId, true, {
                        messageType: message.type,
                        localUrl: mediaUrl,
                    }).catch(e => console.error('Failed to log media download:', e))
                } else {
                    // Store original media ID for proxy fallback (Requirement 6.4)
                    mediaUrl = mediaId
                    console.log(`⚠️ Media download failed, storing original ID for proxy fallback: ${mediaId}`, downloadResult.error)
                    // Audit log: Media download failed
                    AuditLogService.logMediaDownload(user.id, mediaId, false, {
                        messageType: message.type,
                        error: downloadResult.error,
                    }).catch(e => console.error('Failed to log media download error:', e))
                }
            } catch (error) {
                // Store original media ID for proxy fallback (Requirement 6.4)
                mediaUrl = mediaId
                logger.error('Error downloading media', {
                    mediaId,
                    error: extractAxiosError(error),
                })
                // Audit log: Media download error
                AuditLogService.logMediaDownload(user.id, mediaId, false, {
                    messageType: message.type,
                    error: error instanceof Error ? error.message : 'Unknown error',
                }).catch(e => console.error('Failed to log media download error:', e))
            }
        }

        // CTWA: detect Click-to-WhatsApp Ads referral from Meta webhook
        const parsedReferral = CtwaService.parseReferral(message.referral)
        const ctwaReferral = parsedReferral &&
            CtwaService.isCtwaReferral(parsedReferral) &&
            CtwaService.hasReferralData(parsedReferral)
            ? CtwaService.sanitizeReferral(parsedReferral)
            : null

        // Save message to database
        const savedMessage = await prisma.message.create({
            data: {
                userId: user.id,
                customerId: customer.id,
                messageType: dbMessageType,
                direction: 'INBOUND',
                content,
                mediaUrl,
                wamId: message.id,
                status: 'DELIVERED', // Incoming messages are considered delivered
                timestamp: new Date(parseInt(message.timestamp) * 1000),
                whatsappPhoneNumberId: phoneNumberRecord?.id || null,
                ...(ctwaReferral && { referral: ctwaReferral as Prisma.InputJsonValue }),
            },
        })

        // Auto-tag customer as "Meta Ads" when message comes from CTWA
        // Await to avoid losing attribution on first-message-only referral (Meta edge case)
        if (ctwaReferral) {
            try {
                await CtwaService.processCtwaInbound(user.id, customer.id, savedMessage.id, ctwaReferral)
            } catch (err) {
                logger.error('Failed to process CTWA attribution', {
                    customerId: customer.id,
                    error: err instanceof Error ? err.message : String(err),
                })
            }
        }

        logger.debug('Incoming message saved', { messageId: message.id, savedId: savedMessage.id })

        // Audit log: Message received
        AuditLogService.logMessageReceived(user.id, savedMessage.id, {
            customerId: customer.id,
            customerPhone: customer.phoneNumber,
            messageType: dbMessageType,
            wamId: message.id,
            channel: 'whatsapp',
        }).catch(err => logger.error('Failed to log message received', { error: err instanceof Error ? err.message : String(err) }))

        // Emit webhook event for message.received (Requirement 3.1, 8.1, 8.2, 8.4)
        // Include raw WhatsApp message for advanced integrations
        webhookService.emitEvent(
            user.id,
            'message.received',
            'whatsapp',
            phoneNumberRecord?.id || '',
            {
                message_id: savedMessage.id,
                customer_id: customer.id,
                customer_phone: customer.phoneNumber,
                direction: 'inbound',
                message_type: message.type,
                content: content || undefined,
                media_url: mediaUrl || undefined,
                phone_number_id: phoneNumberRecord?.id,
                business_phone: phoneNumberRecord?.displayPhoneNumber,
            },
            message // Pass raw WhatsApp message
        ).catch(err => logger.error('Failed to emit message.received webhook', { error: err instanceof Error ? err.message : String(err) }))

        // Emit WebSocket event for real-time UI update to ALL team members (business owner + agents)
        // Requirements: 2.1, 5.3, 6.2 - Broadcast to business room for team-wide visibility
        logger.debug('Emitting new_message event to business room', { userId: user.id })
        const emitResult = eventEmitter.emitNewMessageToBusinessRoom(user.id, {
            conversationId: customer.id, // Using customerId as conversationId for WhatsApp
            channel: 'whatsapp',
            participantId: customer.phoneNumber,
            participantName: customer.name,
            message: {
                id: savedMessage.id,
                preview: (content || getMessagePreview(message.type)).substring(0, 100),
                timestamp: savedMessage.timestamp.toISOString(),
                direction: 'inbound',
            },
        })
        logger.debug('Emit result', { emitResult })

        // Calculate and emit unread count update (Requirements: 1.2, 4.1)
        try {
            const unreadCount = await prisma.message.count({
                where: {
                    userId: user.id,
                    customerId: customer.id,
                    direction: 'INBOUND',
                    status: { not: 'READ' }
                }
            })
            
            logger.debug('Emitting conversation_updated', { unreadCount, conversationId: customer.id })
            eventEmitter.emitConversationUpdated(user.id, {
                conversationId: customer.id,
                changes: {
                    unreadCount,
                    lastMessageAt: savedMessage.timestamp.toISOString()
                }
            })

            // Also emit conversation_updated to assigned agent
            // Requirements: 5.3, 6.2 - Agents should receive real-time unread count updates
            const assignment = await prisma.conversationAssignment.findFirst({
                where: {
                    businessOwnerId: user.id,
                    conversationType: 'WHATSAPP',
                    conversationId: customer.id,
                    assigneeType: 'HUMAN',
                    unassignedAt: null,
                },
                select: {
                    assigneeId: true,
                }
            })

            if (assignment?.assigneeId && assignment.assigneeId !== user.id) {
                logger.debug('Emitting conversation_updated to assigned agent', { assigneeId: assignment.assigneeId })
                eventEmitter.emitConversationUpdated(assignment.assigneeId, {
                    conversationId: customer.id,
                    changes: {
                        unreadCount,
                        lastMessageAt: savedMessage.timestamp.toISOString()
                    }
                })
            }
        } catch (err) {
            logger.error('Failed to emit unread count update', { error: err instanceof Error ? err.message : String(err) })
        }

        // Trigger lead scoring update asynchronously
        LeadScoringService.updateCustomerScore(customer.id).catch(err =>
            logger.error('Failed to update lead score', { customerId: customer.id, error: err instanceof Error ? err.message : String(err) })
        )

        // Process auto-tagging rules for inbound messages
        if (content) {
            AutoTaggingService.processInboundMessage(user.id, customer.id, content)
                .then(result => {
                    if (result.matched) {
                        logger.debug('Auto-tagging applied', {
                            customerId: customer.id,
                            rulesMatched: result.rulesMatched,
                            tagsAdded: result.tagsAdded,
                            stageChanged: result.stageChanged,
                            newStageName: result.newStageName,
                        })
                    }
                })
                .catch(err => logger.error('Failed to process auto-tagging', { customerId: customer.id, error: err instanceof Error ? err.message : String(err) }))
        }

        // Log incoming message activity
        ActivityService.logMessageActivity(
            customer.id,
            user.id,
            'received',
            message.id,
            content?.substring(0, 100)
        ).catch(err => logger.error('Failed to log message activity', { error: err instanceof Error ? err.message : String(err) }))

        // NOTE: Mark as read is NOT automatic anymore
        // It will be triggered when user opens the chat in inbox (frontend calls API)
        // This provides better UX - customer sees "unread" until agent actually views it

        // --- AI Auto-Reply Logic with Assignment Check ---
        // Requirements: 6.1, 6.2, 6.3 - Check assignment status before AI response
        if (message.type === 'text' && content) {
            // Check subscription tier
            if (user.subscriptionTier === 'FREE') {
                console.log('⚠️ AI Auto-Reply skipped: User is on FREE tier', user.id)
                return
            }

            // Check if WhatsApp account is connected before auto-replying
            if (!whatsappAccount?.accessToken) {
                console.log('⚠️  AI Auto-Reply skipped: No WhatsApp account credentials for user', user.id)
                return // Skip auto-reply if no account
            }

            try {
                // Decrypt WhatsApp account access token and create WhatsApp client
                const tokenEncryption = new TokenEncryptionService()
                const decryptedToken = tokenEncryption.decrypt({
                    ciphertext: whatsappAccount.accessToken,
                    iv: whatsappAccount.accessTokenIV,
                    authTag: whatsappAccount.accessTokenTag,
                    algorithm: 'aes-256-gcm',
                })
                const whatsapp = new WhatsAppAPI({ accessToken: decryptedToken })
                
                // Process AI response with assignment check (Requirements: 6.1, 6.2, 6.3)
                // - If assigned to human → skip AI response
                // - If assigned to AI Agent → use that AI Agent's configuration
                // - If unassigned with AI enabled → use default AI Agent
                const response = await runAfterWhatsAppTypingDelay(
                    whatsapp,
                    phoneNumberRecord?.phoneNumberId,
                    message.id,
                    () => aiOrchestrator.handleMessageWithAssignmentCheck(
                        user.id,
                        content,
                        customer.id, // conversationId for WhatsApp is the Customer ID
                        'WHATSAPP',  // conversationType
                        customer.id, // customerId for conversation history
                        whatsappAccount?.id // per-account AI config resolution
                    )
                )

                // Only send typing indicator + mark as read if AI will actually reply
                if (response) {
                    // Convert Markdown to WhatsApp format (post-processing for reliability)
                    const whatsappFormattedResponse = convertToWhatsAppMarkdown(response)
                    console.log('📝 Converted Markdown → WhatsApp format')

                    // Send typing indicator to show we're about to reply
                    console.log('🤖 AI Auto-Reply generated for:', message.id)

                    // WhatsApp API limit: 4096 characters per message
                    const MAX_MESSAGE_LENGTH = 4096

                    // Split response if it exceeds WhatsApp limit
                    const messageParts: string[] = []
                    if (whatsappFormattedResponse.length <= MAX_MESSAGE_LENGTH) {
                        messageParts.push(whatsappFormattedResponse)
                    } else {
                        console.log(`⚠️ Response too long (${whatsappFormattedResponse.length} chars), splitting into multiple messages`)

                        // Split by paragraphs first to maintain readability
                        const paragraphs = whatsappFormattedResponse.split('\n\n')
                        let currentPart = ''

                        for (const paragraph of paragraphs) {
                            // If adding this paragraph would exceed limit, save current part and start new one
                            if (currentPart.length + paragraph.length + 2 > MAX_MESSAGE_LENGTH) {
                                if (currentPart) {
                                    messageParts.push(currentPart.trim())
                                    currentPart = ''
                                }

                                // If single paragraph is too long, split by sentences
                                if (paragraph.length > MAX_MESSAGE_LENGTH) {
                                    const sentences = paragraph.match(/[^.!?]+[.!?]+/g) || [paragraph]
                                    for (const sentence of sentences) {
                                        if (currentPart.length + sentence.length > MAX_MESSAGE_LENGTH) {
                                            if (currentPart) messageParts.push(currentPart.trim())
                                            currentPart = sentence
                                        } else {
                                            currentPart += sentence
                                        }
                                    }
                                } else {
                                    currentPart = paragraph
                                }
                            } else {
                                currentPart += (currentPart ? '\n\n' : '') + paragraph
                            }
                        }

                        if (currentPart) {
                            messageParts.push(currentPart.trim())
                        }

                        console.log(`📨 Split into ${messageParts.length} messages`)
                    }

                    // Send all message parts
                    let lastResult: any
                    for (let i = 0; i < messageParts.length; i++) {
                        const part = messageParts[i]

                        // Add part indicator if split into multiple messages
                        const messageBody = messageParts.length > 1
                            ? `*[${i + 1}/${messageParts.length}]*\n\n${part}`
                            : part

                        // Use getSendTarget for BSUID support (username-only users)
                        const sendTarget = getSendTarget(customer)
                        const result = await whatsapp.sendMessage({
                            phoneNumberId: phoneNumberRecord?.phoneNumberId || '',
                            ...sendTarget,
                            type: 'text',
                            text: { body: messageBody },
                        })

                        lastResult = result

                        // Small delay between messages to ensure proper order
                        if (i < messageParts.length - 1) {
                            await new Promise(resolve => setTimeout(resolve, 500))
                        }
                    }

                    const result = lastResult

                    // Save AI reply to database
                    const aiReplyMessage = await prisma.message.create({
                        data: {
                            userId: user.id,
                            customerId: customer.id,
                            messageType: 'TEXT',
                            direction: 'OUTBOUND',
                            content: response,
                            wamId: result.messages?.[0]?.id,
                            status: 'SENT',
                            source: 'AI_BOT',
                            whatsappPhoneNumberId: phoneNumberRecord?.id || null,
                        },
                    })

                    console.log('🤖 AI Auto-Reply terkirim')

                    // Audit log: AI message sent
                    AuditLogService.logMessageSent(user.id, aiReplyMessage.id, {
                        customerId: customer.id,
                        customerPhone: customer.phoneNumber,
                        messageType: 'TEXT',
                        wamId: result.messages?.[0]?.id,
                        source: 'AI_AUTO_REPLY',
                        channel: 'whatsapp',
                    }).catch(err => console.error('Failed to log AI message sent:', err))

                    // Audit log: AI response generated
                    AuditLogService.logAIResponse(user.id, customer.id, true, {
                        responseLength: response.length,
                        inReplyTo: message.id,
                    }).catch(err => console.error('Failed to log AI response:', err))

                    // Queue memory embedding for AI reply (non-blocking)
                    try {
                        const lastInboundMessage = await prisma.message.findFirst({
                            where: {
                                customerId: customer.id,
                                direction: 'INBOUND',
                                messageType: 'TEXT',
                            },
                            orderBy: { timestamp: 'desc' },
                        });

                        if (lastInboundMessage?.content && whatsappAccount?.id) {
                            const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '');
                            const memoryStore = createMemoryVectorStore(openaiProvider);

                            const memory = await memoryStore.createMemory({
                                userId: user.id,
                                customerId: customer.id,
                                whatsappAccountId: whatsappAccount.id,
                                aiAgentId: undefined, // Could pass from decision.aiAgentId
                                memoryType: 'AI_REPLY',
                                customerMessage: lastInboundMessage.content,
                                responseMessage: response,
                                inboundMessageId: lastInboundMessage.id,
                                outboundMessageId: aiReplyMessage.id,
                            });

                            await memoryQueue.add('embed-memory', {
                                type: 'embed-memory',
                                memoryId: memory.id
                            });
                            console.log('🧠 Memory queued for embedding:', memory.id);
                        }
                    } catch (memoryError) {
                        console.error('Failed to queue AI reply memory:', memoryError);
                        // Don't throw - memory failure shouldn't affect main flow
                    }

                    // Emit webhook event for message.sent (Requirement 3.1, 8.1, 8.2, 8.4)
                    webhookService.emitEvent(
                        user.id,
                        'message.sent',
                        'whatsapp',
                        phoneNumberRecord?.id || '',
                        {
                            message_id: aiReplyMessage.id,
                            customer_id: customer.id,
                            customer_phone: customer.phoneNumber,
                            direction: 'outbound',
                            message_type: 'text',
                            content: response,
                            phone_number_id: phoneNumberRecord?.id,
                            business_phone: phoneNumberRecord?.displayPhoneNumber,
                        }
                    ).catch(err => console.error('Failed to emit message.sent webhook:', err))
                }
            } catch (err) {
                logger.error('Error in AI Auto-Reply', { error: extractAxiosError(err) })
                // Audit log: AI response failed
                AuditLogService.logAIResponse(user.id, customer.id, false, {
                    error: err instanceof Error ? err.message : 'Unknown error',
                    inReplyTo: message.id,
                }).catch(e => console.error('Failed to log AI error:', e))
                // Don't throw - we don't want to fail the entire webhook processing
            }
        }
    } catch (error) {
        logger.error('Error handling incoming message', { error: extractAxiosError(error) })
        // Audit log: Message receive failed
        if (user?.id) {
            AuditLogService.logMessageReceiveFailed(
                user.id,
                message?.id || 'unknown',
                error instanceof Error ? error.message : 'Unknown error',
                {
                    messageType: message?.type,
                    from: message?.from,
                }
            ).catch(e => console.error('Failed to log message receive error:', e))
        }
        throw error // Re-throw to trigger retry
    }
}

// Create webhook worker
export const webhookWorker = new Worker<WebhookJobData>(
    QUEUE_NAMES.WEBHOOK,
    processWebhook,
    {
        connection: redisConnection,
        concurrency: 10, // Process up to 10 webhooks concurrently
        limiter: {
            max: 100, // Max 100 jobs
            duration: 1000, // Per second
        },
    }
)

// Worker event handlers
webhookWorker.on('completed', (job) => {
    console.log(`✅ Webhook worker completed job ${job.id}`)
})

webhookWorker.on('failed', (job, err) => {
    console.error(`❌ Webhook worker failed job ${job?.id}:`, err.message)
})

webhookWorker.on('error', (err) => {
    logger.error('Webhook worker error', { error: extractAxiosError(err) })
})

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📦 Closing webhook worker...')
    await webhookWorker.close()
    await redisConnection.quit()
    console.log('✅ Webhook worker closed')
})

console.log('🚀 Webhook worker started')
