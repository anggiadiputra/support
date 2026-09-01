import { prisma } from "../../utils/database.js"
import { cacheRedis } from "../../utils/cache.js"
import { wabaHealthService } from "../waba/health-service.js"
import { TokenEncryptionService } from "../../utils/tokenEncryption.js"
import { logger, extractAxiosError } from "../../utils/logger.js"

const tokenEncryption = new TokenEncryptionService()

/**
 * WABA Account Health Status
 */
export type WABAHealthStatus = "ACTIVE" | "RESTRICTED" | "UNDER_REVIEW" | "FLAGGED" | "DISABLED"

/**
 * Account Health Info for Admin
 */
export interface AccountHealthInfo {
  status: WABAHealthStatus
  restrictionType: string | null
  errorCode: number | null
  errorMessage: string | null
  detectedAt: Date | null
  detectedFrom: string | null
}

/**
 * User WABA and Channel Info Response
 */
export interface UserWABAInfo {
  whatsappAccounts: {
    id: string
    wabaId: string
    wabaName: string | null
    connectionStatus: string
    connectedAt: Date
    lastSyncAt: Date | null
    tokenExpiresAt: Date | null
    phoneNumbers: {
      id: string
      phoneNumberId: string
      displayPhoneNumber: string
      verifiedName: string | null
      qualityRating: string | null
      isPrimary: boolean
    }[]
  }[]
  accountHealth: AccountHealthInfo | null
  instagramAccounts: {
    id: string
    username: string
    connectionStatus: string
    connectedAt: Date
    tokenExpiresAt: Date | null
  }[]
  facebookPages: {
    id: string
    pageName: string
    connectionStatus: string
    connectedAt: Date
  }[]
}

/**
 * User Templates Response (no content for privacy)
 */
export interface UserTemplateInfo {
  templates: {
    id: string
    name: string
    status: string
    category: string
    language: string
    createdAt: Date
  }[]
  summary: {
    total: number
    approved: number
    pending: number
    rejected: number
  }
}

/**
 * User Message Stats Response (counts only, no content)
 */
export interface UserMessageStats {
  period: {
    days: number
    startDate: Date
    endDate: Date
  }
  totals: {
    sent: number
    delivered: number
    read: number
    failed: number
  }
  bySource: {
    api: number
    instagram: number
  }
  daily: {
    date: string
    sent: number
    delivered: number
    failed: number
  }[]
}

