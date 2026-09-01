import { prisma } from "../utils/database.js"

/**
 * Audit Log Action Types - Comprehensive list of all trackable actions
 */
export const AuditActions = {
  // === Authentication ===
  AUTH_LOGIN: "AUTH_LOGIN",
  AUTH_LOGOUT: "AUTH_LOGOUT",
  AUTH_LOGIN_FAILED: "AUTH_LOGIN_FAILED",
  AUTH_PASSWORD_RESET: "AUTH_PASSWORD_RESET",
  AUTH_EMAIL_VERIFIED: "AUTH_EMAIL_VERIFIED",

  // === User Management ===
  USER_CREATED: "USER_CREATED",
  USER_UPDATED: "USER_UPDATED",
  USER_ACTIVATED: "USER_ACTIVATED",
  USER_DEACTIVATED: "USER_DEACTIVATED",
  USERS_BULK_ACTIVATED: "USERS_BULK_ACTIVATED",
  USERS_BULK_DEACTIVATED: "USERS_BULK_DEACTIVATED",

  // === Subscription ===
  SUBSCRIPTION_CREATED: "SUBSCRIPTION_CREATED",
  SUBSCRIPTION_UPDATED: "SUBSCRIPTION_UPDATED",
  SUBSCRIPTION_CANCELLED: "SUBSCRIPTION_CANCELLED",
  SUBSCRIPTION_EXPIRED: "SUBSCRIPTION_EXPIRED",

  // === Messages - Inbound ===
  MESSAGE_RECEIVED: "MESSAGE_RECEIVED",
  MESSAGE_RECEIVED_FAILED: "MESSAGE_RECEIVED_FAILED",
  MESSAGE_MEDIA_DOWNLOADED: "MESSAGE_MEDIA_DOWNLOADED",
  MESSAGE_MEDIA_DOWNLOAD_FAILED: "MESSAGE_MEDIA_DOWNLOAD_FAILED",

  // === Messages - Outbound ===
  MESSAGE_SENT: "MESSAGE_SENT",
  MESSAGE_SEND_FAILED: "MESSAGE_SEND_FAILED",
  MESSAGE_DELIVERED: "MESSAGE_DELIVERED",
  MESSAGE_READ: "MESSAGE_READ",
  MESSAGE_FAILED: "MESSAGE_FAILED",

  // === Bulk/Broadcast Messages ===
  BROADCAST_CREATED: "BROADCAST_CREATED",
  BROADCAST_STARTED: "BROADCAST_STARTED",
  BROADCAST_COMPLETED: "BROADCAST_COMPLETED",
  BROADCAST_FAILED: "BROADCAST_FAILED",
  BROADCAST_CANCELLED: "BROADCAST_CANCELLED",

  // === Templates ===
  TEMPLATE_CREATED: "TEMPLATE_CREATED",
  TEMPLATE_UPDATED: "TEMPLATE_UPDATED",
  TEMPLATE_DELETED: "TEMPLATE_DELETED",
  TEMPLATE_SUBMITTED: "TEMPLATE_SUBMITTED",
  TEMPLATE_APPROVED: "TEMPLATE_APPROVED",
  TEMPLATE_REJECTED: "TEMPLATE_REJECTED",
  TEMPLATE_SYNCED: "TEMPLATE_SYNCED",

  // === Customers ===
  CUSTOMER_CREATED: "CUSTOMER_CREATED",
  CUSTOMER_UPDATED: "CUSTOMER_UPDATED",
  CUSTOMER_DELETED: "CUSTOMER_DELETED",
  CUSTOMER_IMPORTED: "CUSTOMER_IMPORTED",
  CUSTOMER_EXPORTED: "CUSTOMER_EXPORTED",
  CUSTOMER_CONSENT_UPDATED: "CUSTOMER_CONSENT_UPDATED",

  // === WABA Connection ===
  WABA_CONNECTED: "WABA_CONNECTED",
  WABA_DISCONNECTED: "WABA_DISCONNECTED",
  WABA_CONNECTION_FAILED: "WABA_CONNECTION_FAILED",
  WABA_PHONE_REGISTERED: "WABA_PHONE_REGISTERED",
  WABA_SETTINGS_UPDATED: "WABA_SETTINGS_UPDATED",

  // === Webhooks ===
  WEBHOOK_RECEIVED: "WEBHOOK_RECEIVED",
  WEBHOOK_PROCESSED: "WEBHOOK_PROCESSED",
  WEBHOOK_FAILED: "WEBHOOK_FAILED",
  WEBHOOK_STATUS_UPDATE: "WEBHOOK_STATUS_UPDATE",
  WEBHOOK_ENDPOINT_CREATED: "WEBHOOK_ENDPOINT_CREATED",
  WEBHOOK_ENDPOINT_UPDATED: "WEBHOOK_ENDPOINT_UPDATED",
  WEBHOOK_ENDPOINT_DELETED: "WEBHOOK_ENDPOINT_DELETED",

  // === AI/Chatbot ===
  AI_RESPONSE_GENERATED: "AI_RESPONSE_GENERATED",
  AI_RESPONSE_FAILED: "AI_RESPONSE_FAILED",
  AI_AGENT_CREATED: "AI_AGENT_CREATED",
  AI_AGENT_UPDATED: "AI_AGENT_UPDATED",
  AI_AGENT_DELETED: "AI_AGENT_DELETED",
  AI_AGENT_ASSIGNED: "AI_AGENT_ASSIGNED",

  // === Conversation Assignment ===
  CONVERSATION_ASSIGNED: "CONVERSATION_ASSIGNED",
  CONVERSATION_UNASSIGNED: "CONVERSATION_UNASSIGNED",
  CONVERSATION_TRANSFERRED: "CONVERSATION_TRANSFERRED",

  // === Instagram ===
  INSTAGRAM_CONNECTED: "INSTAGRAM_CONNECTED",
  INSTAGRAM_DISCONNECTED: "INSTAGRAM_DISCONNECTED",
  INSTAGRAM_MESSAGE_RECEIVED: "INSTAGRAM_MESSAGE_RECEIVED",
  INSTAGRAM_MESSAGE_SENT: "INSTAGRAM_MESSAGE_SENT",

  // === API Keys ===
  API_KEY_CREATED: "API_KEY_CREATED",
  API_KEY_REVOKED: "API_KEY_REVOKED",
  API_KEY_USED: "API_KEY_USED",

  // === Admin Actions ===
  ADMIN_IMPERSONATION_START: "ADMIN_IMPERSONATION_START",
  ADMIN_IMPERSONATION_END: "ADMIN_IMPERSONATION_END",
  ADMIN_DATA_EXPORT: "ADMIN_DATA_EXPORT",
  ADMIN_SETTINGS_UPDATED: "ADMIN_SETTINGS_UPDATED",

  // === System ===
  SYSTEM_ERROR: "SYSTEM_ERROR",
  RATE_LIMIT_EXCEEDED: "RATE_LIMIT_EXCEEDED",
  SECURITY_ALERT: "SECURITY_ALERT",
} as const

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions]

