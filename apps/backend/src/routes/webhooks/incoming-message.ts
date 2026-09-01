import { webhookQueue } from '../../utils/queue.js'
import type { PhoneNumber, WhatsAppAccount } from '@prisma/client'

export async function handleIncomingMessage(
  message: any,
  metadata: any,
  contacts: any[] | undefined,
  user: any,
  phoneNumberRecord?: PhoneNumber | null,
  whatsappAccount?: WhatsAppAccount | null
): Promise<void> {
  try {
    if (!user) {
      console.error('❌ User not found for incoming message')
      return
    }

    console.log('📨 Enqueueing incoming message:', {
      from: message.from,
      type: message.type,
      userId: user.id,
      phoneNumberId: phoneNumberRecord?.phoneNumberId,
      whatsappAccountId: whatsappAccount?.id,
    })

    // Add job to queue for background processing
    await webhookQueue.add(
      'process-incoming-message',
      {
        message,
        metadata,
        contacts,
        user,
        phoneNumberRecord: phoneNumberRecord ? {
          id: phoneNumberRecord.id,
          phoneNumberId: phoneNumberRecord.phoneNumberId,
          displayPhoneNumber: phoneNumberRecord.displayPhoneNumber,
        } : null,
        whatsappAccount: whatsappAccount ? {
          id: whatsappAccount.id,
          wabaId: whatsappAccount.wabaId,
          accessToken: whatsappAccount.accessToken,
          accessTokenIV: whatsappAccount.accessTokenIV,
          accessTokenTag: whatsappAccount.accessTokenTag,
        } : null,
      },
      {
        // Priority based on message type (text messages get higher priority for AI)
        priority: message.type === 'text' ? 1 : 5,
        // Remove duplicate messages (same wamId)
        jobId: message.id,
      }
    )

    console.log('✅ Message enqueued for processing:', message.id)

    // Return immediately - webhook processing happens in background
    // This ensures Meta gets a fast 200 OK response
  } catch (error) {
    console.error('❌ Error enqueueing incoming message:', error)
    throw error
  }
}