export class AdminUserSupportService {
  /**
   * Get user's WABA connections and channel info
   */
  static async getUserWABAInfo(userId: string): Promise<UserWABAInfo | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        whatsappAccounts: {
          include: {
            phoneNumbers: true
          },
          orderBy: { connectedAt: 'desc' }
        },
        instagramAccounts: true,
        facebookPages: true
      }
    })

    if (!user) {
      return null
    }

    // Get current account health status from the first connected WABA
    let accountHealth: AccountHealthInfo | null = null
    const connectedAccount = (user as any).whatsappAccounts?.find(
      (a: any) => a.connectionStatus === 'connected'
    )

    if (connectedAccount) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const healthStatus = await (prisma as any).wABAAccountStatus.findFirst({
        where: {
          wabaId: connectedAccount.wabaId,
          resolvedAt: null
        },
        orderBy: {
          detectedAt: "desc"
        }
      })

      if (healthStatus) {
        accountHealth = {
          status: healthStatus.status,
          restrictionType: healthStatus.restrictionType,
          errorCode: healthStatus.errorCode,
          errorMessage: healthStatus.errorMessage,
          detectedAt: healthStatus.detectedAt,
          detectedFrom: healthStatus.detectedFrom
        }
      } else {
        // No active issues = ACTIVE status
        accountHealth = {
          status: "ACTIVE",
          restrictionType: null,
          errorCode: null,
          errorMessage: null,
          detectedAt: null,
          detectedFrom: null
        }
      }
    }

    return {
      whatsappAccounts: ((user as any).whatsappAccounts || []).map((wa: any) => ({
        id: wa.id,
        wabaId: wa.wabaId,
        wabaName: wa.wabaName,
        connectionStatus: wa.connectionStatus,
        connectedAt: wa.connectedAt,
        lastSyncAt: wa.lastSyncAt,
        tokenExpiresAt: wa.tokenExpiresAt,
        phoneNumbers: (wa.phoneNumbers || []).map((pn: any) => ({
          id: pn.id,
          phoneNumberId: pn.phoneNumberId,
          displayPhoneNumber: pn.displayPhoneNumber,
          verifiedName: pn.verifiedName,
          qualityRating: pn.qualityRating,
          isPrimary: pn.isPrimary
        }))
      })),
      accountHealth,
      instagramAccounts: user.instagramAccounts.map(ig => ({
        id: ig.id,
        username: ig.username,
        connectionStatus: ig.connectionStatus,
        connectedAt: ig.connectedAt,
        tokenExpiresAt: ig.tokenExpiresAt
      })),
      facebookPages: user.facebookPages.map(fp => ({
        id: fp.id,
        pageName: fp.pageName,
        connectionStatus: fp.connectionStatus,
        connectedAt: fp.connectedAt
      }))
    }
  }

  /**
   * Get user's templates (metadata only, no content for privacy)
   */
  static async getUserTemplates(userId: string): Promise<UserTemplateInfo | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return null
    }

    const templates = await prisma.messageTemplate.findMany({
      where: { userId },
      select: {
        id: true,
        templateName: true,
        status: true,
        category: true,
        language: true,
        createdAt: true
      },
      orderBy: { createdAt: "desc" }
    })

    // Calculate summary
    const summary = {
      total: templates.length,
      approved: templates.filter(t => t.status === "APPROVED").length,
      pending: templates.filter(t => t.status === "PENDING").length,
      rejected: templates.filter(t => t.status === "REJECTED").length
    }

    return {
      templates: templates.map(t => ({
        id: t.id,
        name: t.templateName,
        status: t.status,
        category: t.category,
        language: t.language,
        createdAt: t.createdAt
      })),
      summary
    }
  }

  /**
   * Get user's message statistics (counts only, no content for privacy)
   */
  static async getUserMessageStats(userId: string, days: number = 30): Promise<UserMessageStats | null> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return null
    }

    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    // Get total counts by status
    const [sentCount, deliveredCount, readCount, failedCount] = await Promise.all([
      prisma.message.count({
        where: {
          userId,
          direction: "OUTBOUND",
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      prisma.message.count({
        where: {
          userId,
          direction: "OUTBOUND",
          status: "DELIVERED",
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      prisma.message.count({
        where: {
          userId,
          direction: "OUTBOUND",
          status: "READ",
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      prisma.message.count({
        where: {
          userId,
          direction: "OUTBOUND",
          status: "FAILED",
          createdAt: { gte: startDate, lte: endDate }
        }
      })
    ])

    // Get counts by source
    const [apiCount, instagramCount] = await Promise.all([
      prisma.message.count({
        where: {
          userId,
          source: "API",
          createdAt: { gte: startDate, lte: endDate }
        }
      }),
      prisma.message.count({
        where: {
          userId,
          source: "INSTAGRAM",
          createdAt: { gte: startDate, lte: endDate }
        }
      })
    ])

    // Get daily breakdown (last 7 days for chart)
    const dailyStats: { date: string; sent: number; delivered: number; failed: number }[] = []
    for (let i = 6; i >= 0; i--) {
      const dayStart = new Date()
      dayStart.setDate(dayStart.getDate() - i)
      dayStart.setHours(0, 0, 0, 0)
      
      const dayEnd = new Date(dayStart)
      dayEnd.setHours(23, 59, 59, 999)

      const [sent, delivered, failed] = await Promise.all([
        prisma.message.count({
          where: {
            userId,
            direction: "OUTBOUND",
            createdAt: { gte: dayStart, lte: dayEnd }
          }
        }),
        prisma.message.count({
          where: {
            userId,
            direction: "OUTBOUND",
            status: "DELIVERED",
            createdAt: { gte: dayStart, lte: dayEnd }
          }
        }),
        prisma.message.count({
          where: {
            userId,
            direction: "OUTBOUND",
            status: "FAILED",
            createdAt: { gte: dayStart, lte: dayEnd }
          }
        })
      ])

      dailyStats.push({
        date: dayStart.toISOString().split("T")[0],
        sent,
        delivered,
        failed
      })
    }

    return {
      period: {
        days,
        startDate,
        endDate
      },
      totals: {
        sent: sentCount,
        delivered: deliveredCount,
        read: readCount,
        failed: failedCount
      },
      bySource: {
        api: apiCount,
        instagram: instagramCount
      },
      daily: dailyStats
    }
  }

  /**
   * Reset (revoke) all API keys for a user
   */
  static async resetUserApiKeys(
    userId: string,
    adminUserId: string
  ): Promise<{ success: boolean; revokedCount?: number; error?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    // Count active keys first
    const activeKeysCount = await prisma.apiKey.count({
      where: { 
        userId, 
        revokedAt: null,
        expiresAt: { gt: new Date() }
      }
    })

    // Revoke all API keys by setting revokedAt
    const result = await prisma.$transaction([
      prisma.apiKey.updateMany({
        where: { 
          userId, 
          revokedAt: null 
        },
        data: { 
          revokedAt: new Date()
        }
      }),
      prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: "ADMIN_RESET_API_KEYS",
          entityType: "ApiKey",
          entityId: userId,
          details: JSON.stringify({
            targetUserId: userId,
            targetUserEmail: user.email,
            revokedCount: activeKeysCount
          })
        }
      })
    ])

    return { success: true, revokedCount: result[0].count }
  }

  /**
   * Force sync templates from Meta for a user
   * Note: This triggers the same sync logic as POST /api/v1/templates/sync
   */
  static async forceSyncTemplates(
    userId: string,
    adminUserId: string
  ): Promise<{ success: boolean; syncedCount?: number; error?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    // Find the first connected WhatsApp account for this user
    const whatsappAccount = await prisma.whatsAppAccount.findFirst({
      where: { userId, connectionStatus: 'connected' }
    })

    if (!whatsappAccount) {
      return { success: false, error: "User has no WABA connected" }
    }

    try {
      // Import WhatsApp client and helper dynamically
      const { WhatsAppAPI } = await import("../../utils/whatsapp.js")
      const { templateCacheService } = await import("../template-cache-service.js")
      const { decryptAccountToken } = await import("../../utils/whatsapp-account-helper.js")

      // Use per-account token (per Meta policy)
      const accessToken = decryptAccountToken(whatsappAccount)
      const whatsapp = new WhatsAppAPI({ accessToken })
      const wabaId = whatsappAccount.wabaId

      console.log(`[Admin] Force syncing templates from Meta for WABA ${wabaId}, userId: ${userId}`)

      // Fetch templates from Meta
      const metaTemplates = await whatsapp["client"].get(`/${wabaId}/message_templates`, {
        params: {
          limit: 100,
          fields: "id,name,status,category,language,components,rejected_reason"
        }
      })

      const metaTemplateList = metaTemplates.data.data || []

      // Delete existing templates
      const deleteResult = await prisma.messageTemplate.deleteMany({
        where: { userId }
      })

      // Create all templates from Meta
      let created = 0
      for (const metaTemplate of metaTemplateList) {
        let content = ""
        let headerType = null
        let headerContent = null
        let footerContent = null
        let buttons = null

        if (metaTemplate.components) {
          const bodyComponent = metaTemplate.components.find((c: any) => c.type === "BODY")
          const headerComponent = metaTemplate.components.find((c: any) => c.type === "HEADER")
          const footerComponent = metaTemplate.components.find((c: any) => c.type === "FOOTER")
          const buttonsComponent = metaTemplate.components.find((c: any) => c.type === "BUTTONS")

          if (bodyComponent) content = bodyComponent.text || ""
          if (headerComponent) {
            headerType = headerComponent.format || null
            headerContent = headerComponent.text || null
          }
          if (footerComponent) footerContent = footerComponent.text || null
          if (buttonsComponent) buttons = buttonsComponent.buttons || null
        }

        await prisma.messageTemplate.create({
          data: {
            userId,
            templateName: metaTemplate.name,
            category: metaTemplate.category || "UTILITY",
            language: metaTemplate.language,
            content: content,
            headerType: headerType,
            headerContent: headerContent,
            footerContent: footerContent,
            buttons: buttons,
            status: metaTemplate.status,
            metaTemplateId: metaTemplate.id,
            approvedAt: metaTemplate.status === "APPROVED" ? new Date() : null,
            rejectionReason: metaTemplate.status === "REJECTED" ? metaTemplate.rejected_reason : null
          }
        })
        created++
      }

      // Invalidate cache
      await templateCacheService.invalidateTemplateList(userId)

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: "ADMIN_FORCE_SYNC_TEMPLATES",
          entityType: "MessageTemplate",
          entityId: userId,
          details: JSON.stringify({
            targetUserId: userId,
            targetUserEmail: user.email,
            deleted: deleteResult.count,
            created: created
          })
        }
      })

      console.log(`✅ [Admin] Force synced ${created} templates for user ${userId}`)
      return { success: true, syncedCount: created }
    } catch (error) {
      logger.error('Force sync templates error', { error: extractAxiosError(error) })
      return { success: false, error: "Failed to sync templates from Meta" }
    }
  }

  /**
   * Clear all cached data for a user
   */
  static async clearUserCache(
    userId: string,
    adminUserId: string
  ): Promise<{ success: boolean; clearedKeys?: number; error?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    try {
      // Get all cache keys for this user
      const patterns = [
        `cache:user:${userId}*`,
        `cache:dashboard:*:${userId}*`,
        `cache:subscription:${userId}*`,
        `cache:templates:${userId}*`,
        `cache:customers:${userId}*`
      ]

      let totalCleared = 0
      for (const pattern of patterns) {
        const keys = await cacheRedis.keys(pattern)
        if (keys.length > 0) {
          // Remove prefix before deletion
          const keysWithoutPrefix = keys.map(k => k.replace(/^cache:/, ""))
          await cacheRedis.del(...keysWithoutPrefix)
          totalCleared += keys.length
        }
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: "ADMIN_CLEAR_USER_CACHE",
          entityType: "Cache",
          entityId: userId,
          details: JSON.stringify({
            targetUserId: userId,
            targetUserEmail: user.email,
            clearedKeys: totalCleared
          })
        }
      })

      return { success: true, clearedKeys: totalCleared }
    } catch (error) {
      logger.error('Clear user cache error', { error: extractAxiosError(error) })
      return { success: false, error: "Failed to clear user cache" }
    }
  }

  /**
   * Check WABA health status for a user (manual trigger by admin)
   * Calls Meta API directly to get current health status
   */
  static async checkUserWABAHealth(
    userId: string,
    adminUserId: string
  ): Promise<{
    success: boolean
    accountHealth?: AccountHealthInfo
    error?: string
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return { success: false, error: "User not found" }
    }

    // Find the first connected WhatsApp account for this user
    const whatsappAccount = await prisma.whatsAppAccount.findFirst({
      where: { userId, connectionStatus: 'connected' }
    })

    if (!whatsappAccount) {
      return { success: false, error: "User has no WABA connected" }
    }

    // Check all required token fields on the WhatsApp account
    if (!whatsappAccount.accessToken || !whatsappAccount.accessTokenIV || !whatsappAccount.accessTokenTag) {
      return { success: false, error: "WhatsApp account has no access token" }
    }

    try {
      // Decrypt access token from WhatsAppAccount
      const accessToken = tokenEncryption.decrypt({
        ciphertext: whatsappAccount.accessToken,
        iv: whatsappAccount.accessTokenIV,
        authTag: whatsappAccount.accessTokenTag,
        algorithm: "aes-256-gcm",
      })

      // Call Meta API to check health status
      const healthResult = await wabaHealthService.checkAccountHealth(
        whatsappAccount.wabaId,
        accessToken
      )

      // Update status in database based on result
      if (healthResult.hasIssues) {
        await wabaHealthService.updateStatusFromPolling(whatsappAccount.wabaId, healthResult)
      } else {
        // If no issues, mark any active issues as resolved
        await wabaHealthService.markAsResolved(whatsappAccount.wabaId)
      }

      // Create audit log
      await prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: "ADMIN_CHECK_WABA_HEALTH",
          entityType: "WABAAccountStatus",
          entityId: whatsappAccount.wabaId,
          details: JSON.stringify({
            targetUserId: userId,
            targetUserEmail: user.email,
            healthStatus: healthResult.status,
            hasIssues: healthResult.hasIssues,
            restrictionType: healthResult.restrictionType || null
          })
        }
      })

      // Return current health status
      const accountHealth: AccountHealthInfo = {
        status: healthResult.status,
        restrictionType: healthResult.restrictionType || null,
        errorCode: null,
        errorMessage: healthResult.errorMessage || null,
        detectedAt: healthResult.hasIssues ? new Date() : null,
        detectedFrom: healthResult.hasIssues ? "ADMIN_CHECK" : null
      }

      return { success: true, accountHealth }
    } catch (error) {
      logger.error('Check WABA health error', { error: extractAxiosError(error) })
      return { success: false, error: "Failed to check WABA health from Meta" }
    }
  }
}
