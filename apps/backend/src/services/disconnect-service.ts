/**
 * Disconnect Service
 * Handles soft and hard disconnect logic for WhatsApp and Instagram channels
 *
 * Soft disconnect: Preserves customer data, only removes messages and credentials
 * Hard disconnect: Removes all data including customers
 * Auto disconnect: Marks connection as disconnected without deleting data (for stale connections)
 */

import { prisma } from '../utils/database.js'
import { logger } from '../utils/logger.js'

// Types
export type DisconnectMode = 'soft' | 'hard' | 'auto'

export interface WabaDeletedCounts {
  messages: number
  phoneNumbers: number
  customers?: number
  customerActivities?: number
  customerCustomFields?: number
  consentLogs?: number
}

export interface AutoDisconnectResult {
  success: boolean
  message: string
  reason: string
  userId: string
  wabaId: string | null
  phoneNumberId: string | null
}

export interface InstagramDeletedCounts {
  messages: number
  conversations: number
  accountDeleted?: boolean
}

export interface DisconnectResult {
  success: boolean
  message: string
  mode: DisconnectMode
  deletedCounts: WabaDeletedCounts | InstagramDeletedCounts
}

export class DisconnectService {
  /**
   * Soft disconnect WhatsApp - preserve customer data
   * Operates on a specific WhatsAppAccount instead of clearing User WABA fields.
   *
   * @param whatsappAccountId - The WhatsAppAccount record ID
   * @param userId - The user ID (for scoping message/phone deletion)
   *
   * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
   */
  async softDisconnectWaba(whatsappAccountId: string, userId: string): Promise<DisconnectResult> {
    const deletedCounts: WabaDeletedCounts = {
      messages: 0,
      phoneNumbers: 0
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Get phone number IDs belonging to this WhatsApp account
      const accountPhones = await tx.phoneNumber.findMany({
        where: { whatsappAccountId },
        select: { phoneNumberId: true }
      })
      const phoneNumberIds = accountPhones.map(p => p.phoneNumberId)

      // Delete all Message records for this user (Req 2.1)
      // Messages are scoped to userId, not per-account, to maintain backward compat
      const messagesResult = await tx.message.deleteMany({
        where: { userId }
      })
      deletedCounts.messages = messagesResult.count

      // Delete PhoneNumber records for this WhatsApp account (Req 2.2)
      const phoneNumbersResult = await tx.phoneNumber.deleteMany({
        where: { whatsappAccountId }
      })
      deletedCounts.phoneNumbers = phoneNumbersResult.count

      // Update WhatsAppAccount: clear token and set status to disconnected (Req 2.3, 2.5)
      await tx.whatsAppAccount.update({
        where: { id: whatsappAccountId },
        data: {
          connectionStatus: 'disconnected',
          accessToken: '',
          accessTokenIV: '',
          accessTokenTag: '',
          tokenExpiresAt: null,
          tokenLastRefresh: null,
          webhookSubscribedAt: null,
          webhookSubscribedEvents: null
        }
      })
    })

