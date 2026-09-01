/**
 * Coexistence Account Update Webhook Handler
 * Handles account disconnection events (PARTNER_REMOVED)
 */

import { prisma } from '../../utils/database.js'
import { emailService } from '../../services/email/index.js'

interface AccountUpdatePayload {
  phone_number: string
  event: 'PARTNER_REMOVED' | 'PARTNER_ADDED' | string
}

/**
 * Handle account update webhook (account_update)
 * Processes account disconnection events for coexistence users
 */
export async function handleAccountUpdate(
  payload: AccountUpdatePayload,
  wabaId: string
): Promise<void> {
  try {
    console.log(`🔔 Account update event: ${payload.event} for WABA ${wabaId}`)

    if (payload.event === 'PARTNER_REMOVED') {
      // Business disconnected from Cloud API via WhatsApp Business App
      const account = await prisma.whatsAppAccount.findFirst({
        where: {
          wabaId,
          isCoexistence: true
        },
        include: { user: true }
      })

      const user = account?.user

      if (!account || !user) {
        console.warn(`⚠️ WhatsApp account not found for WABA ${wabaId}`)
        return
      }

      console.log(`🔌 User ${user.id} disconnected from Cloud API`)

      // Update account status
      await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: {
          connectionStatus: 'disconnected',
          isCoexistence: false,
          coexistenceSyncStatus: null,
          coexistenceSyncProgress: null
        }
      })

      // Log disconnection
      await prisma.wABAConnectionLog.create({
        data: {
          userId: user.id,
          action: 'coexistence_disconnected',
          details: {
            wabaId,
            phoneNumber: payload.phone_number,
            event: payload.event,
            timestamp: new Date().toISOString(),
            reason: 'Business disconnected via WhatsApp Business App'
          }
        }
      })

      // Send email notification
      try {
        await emailService.sendWABADisconnected(
          wabaId,
          user.name,
          'Your WhatsApp Business Account was disconnected via the WhatsApp Business App',
          user.email
        )
      } catch (emailError) {
        console.error('Failed to send disconnection email:', emailError)
      }

      console.log(`✅ Processed PARTNER_REMOVED event for user ${user.id}`)
    } else if (payload.event === 'PARTNER_ADDED') {
      console.log(`✅ PARTNER_ADDED event received for WABA ${wabaId}`)
      // This happens during initial connection - already handled by signup callback
    } else {
      console.log(`ℹ️ Unhandled account update event: ${payload.event}`)
    }
  } catch (error) {
    console.error('❌ Account update webhook error:', error)
    throw error
  }
}