/**
 * Entity Types for categorization
 */
export const EntityTypes = {
  USER: "User",
  MESSAGE: "Message",
  CUSTOMER: "Customer",
  TEMPLATE: "Template",
  BROADCAST: "Broadcast",
  SUBSCRIPTION: "Subscription",
  WABA: "WABA",
  WEBHOOK: "Webhook",
  AI_AGENT: "AIAgent",
  CONVERSATION: "Conversation",
  INSTAGRAM: "Instagram",
  API_KEY: "APIKey",
  SYSTEM: "System",
} as const

export type EntityType = (typeof EntityTypes)[keyof typeof EntityTypes]

/**
 * Log severity levels
 */
export type LogLevel = "INFO" | "WARNING" | "ERROR" | "CRITICAL"

/**
 * Audit log entry interface
 */
export interface AuditLogEntry {
  action: AuditAction
  entityType: EntityType
  entityId: string
  userId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  level?: LogLevel
}

/**
 * AuditLogService - Centralized audit logging service
 */
export class AuditLogService {
  /**
   * Create an audit log entry
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          userId: entry.userId,
          details: entry.details
            ? {
                ...entry.details,
                level: entry.level || "INFO",
                loggedAt: new Date().toISOString(),
              }
            : { level: entry.level || "INFO" },
          ipAddress: entry.ipAddress,
        },
      })
    } catch (error) {
      // Don't throw to avoid disrupting main flow
      console.error("[AuditLog] Failed to create audit log:", error)
    }
  }

  /**
   * Log multiple entries in batch
   */
  static async logBatch(entries: AuditLogEntry[]): Promise<void> {
    try {
      await prisma.auditLog.createMany({
        data: entries.map((entry) => ({
          action: entry.action,
          entityType: entry.entityType,
          entityId: entry.entityId,
          userId: entry.userId,
          details: entry.details
            ? {
                ...entry.details,
                level: entry.level || "INFO",
                loggedAt: new Date().toISOString(),
              }
            : { level: entry.level || "INFO" },
          ipAddress: entry.ipAddress,
        })),
      })
    } catch (error) {
      console.error("[AuditLog] Failed to create batch audit logs:", error)
    }
  }