    // Customer data is preserved (Req 2.4)
    return {
      success: true,
      message: 'WhatsApp disconnected successfully. Customer data has been preserved.',
      mode: 'soft',
      deletedCounts
    }
  }

  /**
   * Auto disconnect WhatsApp - mark as disconnected without deleting data
   * Used when we detect the phone number is no longer valid (e.g., deleted from HP)
   *
   * This preserves ALL data (messages, customers, phone numbers) but marks
   * the connection as disconnected so user knows to reconnect.
   *
   * @param whatsappAccountId - The WhatsAppAccount record ID
   * @param reason - The reason for auto-disconnect (for logging)
   * @returns AutoDisconnectResult
   */
  async autoDisconnectWaba(whatsappAccountId: string, reason: string): Promise<AutoDisconnectResult> {
    const account = await prisma.whatsAppAccount.findUnique({
      where: { id: whatsappAccountId },
      select: {
        id: true,
        wabaId: true,
        connectionStatus: true,
        userId: true,
        user: {
          select: { email: true }
        },
        phoneNumbers: {
          where: { isPrimary: true },
          select: { phoneNumberId: true },
          take: 1
        }
      }
    })

    if (!account) {
      return {
        success: false,
        message: 'WhatsApp account not found',
        reason,
        userId: '',
        wabaId: null,
        phoneNumberId: null
      }
    }

    const primaryPhoneNumberId = account.phoneNumbers[0]?.phoneNumberId || null

    // Already disconnected, no action needed
    if (account.connectionStatus === 'disconnected') {
      return {
        success: true,
        message: 'WABA already disconnected',
        reason,
        userId: account.userId,
        wabaId: account.wabaId,
        phoneNumberId: primaryPhoneNumberId
      }
    }

    // Update connection status to disconnected
    // Preserve tokens so user can potentially reconnect without full re-auth
    await prisma.whatsAppAccount.update({
      where: { id: whatsappAccountId },
      data: {
        connectionStatus: 'disconnected'
      }
    })

    logger.warn('WABA auto-disconnected due to stale connection', {
      whatsappAccountId,
      userId: account.userId,
      wabaId: account.wabaId,
      phoneNumberId: primaryPhoneNumberId,
      reason,
      userEmail: account.user.email
    })

    return {
      success: true,
      message: 'WABA marked as disconnected. User needs to reconnect.',
      reason,
      userId: account.userId,
      wabaId: account.wabaId,
      phoneNumberId: primaryPhoneNumberId
    }
  }

  /**
   * Hard disconnect WhatsApp - delete all data including customers
   *
   * @param whatsappAccountId - The WhatsAppAccount record ID
   * @param userId - The user ID (for scoping customer/message deletion)
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7
   */
  async hardDisconnectWaba(whatsappAccountId: string, userId: string): Promise<DisconnectResult> {
    const deletedCounts: WabaDeletedCounts = {
      messages: 0,
      phoneNumbers: 0,
      customers: 0,
      customerActivities: 0,
      customerCustomFields: 0,
      consentLogs: 0
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Delete all Message records for user (Req 3.1)
      const messagesResult = await tx.message.deleteMany({
        where: { userId }
      })
      deletedCounts.messages = messagesResult.count

      // Delete all ConsentLog records for user's customers (Req 3.2)
      const consentLogsResult = await tx.consentLog.deleteMany({
        where: { customer: { userId } }
      })
      deletedCounts.consentLogs = consentLogsResult.count

      // Delete all CustomerCustomField records for user's customers (Req 3.3)
      const customFieldsResult = await tx.customerCustomField.deleteMany({
        where: { customer: { userId } }
      })
      deletedCounts.customerCustomFields = customFieldsResult.count

      // Delete all CustomerActivity records for user's customers (Req 3.4)
      const activitiesResult = await tx.customerActivity.deleteMany({
        where: { customer: { userId } }
      })
      deletedCounts.customerActivities = activitiesResult.count

      // Delete all Customer records for user (Req 3.5)
      const customersResult = await tx.customer.deleteMany({
        where: { userId }
      })
      deletedCounts.customers = customersResult.count

      // Delete PhoneNumber records for this WhatsApp account (Req 3.6)
      const phoneNumbersResult = await tx.phoneNumber.deleteMany({
        where: { whatsappAccountId }
      })
      deletedCounts.phoneNumbers = phoneNumbersResult.count

      // Update WhatsAppAccount: clear credentials and set status (Req 3.7)
      await tx.whatsAppAccount.update({
        where: { id: whatsappAccountId },
        data: {
          connectionStatus: 'disconnected',
          accessToken: '',
          accessTokenIV: '',
          accessTokenTag: '',
          tokenExpiresAt: null,
          tokenLastRefresh: null,
          webhookSubscribedAt: null,
          webhookSubscribedEvents: null
        }
      })
    })

    return {
      success: true,
      message: 'WhatsApp disconnected successfully. All data including customers has been deleted.',
      mode: 'hard',
      deletedCounts
    }
  }

  /**
   * Soft disconnect Instagram - preserve account record
   * Requirements: 4.1, 4.2, 4.3, 4.4
   */
  async softDisconnectInstagram(accountId: string): Promise<DisconnectResult> {
    const deletedCounts: InstagramDeletedCounts = {
      messages: 0,
      conversations: 0
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Delete all IGMessage records for account (Req 4.1)
      const messagesResult = await tx.iGMessage.deleteMany({
        where: {
          conversation: { instagramAccountId: accountId }
        }
      })
      deletedCounts.messages = messagesResult.count

      // Delete all IGConversation records for account (Req 4.2)
      const conversationsResult = await tx.iGConversation.deleteMany({
        where: { instagramAccountId: accountId }
      })
      deletedCounts.conversations = conversationsResult.count

      // Clear access token credentials and update status (Req 4.3, 4.4)
      await tx.instagramAccount.update({
        where: { id: accountId },
        data: {
          connectionStatus: 'disconnected',
          accessToken: '',
          accessTokenIV: '',
          accessTokenTag: ''
        }
      })
    })

    return {
      success: true,
      message: 'Instagram disconnected successfully. Account record has been preserved.',
      mode: 'soft',
      deletedCounts
    }
  }

  /**
   * Hard disconnect Instagram - delete account record entirely
   * Requirements: 5.1, 5.2, 5.3
   */
  async hardDisconnectInstagram(accountId: string): Promise<DisconnectResult> {
    const deletedCounts: InstagramDeletedCounts = {
      messages: 0,
      conversations: 0,
      accountDeleted: true
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx) => {
      // Delete all IGMessage records for account (Req 5.1)
      const messagesResult = await tx.iGMessage.deleteMany({
        where: {
          conversation: { instagramAccountId: accountId }
        }
      })
      deletedCounts.messages = messagesResult.count

      // Delete all IGConversation records for account (Req 5.2)
      const conversationsResult = await tx.iGConversation.deleteMany({
        where: { instagramAccountId: accountId }
      })
      deletedCounts.conversations = conversationsResult.count

      // Delete connection logs first (foreign key constraint)
      await tx.iGConnectionLog.deleteMany({
        where: { instagramAccountId: accountId }
      })

      // Delete InstagramAccount record entirely (Req 5.3)
      await tx.instagramAccount.delete({
        where: { id: accountId }
      })
    })

    return {
      success: true,
      message: 'Instagram disconnected successfully. All data including account has been deleted.',
      mode: 'hard',
      deletedCounts
    }
  }
}

// Export singleton instance
export const disconnectService = new DisconnectService()
