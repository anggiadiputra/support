import cron from "node-cron"
import { logger } from "../utils/logger.js"
import { wabaHealthService } from "../services/waba/health-service.js"
import { disconnectService } from "../services/disconnect-service.js"
import { prisma } from "../utils/database.js"
import { decryptAccountToken } from "../utils/whatsapp-account-helper.js"

/**
 * Cron job to check phone number registration status
 *
 * Runs every 24 hours to detect phone numbers that have been
 * deleted or disconnected from WhatsApp (e.g., user unlinked from HP).
 * 
 * This catches stale connections where the user has disconnected
 * WhatsApp from their phone but the database still shows "connected".
 */
export function startPhoneNumberStatusCheckJob() {
  // Run every 24 hours at 3 AM: 0 3 * * *
  cron.schedule("0 3 * * *", async () => {
    logger.info("Starting phone number status check job")

    try {
      // Get all phone numbers linked to connected WhatsApp accounts
      const phoneNumbers = await prisma.phoneNumber.findMany({
        where: {
          whatsappAccount: {
            connectionStatus: "connected",
            accessToken: { not: "" },
          },
        },
        include: {
          whatsappAccount: true,
          user: true,
        },
      })

      if (phoneNumbers.length === 0) {
        logger.info("No connected phone numbers found for status check")
        return
      }

      logger.info(`Checking status for ${phoneNumbers.length} phone numbers`)

      const results = {
        success: 0,
        disconnected: 0,
        failed: 0,
        errors: [] as Array<{ userId: string; phoneNumberId: string; error: string }>,
      }

      for (const phone of phoneNumbers) {
        try {
          // Skip if no linked WhatsApp account
          if (!phone.whatsappAccount) {
            continue
          }

          // Decrypt access token from WhatsApp account
          const accessToken = decryptAccountToken(phone.whatsappAccount)

          // Check phone number status via Meta API
          const statusResult = await wabaHealthService.checkPhoneNumberStatus(
            phone.phoneNumberId,
            accessToken
          )

          if (!statusResult.isConnected) {
            // Phone number is not connected - auto-disconnect
            const reason = statusResult.error
              ? `Phone number status check failed: ${statusResult.error}`
              : `Phone number status is ${statusResult.status || "unknown"} (not CONNECTED)`

            await disconnectService.autoDisconnectWaba(phone.whatsappAccount.id, reason)

            results.disconnected++
            logger.warn(`Phone number disconnected for user ${phone.userId}`, {
              phoneNumberId: phone.phoneNumberId,
              status: statusResult.status,
              error: statusResult.error,
              errorCode: statusResult.errorCode,
              errorSubcode: statusResult.errorSubcode,
            })
          } else {
            results.success++
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          logger.error(`Phone number status check failed for phone ${phone.phoneNumberId}:`, {
            error: errorMessage,
          })
          results.failed++
          results.errors.push({
            userId: phone.userId,
            phoneNumberId: phone.phoneNumberId,
            error: errorMessage,
          })
        }
      }

      logger.info("Phone number status check completed", {
        success: results.success,
        disconnected: results.disconnected,
        failed: results.failed,
      })
    } catch (error) {
      logger.error("Phone number status check job error:", error)
    }
  })

  logger.info("Phone number status check cron job scheduled (daily at 3 AM)")
}