  // === Convenience Methods ===

  /**
   * Log message received
   */
  static async logMessageReceived(
    userId: string,
    messageId: string,
    details: {
      customerId: string
      customerPhone: string
      messageType: string
      wamId?: string
      channel?: string
    }
  ): Promise<void> {
    await this.log({
      action: AuditActions.MESSAGE_RECEIVED,
      entityType: EntityTypes.MESSAGE,
      entityId: messageId,
      userId,
      details: {
        ...details,
        direction: "inbound",
      },
      level: "INFO",
    })
  }

  /**
   * Log message receive failed
   */
  static async logMessageReceiveFailed(
    userId: string,
    wamId: string,
    error: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: AuditActions.MESSAGE_RECEIVED_FAILED,
      entityType: EntityTypes.MESSAGE,
      entityId: wamId,
      userId,
      details: {
        error,
        ...details,
      },
      level: "ERROR",
    })
  }

  /**
   * Log message sent
   */
  static async logMessageSent(
    userId: string,
    messageId: string,
    details: {
      customerId: string
      customerPhone: string
      messageType: string
      wamId?: string
      source?: string
      channel?: string
    }
  ): Promise<void> {
    await this.log({
      action: AuditActions.MESSAGE_SENT,
      entityType: EntityTypes.MESSAGE,
      entityId: messageId,
      userId,
      details: {
        ...details,
        direction: "outbound",
      },
      level: "INFO",
    })
  }

  /**
   * Log message send failed
   */
  static async logMessageSendFailed(
    userId: string,
    customerId: string,
    error: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: AuditActions.MESSAGE_SEND_FAILED,
      entityType: EntityTypes.MESSAGE,
      entityId: customerId,
      userId,
      details: {
        error,
        ...details,
      },
      level: "ERROR",
    })
  }

  /**
   * Log message status update
   */
  static async logMessageStatus(
    userId: string,
    messageId: string,
    status: string,
    wamId?: string
  ): Promise<void> {
    const actionMap: Record<string, AuditAction> = {
      delivered: AuditActions.MESSAGE_DELIVERED,
      read: AuditActions.MESSAGE_READ,
      failed: AuditActions.MESSAGE_FAILED,
    }

    await this.log({
      action: actionMap[status] || AuditActions.WEBHOOK_STATUS_UPDATE,
      entityType: EntityTypes.MESSAGE,
      entityId: messageId,
      userId,
      details: { status, wamId },
      level: status === "failed" ? "ERROR" : "INFO",
    })
  }

  /**
   * Log webhook received
   */
  static async logWebhookReceived(
    userId: string,
    webhookType: string,
    details: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: AuditActions.WEBHOOK_RECEIVED,
      entityType: EntityTypes.WEBHOOK,
      entityId: `${webhookType}-${Date.now()}`,
      userId,
      details: {
        webhookType,
        ...details,
      },
      level: "INFO",
    })
  }

  /**
   * Log webhook processing failed
   */
  static async logWebhookFailed(
    userId: string,
    webhookId: string,
    error: string,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: AuditActions.WEBHOOK_FAILED,
      entityType: EntityTypes.WEBHOOK,
      entityId: webhookId,
      userId,
      details: {
        error,
        ...details,
      },
      level: "ERROR",
    })
  }

  /**
   * Log AI response
   */
  static async logAIResponse(
    userId: string,
    customerId: string,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: success
        ? AuditActions.AI_RESPONSE_GENERATED
        : AuditActions.AI_RESPONSE_FAILED,
      entityType: EntityTypes.AI_AGENT,
      entityId: customerId,
      userId,
      details,
      level: success ? "INFO" : "ERROR",
    })
  }

  /**
   * Log customer created
   */
  static async logCustomerCreated(
    userId: string,
    customerId: string,
    details: {
      phoneNumber: string
      name?: string
      source?: string
    }
  ): Promise<void> {
    await this.log({
      action: AuditActions.CUSTOMER_CREATED,
      entityType: EntityTypes.CUSTOMER,
      entityId: customerId,
      userId,
      details,
      level: "INFO",
    })
  }

  /**
   * Log WABA connection status
   */
  static async logWABAConnection(
    userId: string,
    action: "connected" | "disconnected" | "failed",
    details?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      connected: AuditActions.WABA_CONNECTED,
      disconnected: AuditActions.WABA_DISCONNECTED,
      failed: AuditActions.WABA_CONNECTION_FAILED,
    }

    await this.log({
      action: actionMap[action],
      entityType: EntityTypes.WABA,
      entityId: userId,
      userId,
      details,
      level: action === "failed" ? "ERROR" : "INFO",
    })
  }

  /**
   * Log broadcast event
   */
  static async logBroadcast(
    userId: string,
    broadcastId: string,
    action: "created" | "started" | "completed" | "failed" | "cancelled",
    details?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      created: AuditActions.BROADCAST_CREATED,
      started: AuditActions.BROADCAST_STARTED,
      completed: AuditActions.BROADCAST_COMPLETED,
      failed: AuditActions.BROADCAST_FAILED,
      cancelled: AuditActions.BROADCAST_CANCELLED,
    }

    await this.log({
      action: actionMap[action],
      entityType: EntityTypes.BROADCAST,
      entityId: broadcastId,
      userId,
      details,
      level: action === "failed" ? "ERROR" : "INFO",
    })
  }

  /**
   * Log template event
   */
  static async logTemplate(
    userId: string,
    templateId: string,
    action:
      | "created"
      | "updated"
      | "deleted"
      | "submitted"
      | "approved"
      | "rejected"
      | "synced",
    details?: Record<string, unknown>
  ): Promise<void> {
    const actionMap = {
      created: AuditActions.TEMPLATE_CREATED,
      updated: AuditActions.TEMPLATE_UPDATED,
      deleted: AuditActions.TEMPLATE_DELETED,
      submitted: AuditActions.TEMPLATE_SUBMITTED,
      approved: AuditActions.TEMPLATE_APPROVED,
      rejected: AuditActions.TEMPLATE_REJECTED,
      synced: AuditActions.TEMPLATE_SYNCED,
    }

    await this.log({
      action: actionMap[action],
      entityType: EntityTypes.TEMPLATE,
      entityId: templateId,
      userId,
      details,
      level: action === "rejected" ? "WARNING" : "INFO",
    })
  }

  /**
   * Log media download event
   */
  static async logMediaDownload(
    userId: string,
    mediaId: string,
    success: boolean,
    details?: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      action: success
        ? AuditActions.MESSAGE_MEDIA_DOWNLOADED
        : AuditActions.MESSAGE_MEDIA_DOWNLOAD_FAILED,
      entityType: EntityTypes.MESSAGE,
      entityId: mediaId,
      userId,
      details,
      level: success ? "INFO" : "WARNING",
    })
  }

  /**
   * Get logs for a specific user (for admin user detail page)
   */
  static async getLogsForUser(
    userId: string,
    options: {
      limit?: number
      offset?: number
      actions?: AuditAction[]
      entityTypes?: EntityType[]
      level?: LogLevel
      startDate?: Date
      endDate?: Date
    } = {}
  ) {
    const { limit = 50, offset = 0, actions, entityTypes, startDate, endDate } =
      options

    const where: Record<string, unknown> = { userId }

    if (actions && actions.length > 0) {
      where.action = { in: actions }
    }

    if (entityTypes && entityTypes.length > 0) {
      where.entityType = { in: entityTypes }
    }

    if (startDate || endDate) {
      where.timestamp = {}
      if (startDate) (where.timestamp as Record<string, Date>).gte = startDate
      if (endDate) (where.timestamp as Record<string, Date>).lte = endDate
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { timestamp: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      }),
      prisma.auditLog.count({ where }),
    ])

    return { logs, total }
  }
}

export default AuditLogService
