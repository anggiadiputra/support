/**
 * WABA Health Routes
 * Handles account health status and monitoring
 */

import { Hono } from "hono"
import type { Context } from "hono"
import { requireRole } from "../../middleware/auth.js"
import { getUserByWabaId } from "./helpers.js"
import { wabaHealthService } from "../../services/waba/health-service.js"
import { decryptAccountToken } from "../../utils/whatsapp-account-helper.js"

const app = new Hono()

// GET /health - Get current health status
app.get(
  "/health",
  requireRole(["ADMIN", "BUSINESS_OWNER", "AGENT"]),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json(
          {
            error: {
              code: "Unauthorized",
              message: "Authentication required",
            },
          },
          401
        )
      }

      const wabaId = c.req.param("wabaId")

      // Get user and check access
      const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)

      if ("error" in result) {
        return c.json(result.error, result.status as 400 | 401 | 403 | 404)
      }

      // Get current status
      const status = await wabaHealthService.getAccountStatus(wabaId)

      return c.json({
        success: true,
        data: status, // null if no active issues
      })
    } catch (error) {
      console.error("Error getting health status:", error)
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get health status",
          },
        },
        500
      )
    }
  }
)

// GET /health/history - Get status history
app.get(
  "/health/history",
  requireRole(["ADMIN", "BUSINESS_OWNER"]),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json(
          {
            error: {
              code: "Unauthorized",
              message: "Authentication required",
            },
          },
          401
        )
      }

      const wabaId = c.req.param("wabaId")
      const limit = Number(c.req.query("limit")) || 20

      // Get user and check access
      const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)

      if ("error" in result) {
        return c.json(result.error, result.status as 400 | 401 | 403 | 404)
      }

      // Get history
      const history = await wabaHealthService.getStatusHistory(wabaId, limit)

      return c.json({
        success: true,
        data: history,
      })
    } catch (error) {
      console.error("Error getting health history:", error)
      return c.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get health history",
          },
        },
        500
      )
    }
  }
)

// POST /health/check - Manual health check (triggers API call to Meta)
app.post(
  "/health/check",
  requireRole(["ADMIN", "BUSINESS_OWNER"]),
  async (c: Context) => {
    try {
      if (!c.user) {
        return c.json(
          {
            error: {
              code: "Unauthorized",
              message: "Authentication required",
            },
          },
          401
        )
      }

      const wabaId = c.req.param("wabaId")

      // Get user and check access
      const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)

      if ("error" in result) {
        return c.json(result.error, result.status as 400 | 401 | 403 | 404)
      }

      const { account } = result

      // Check if WABA is connected
      if (account.connectionStatus !== "connected") {
        return c.json(
          {
            error: {
              code: "WABA_NOT_CONNECTED",
              message: "WABA is not connected",
            },
          },
          400
        )
      }

      // Decrypt access token from WhatsApp account
      if (!account.accessToken || !account.accessTokenIV || !account.accessTokenTag) {
        return c.json(
          {
            error: {
              code: "TOKEN_NOT_FOUND",
              message: "Access token not found",
            },
          },
          400
        )
      }

      const accessToken = decryptAccountToken(account)

      // Perform health check
      const healthResult = await wabaHealthService.checkAccountHealth(
        wabaId,
        accessToken
      )

      // Update status if issues found
      if (healthResult.hasIssues) {
        await wabaHealthService.updateStatusFromPolling(wabaId, healthResult)
      } else {
        // Mark as resolved if no issues
        await wabaHealthService.markAsResolved(wabaId)
      }

      return c.json({
        success: true,
        data: {
          hasIssues: healthResult.hasIssues,
          status: healthResult.status,
          restrictionType: healthResult.restrictionType || null,
          errorMessage: healthResult.errorMessage || null,
          checkedAt: new Date().toISOString(),
        },
      })
    } catch (error) {
      console.error("Error performing health check:", error)
      return c.json(
        {
          error: {
            code: "HEALTH_CHECK_FAILED",
            message: "Failed to perform health check",
          },
        },
        500
      )
    }
  }
)

export default app
