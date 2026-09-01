import cron from "node-cron"
import { logger } from "../utils/logger.js"
import { wabaHealthService } from "../services/waba/health-service.js"
import { prisma } from "../utils/database.js"
import { decryptAccountToken } from "../utils/whatsapp-account-helper.js"

/**
 * Cron job to check WABA account health status
 *
 * Runs every 6 hours to poll Meta Health Status API
 * and detect restricted/under review accounts.
 */
export function startWABAHealthCheckJob() {
  // Run every 6 hours: 0 */6 * * *
  cron.schedule("0 */6 * * *", async () => {
    logger.info("Starting WABA health check job")

    try {
      // Get all connected WhatsApp accounts
      const accounts = await prisma.whatsAppAccount.findMany({
        where: {
          connectionStatus: "connected",
          accessToken: { not: "" },
        },
      })

      if (accounts.length === 0) {
        logger.info("No connected WABAs found for health check")
        return
      }

      logger.info(`Checking health for ${accounts.length} WABAs`)

      const results = {
        success: 0,
        failed: 0,
        issuesFound: 0,
        issuesResolved: 0,
        errors: [] as Array<{ wabaId: string; error: string }>,
      }

      for (const account of accounts) {
        try {
          // Decrypt access token
          const accessToken = decryptAccountToken(account)

          // Check health status
          const healthResult = await wabaHealthService.checkAccountHealth(
            account.wabaId,
            accessToken
          )

          if (healthResult.hasIssues) {
            // Update status if issues found
            await wabaHealthService.updateStatusFromPolling(
              account.wabaId,
              healthResult
            )
            results.issuesFound++
            logger.warn(`Health issue found for WABA ${account.wabaId}`, {
              status: healthResult.status,
              restrictionType: healthResult.restrictionType,
            })
          } else {
            // Check if there were active issues that should be resolved
            const hadIssues = await wabaHealthService.hasActiveIssues(
              account.wabaId
            )
            if (hadIssues) {
              await wabaHealthService.markAsResolved(account.wabaId)
              results.issuesResolved++
              logger.info(`Health issues resolved for WABA ${account.wabaId}`)
            }
          }

          results.success++
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error"
          logger.error(`Health check failed for WABA account ${account.id}:`, {
            error: errorMessage,
          })
          results.failed++
          results.errors.push({ wabaId: account.wabaId, error: errorMessage })
        }
      }

      logger.info("WABA health check completed", {
        success: results.success,
        failed: results.failed,
        issuesFound: results.issuesFound,
        issuesResolved: results.issuesResolved,
      })
    } catch (error) {
      logger.error("WABA health check job error:", error)
    }
  })

  logger.info("WABA health check cron job scheduled (every 6 hours)")
}
