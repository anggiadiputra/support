// ============================================================================
// WABA Health Service
// ============================================================================
//
// Handles WABA account health monitoring including:
// - Detecting restricted/under review status from error responses
// - Polling Meta Health Status API
// - Tracking status history in database
// - Auto-resolving when messages succeed
//
// ============================================================================

import axios from "axios"
import https from "https"
import type { Prisma } from "@prisma/client"
import { wabaSettings } from "./settings.js"
import { logger, extractAxiosError } from "../../utils/logger.js"
import { prisma } from "../../utils/database.js"

// NOTE: Run `pnpm prisma:generate` after schema changes to generate types
// WABAHealthStatus type will be available after generation
type WABAHealthStatus = "ACTIVE" | "RESTRICTED" | "UNDER_REVIEW" | "FLAGGED" | "DISABLED"

// Create HTTPS agent that forces IPv4 (fixes ETIMEDOUT on some servers)
const httpsAgent = new https.Agent({
  family: 4,
  rejectUnauthorized: true,
})

/**
 * Error code to health status mapping
 */
const ERROR_TO_STATUS: Record<
  number,
  { status: WABAHealthStatus; type: string }
> = {
  131031: { status: "RESTRICTED", type: "ACCOUNT_LOCKED" },
  368: { status: "RESTRICTED", type: "POLICY_VIOLATION" },
  131048: { status: "FLAGGED", type: "SPAM_RATE_LIMIT" },
  131049: { status: "FLAGGED", type: "DELIVERY_BLOCKED" },
}

/**
 * Health-related error codes that should trigger status update
 */
const HEALTH_ERROR_CODES = Object.keys(ERROR_TO_STATUS).map(Number)

/**
 * Account status DTO for frontend
 */
export interface AccountStatusDTO {
  status: WABAHealthStatus
  restrictionType: string | null
  errorCode: number | null
  errorMessage: string | null
  detectedAt: Date
  detectedFrom: string
}

/**
 * Health check result from Meta API
 */
export interface WABAHealthResult {
  hasIssues: boolean
  status: WABAHealthStatus
  restrictionType?: string
  errorMessage?: string
  rawResponse?: Record<string, unknown>
}

/**
 * WABAHealthService
 *
 * Provides account health monitoring and status tracking.
 */
export class WABAHealthService {
  /**
   * Check if an error code is health-related
   */
  static isHealthError(errorCode: number): boolean {
    return HEALTH_ERROR_CODES.includes(errorCode)
  }

  /**
   * Get status mapping for an error code
   */
  static getStatusForError(
    errorCode: number
  ): { status: WABAHealthStatus; type: string } | null {
    return ERROR_TO_STATUS[errorCode] || null
  }

