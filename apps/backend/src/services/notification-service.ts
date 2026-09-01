/**
 * NotificationService
 *
 * Handles creation, retrieval, and management of user notifications.
 * Supports various notification types including retention warnings, subscription expiry,
 * payment status updates, and API key expiration warnings.
 */

import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { NotificationType, NotificationPriority, type Notification } from '@prisma/client';
import { eventEmitter } from '../websocket/event-emitter.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface CreateNotificationParams {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  priority?: NotificationPriority;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
  expiresAt?: Date;
}

export interface GetNotificationsOptions {
  unreadOnly?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  total: number;
}

// =============================================================================
// NotificationService Class
// =============================================================================

export class NotificationService {
  /**
   * Create a new notification for a user
   *
   * @param params - CreateNotificationParams with notification details
   * @returns The created Notification
   */
  async create(params: CreateNotificationParams): Promise<Notification> {
    const {
      userId,
      type,
      title,
      message,
      priority = NotificationPriority.NORMAL,
      actionUrl,
      actionLabel,
      metadata,
      expiresAt,
    } = params;

    try {
      const notification = await prisma.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          priority,
          actionUrl,
          actionLabel,
          metadata: metadata ?? undefined,
          expiresAt,
        },
      });

      logger.info('Notification created', {
        notificationId: notification.id,
        userId,
        type,
        priority,
      });

      // Emit realtime notification to user via WebSocket
      eventEmitter.emitToUser(userId, {
        type: 'new_notification',
        payload: {
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          priority: notification.priority,
          actionUrl: notification.actionUrl,
          actionLabel: notification.actionLabel,
          isRead: notification.isRead,
          createdAt: notification.createdAt.toISOString(),
        },
      });

      return notification;
    } catch (error) {
      logger.error('Failed to create notification', {
        userId,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get notifications for a user with optional filtering and pagination
   *
   * @param userId - The user ID
   * @param options - Optional filtering and pagination options
   * @returns Object containing notifications, unreadCount, and total
   */
  async getByUser(
    userId: string,
    options: GetNotificationsOptions = {}
  ): Promise<GetNotificationsResult> {
    const { unreadOnly = false, limit = 50, offset = 0 } = options;

    try {
      // Build where clause
      const whereClause: {
        userId: string;
        isRead?: boolean;
        OR?: Array<{ expiresAt: null } | { expiresAt: { gt: Date } }>;
      } = {
        userId,
        // Exclude expired notifications
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      };

      if (unreadOnly) {
        whereClause.isRead = false;
      }

      // Query notifications and counts in parallel
      const [notifications, unreadCount, total] = await Promise.all([
        prisma.notification.findMany({
          where: whereClause,
          orderBy: [
            { priority: 'desc' }, // URGENT > HIGH > NORMAL > LOW
            { createdAt: 'desc' },
          ],
          skip: offset,
          take: limit,
        }),
        prisma.notification.count({
          where: {
            userId,
            isRead: false,
            OR: [
              { expiresAt: null },
              { expiresAt: { gt: new Date() } },
            ],
          },
        }),
        prisma.notification.count({
          where: whereClause,
        }),
      ]);

      return {
        notifications,
        unreadCount,
        total,
      };
    } catch (error) {
      logger.error('Failed to get notifications', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mark a single notification as read
   *
   * @param notificationId - The notification ID
   * @param userId - The user ID (for authorization)
   * @throws Error if notification not found or doesn't belong to user
   */
  async markAsRead(notificationId: string, userId: string): Promise<void> {
    try {
      // Verify ownership and existence
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
        select: { id: true, isRead: true },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      // Skip if already read
      if (notification.isRead) {
        return;
      }

      await prisma.notification.update({
        where: { id: notificationId },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      logger.info('Notification marked as read', { notificationId, userId });
    } catch (error) {
      logger.error('Failed to mark notification as read', {
        notificationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mark all notifications as read for a user
   *
   * @param userId - The user ID
   */
  async markAllAsRead(userId: string): Promise<void> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
          readAt: new Date(),
        },
      });

      logger.info('All notifications marked as read', {
        userId,
        count: result.count,
      });
    } catch (error) {
      logger.error('Failed to mark all notifications as read', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete a single notification
   *
   * @param notificationId - The notification ID
   * @param userId - The user ID (for authorization)
   * @throws Error if notification not found or doesn't belong to user
   */
  async delete(notificationId: string, userId: string): Promise<void> {
    try {
      // Verify ownership and existence
      const notification = await prisma.notification.findFirst({
        where: {
          id: notificationId,
          userId,
        },
        select: { id: true },
      });

      if (!notification) {
        throw new Error('Notification not found');
      }

      await prisma.notification.delete({
        where: { id: notificationId },
      });

      logger.info('Notification deleted', { notificationId, userId });
    } catch (error) {
      logger.error('Failed to delete notification', {
        notificationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Helper Methods for Specific Notification Types
  // ===========================================================================

  /**
   * Create a message retention warning notification
   * Notifies users about upcoming message deletion due to retention policy
   *
   * @param userId - The user ID
   * @param messageCount - Number of messages that will be deleted
   * @param daysUntilDeletion - Days until messages are deleted
   */
  async createRetentionWarning(
    userId: string,
    messageCount: number,
    daysUntilDeletion: number
  ): Promise<void> {
    try {
      await this.create({
        userId,
        type: NotificationType.MESSAGE_RETENTION,
        title: 'Message Retention Warning',
        message: `${messageCount} messages will be deleted in ${daysUntilDeletion} days due to retention policy. Upgrade to keep your messages longer.`,
        priority: daysUntilDeletion <= 3 ? NotificationPriority.HIGH : NotificationPriority.NORMAL,
        actionUrl: '/subscription',
        actionLabel: 'Upgrade Plan',
        metadata: {
          messageCount,
          daysUntilDeletion,
        },
      });

      logger.info('Retention warning notification created', {
        userId,
        messageCount,
        daysUntilDeletion,
      });
    } catch (error) {
      logger.error('Failed to create retention warning notification', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Create a subscription expiry warning notification
   * Notifies users about upcoming subscription expiration
   *
   * @param userId - The user ID
   * @param daysUntilExpiry - Days until subscription expires
   */
  async createSubscriptionExpiryWarning(
    userId: string,
    daysUntilExpiry: number
  ): Promise<void> {
    try {
      const priority = daysUntilExpiry <= 3
        ? NotificationPriority.URGENT
        : daysUntilExpiry <= 7
          ? NotificationPriority.HIGH
          : NotificationPriority.NORMAL;

      await this.create({
        userId,
        type: NotificationType.SUBSCRIPTION_EXPIRY,
        title: 'Subscription Expiring Soon',
        message: `Your subscription will expire in ${daysUntilExpiry} days. Renew now to continue enjoying premium features.`,
        priority,
        actionUrl: '/subscription',
        actionLabel: 'Renew Subscription',
        metadata: {
          daysUntilExpiry,
        },
      });

      logger.info('Subscription expiry warning notification created', {
        userId,
        daysUntilExpiry,
      });
    } catch (error) {
      logger.error('Failed to create subscription expiry notification', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Create a payment status notification
   * Notifies users about payment success or failure
   *
   * @param userId - The user ID
   * @param status - Payment status ('success' or 'failed')
   * @param orderId - The order/transaction ID
   */
  async createPaymentNotification(
    userId: string,
    status: 'success' | 'failed',
    orderId: string
  ): Promise<void> {
    try {
      const isSuccess = status === 'success';

      await this.create({
        userId,
        type: NotificationType.PAYMENT_STATUS,
        title: isSuccess ? 'Payment Successful' : 'Payment Failed',
        message: isSuccess
          ? `Your payment (Order ID: ${orderId}) was successful. Your subscription is now active.`
          : `Your payment (Order ID: ${orderId}) failed. Please try again or use a different payment method.`,
        priority: isSuccess ? NotificationPriority.NORMAL : NotificationPriority.HIGH,
        actionUrl: isSuccess ? '/subscription' : '/subscription?retry=true',
        actionLabel: isSuccess ? 'View Subscription' : 'Try Again',
        metadata: {
          orderId,
          status,
        },
      });

      logger.info('Payment notification created', {
        userId,
        status,
        orderId,
      });
    } catch (error) {
      logger.error('Failed to create payment notification', {
        userId,
        status,
        orderId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Create an API key expiry warning notification
   * Notifies users about upcoming API key expiration
   *
   * @param userId - The user ID
   * @param keyName - Name of the API key
   * @param daysUntilExpiry - Days until API key expires
   */
  async createApiKeyExpiryWarning(
    userId: string,
    keyName: string,
    daysUntilExpiry: number
  ): Promise<void> {
    try {
      const priority = daysUntilExpiry <= 7
        ? NotificationPriority.HIGH
        : NotificationPriority.NORMAL;

      await this.create({
        userId,
        type: NotificationType.API_KEY_EXPIRY,
        title: 'API Key Expiring Soon',
        message: `Your API key "${keyName}" will expire in ${daysUntilExpiry} days. Generate a new key to avoid service interruption.`,
        priority,
        actionUrl: '/settings/api-keys',
        actionLabel: 'Manage API Keys',
        metadata: {
          keyName,
          daysUntilExpiry,
        },
      });

      logger.info('API key expiry warning notification created', {
        userId,
        keyName,
        daysUntilExpiry,
      });
    } catch (error) {
      logger.error('Failed to create API key expiry notification', {
        userId,
        keyName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - notification failures shouldn't break the main flow
    }
  }

  /**
   * Create an escalation assignment notification
   * Notifies an agent that a conversation has been assigned to them due to escalation keyword
   *
   * @param agentId - The agent user ID to notify
   * @param conversationId - The conversation ID
   * @param conversationType - 'WHATSAPP' or 'INSTAGRAM'
   * @param groupName - Name of the escalation keyword group
   * @param customerName - Name of the customer (optional)
   */
  async createEscalationNotification(
    agentId: string,
    conversationId: string,
    conversationType: 'WHATSAPP' | 'INSTAGRAM',
    groupName: string,
    customerName?: string
  ): Promise<void> {
    try {
      const customerDisplay = customerName || 'Customer';
      const channelDisplay = conversationType === 'WHATSAPP' ? 'WhatsApp' : 'Instagram';

      // Build prefixed conversation ID to match frontend UnifiedConversation format
      // WhatsApp: wa-{customerId}, Instagram: ig-{conversationId}, Messenger: msg-{conversationId}
      const channelPrefix = conversationType === 'WHATSAPP' ? 'wa' : conversationType === 'INSTAGRAM' ? 'ig' : 'msg';
      const prefixedConversationId = `${channelPrefix}-${conversationId}`;

      await this.create({
        userId: agentId,
        type: NotificationType.ESCALATION_ASSIGNMENT,
        title: 'New Conversation Assigned',
        message: `${customerDisplay} needs assistance (${groupName}). A new ${channelDisplay} conversation has been assigned to you.`,
        priority: NotificationPriority.HIGH,
        actionUrl: `/oneinbox?conversation=${prefixedConversationId}&type=${conversationType.toLowerCase()}`,
        actionLabel: 'View Conversation',
        metadata: {
          conversationId: prefixedConversationId,
          conversationType,
          groupName,
          customerName,
        },
      });

      logger.info('Escalation notification created', {
        agentId,
        conversationId,
        conversationType,
        groupName,
      });
    } catch (error) {
      logger.error('Failed to create escalation notification', {
        agentId,
        conversationId,
        groupName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Don't throw - notification failures shouldn't break the main flow
    }
  }
}

// Export singleton instance
export const notificationService = new NotificationService();