  /**
   * Check account health via Meta Health Status API
   *
   * Calls Meta Graph API to get account health status.
   * Reference: https://developers.facebook.com/docs/whatsapp/cloud-api/health-status
   */
  async checkAccountHealth(
    wabaId: string,
    accessToken: string
  ): Promise<WABAHealthResult> {
    await wabaSettings.ensureLoaded()
    const apiVersion = wabaSettings.getApiVersion()

    try {
      const response = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${wabaId}`,
        {
          params: {
            fields: "health_status,account_review_status",
            access_token: accessToken,
          },
          timeout: 30000,
          httpsAgent,
        }
      )

      const data = response.data

      // Check for health issues
      if (data.health_status) {
        const healthStatus = data.health_status

        // Check if there are any entity issues
        if (healthStatus.can_send_message === false) {
          return {
            hasIssues: true,
            status: "RESTRICTED",
            restrictionType: "CANNOT_SEND_MESSAGE",
            errorMessage: healthStatus.errors?.[0]?.error_description || "Cannot send messages",
            rawResponse: data,
          }
        }

        // Check entity statuses
        const entityStatuses = healthStatus.entity_status || []
        for (const entity of entityStatuses) {
          if (entity.can_send_message === false) {
            return {
              hasIssues: true,
              status: "RESTRICTED",
              restrictionType: entity.errors?.[0]?.error_code || "ENTITY_RESTRICTED",
              errorMessage: entity.errors?.[0]?.error_description || "Entity cannot send messages",
              rawResponse: data,
            }
          }
        }
      }

      // Check account review status
      if (data.account_review_status === "PENDING") {
        return {
          hasIssues: true,
          status: "UNDER_REVIEW",
          restrictionType: "PENDING_REVIEW",
          errorMessage: "Account is pending review by Meta",
          rawResponse: data,
        }
      }

      // No issues found
      return {
        hasIssues: false,
        status: "ACTIVE",
        rawResponse: data,
      }
    } catch (error) {
      logger.error("Failed to check account health", { wabaId, error: extractAxiosError(error) })

      // Check if it's a Meta API error
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        const metaError = error.response.data.error
        const errorCode = metaError.code

        // Check if this is a health-related error
        const statusMapping = WABAHealthService.getStatusForError(errorCode)
        if (statusMapping) {
          return {
            hasIssues: true,
            status: statusMapping.status,
            restrictionType: statusMapping.type,
            errorMessage: metaError.message,
            rawResponse: error.response.data,
          }
        }
      }

      // Return unknown error
      throw error
    }
  }

  /**
   * Update status from error response
   *
   * Called when a send message fails with a health-related error.
   * Creates a new status record if no active issue exists.
   */
  async updateStatusFromError(
    wabaId: string,
    phoneNumberId: string | null,
    errorCode: number,
    errorMessage: string,
    rawResponse?: Record<string, unknown>
  ): Promise<void> {
    const statusMapping = WABAHealthService.getStatusForError(errorCode)

    if (!statusMapping) {
      logger.debug("Error code is not health-related, skipping status update", {
        wabaId,
        errorCode,
      })
      return
    }

    // Check if there's already an active issue with the same error code
    const existingIssue = await prisma.wABAAccountStatus.findFirst({
      where: {
        wabaId,
        resolvedAt: null,
        errorCode,
      },
    })

    if (existingIssue) {
      logger.debug("Active issue already exists for this error code", {
        wabaId,
        errorCode,
        existingIssueId: existingIssue.id,
      })
      return
    }

    // Create new status record
    await prisma.wABAAccountStatus.create({
      data: {
        wabaId,
        phoneNumberId,
        status: statusMapping.status,
        restrictionType: statusMapping.type,
        errorCode,
        errorMessage,
        detectedFrom: "ERROR_RESPONSE",
        rawResponse: (rawResponse || null) as Prisma.InputJsonValue | null,
      },
    })

    logger.warn("WABA health issue detected from error response", {
      wabaId,
      status: statusMapping.status,
      restrictionType: statusMapping.type,
      errorCode,
    })
  }

  /**
   * Update status from API polling
   *
   * Called by cron job when polling Meta Health Status API.
   */
  async updateStatusFromPolling(
    wabaId: string,
    healthResult: WABAHealthResult
  ): Promise<void> {
    if (!healthResult.hasIssues) {
      return
    }

    // Check if there's already an active issue with the same restriction type
    const existingIssue = await prisma.wABAAccountStatus.findFirst({
      where: {
        wabaId,
        resolvedAt: null,
        restrictionType: healthResult.restrictionType,
      },
    })

    if (existingIssue) {
      logger.debug("Active issue already exists for this restriction type", {
        wabaId,
        restrictionType: healthResult.restrictionType,
      })
      return
    }

    // Create new status record
    await prisma.wABAAccountStatus.create({
      data: {
        wabaId,
        status: healthResult.status,
        restrictionType: healthResult.restrictionType || null,
        errorMessage: healthResult.errorMessage || null,
        detectedFrom: "API_POLLING",
        rawResponse: (healthResult.rawResponse || null) as Prisma.InputJsonValue | null,
      },
    })

    logger.warn("WABA health issue detected from API polling", {
      wabaId,
      status: healthResult.status,
      restrictionType: healthResult.restrictionType,
    })
  }

  /**
   * Get current account status
   *
   * Returns the most recent active (unresolved) status for a WABA.
   */
  async getAccountStatus(wabaId: string): Promise<AccountStatusDTO | null> {
    const status = await prisma.wABAAccountStatus.findFirst({
      where: {
        wabaId,
        resolvedAt: null,
      },
      orderBy: {
        detectedAt: "desc",
      },
    })

    if (!status) {
      return null
    }

    return {
      status: status.status,
      restrictionType: status.restrictionType,
      errorCode: status.errorCode,
      errorMessage: status.errorMessage,
      detectedAt: status.detectedAt,
      detectedFrom: status.detectedFrom,
    }
  }

  /**
   * Get status history
   *
   * Returns historical status records for a WABA.
   */
  async getStatusHistory(
    wabaId: string,
    limit: number = 20
  ): Promise<
    Array<{
      id: string
      status: WABAHealthStatus
      restrictionType: string | null
      errorCode: number | null
      errorMessage: string | null
      detectedAt: Date
      resolvedAt: Date | null
      detectedFrom: string
    }>
  > {
    const records = await prisma.wABAAccountStatus.findMany({
      where: { wabaId },
      orderBy: { detectedAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        restrictionType: true,
        errorCode: true,
        errorMessage: true,
        detectedAt: true,
        resolvedAt: true,
        detectedFrom: true,
      },
    })

    return records
  }

  /**
   * Mark status as resolved
   *
   * Called when a message is successfully sent, indicating the account is healthy.
   */
  async markAsResolved(wabaId: string): Promise<void> {
    const activeIssues = await prisma.wABAAccountStatus.findMany({
      where: {
        wabaId,
        resolvedAt: null,
      },
    })

    if (activeIssues.length === 0) {
      return
    }

    await prisma.wABAAccountStatus.updateMany({
      where: {
        wabaId,
        resolvedAt: null,
      },
      data: {
        resolvedAt: new Date(),
      },
    })

    logger.info("WABA health issues marked as resolved", {
      wabaId,
      resolvedCount: activeIssues.length,
    })
  }

  /**
   * Check if WABA has active health issues
   */
  async hasActiveIssues(wabaId: string): Promise<boolean> {
    const count = await prisma.wABAAccountStatus.count({
      where: {
        wabaId,
        resolvedAt: null,
      },
    })

    return count > 0
  }

  /**
   * Check phone number registration status via Meta API
   * 
   * Calls GET /{phone_number_id}?fields=status to verify phone number is still connected.
   * Returns status or error if phone number is deleted/invalid.
   * 
   * @param phoneNumberId - The phone number ID to check
   * @param accessToken - The access token for Meta API
   * @returns Object with isConnected boolean and status string
   */
  async checkPhoneNumberStatus(
    phoneNumberId: string,
    accessToken: string
  ): Promise<{
    isConnected: boolean
    status: string | null
    error?: string
    errorCode?: number
    errorSubcode?: number
  }> {
    await wabaSettings.ensureLoaded()
    const apiVersion = wabaSettings.getApiVersion()

    try {
      const response = await axios.get(
        `https://graph.facebook.com/${apiVersion}/${phoneNumberId}`,
        {
          params: {
            fields: "status,display_phone_number,verified_name,quality_rating",
            access_token: accessToken,
          },
          timeout: 30000,
          httpsAgent,
        }
      )

      const data = response.data
      const status = data.status?.toUpperCase() || null

      // Phone number is connected if status is "CONNECTED"
      const isConnected = status === "CONNECTED"

      return {
        isConnected,
        status,
      }
    } catch (error) {
      logger.error("Failed to check phone number status", { phoneNumberId, error: extractAxiosError(error) })

      // Check if it's a Meta API error
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        const metaError = error.response.data.error
        const errorCode = metaError.code
        const errorSubcode = metaError.error_subcode

        // Error 100 + subcode 33 = phone number deleted
        if (errorCode === 100 && errorSubcode === 33) {
          return {
            isConnected: false,
            status: null,
            error: "Phone number has been deleted",
            errorCode,
            errorSubcode,
          }
        }

        // Other errors - treat as unknown status
        return {
          isConnected: false,
          status: null,
          error: metaError.message || "Unknown error",
          errorCode,
          errorSubcode,
        }
      }

      // Network or other errors
      return {
        isConnected: false,
        status: null,
        error: error instanceof Error ? error.message : "Unknown error",
      }
    }
  }
}

// Export singleton instance
export const wabaHealthService = new WABAHealthService()
