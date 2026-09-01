import { Hono } from "hono"
import type { Context } from "hono"
import { AdminUserSupportService } from "../../services/admin/user-support-service.js"

const app = new Hono()

/**
 * GET /api/v1/admin/users/:id/waba
 * Get user's WABA connections and channel info
 */
app.get("/:id/waba", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const result = await AdminUserSupportService.getUserWABAInfo(userId)

    if (!result) {
      return c.json({
        error: {
          code: "NotFound",
          message: "User not found"
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error("Admin get user WABA info error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to fetch user WABA info"
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/users/:id/templates
 * Get user's templates (name, status, category only - no content for privacy)
 */
app.get("/:id/templates", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const result = await AdminUserSupportService.getUserTemplates(userId)

    if (!result) {
      return c.json({
        error: {
          code: "NotFound",
          message: "User not found"
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error("Admin get user templates error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to fetch user templates"
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/users/:id/message-stats
 * Get user's message statistics (counts only - no content for privacy)
 */
app.get("/:id/message-stats", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const daysParam = c.req.query("days")
    const days = daysParam ? Math.min(90, Math.max(7, parseInt(daysParam, 10) || 30)) : 30

    const result = await AdminUserSupportService.getUserMessageStats(userId, days)

    if (!result) {
      return c.json({
        error: {
          code: "NotFound",
          message: "User not found"
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error("Admin get user message stats error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to fetch user message stats"
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/users/:id/reset-api-keys
 * Revoke all API keys for a user
 */
app.post("/:id/reset-api-keys", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const adminUserId = c.get("userId") as string || c.user?.id

    const result = await AdminUserSupportService.resetUserApiKeys(userId, adminUserId)

    if (!result.success) {
      return c.json({
        error: {
          code: "NotFound",
          message: result.error
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: {
        message: "API keys have been revoked",
        revokedCount: result.revokedCount
      }
    })
  } catch (error) {
    console.error("Admin reset API keys error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to reset API keys"
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/users/:id/sync-templates
 * Force sync templates from Meta for a user
 */
app.post("/:id/sync-templates", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const adminUserId = c.get("userId") as string || c.user?.id

    const result = await AdminUserSupportService.forceSyncTemplates(userId, adminUserId)

    if (!result.success) {
      return c.json({
        error: {
          code: result.error === "User not found" ? "NotFound" : "BadRequest",
          message: result.error
        }
      }, result.error === "User not found" ? 404 : 400)
    }

    return c.json({
      success: true,
      data: {
        message: "Templates sync initiated",
        syncedCount: result.syncedCount
      }
    })
  } catch (error) {
    console.error("Admin sync templates error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to sync templates"
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/users/:id/clear-cache
 * Clear all cached data for a user
 */
app.post("/:id/clear-cache", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const adminUserId = c.get("userId") as string || c.user?.id

    const result = await AdminUserSupportService.clearUserCache(userId, adminUserId)

    if (!result.success) {
      return c.json({
        error: {
          code: "NotFound",
          message: result.error
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: {
        message: "User cache has been cleared",
        clearedKeys: result.clearedKeys
      }
    })
  } catch (error) {
    console.error("Admin clear cache error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to clear user cache"
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/users/:id/waba-health/check
 * Manually trigger WABA health check for a user
 */
app.post("/:id/waba-health/check", async (c: Context) => {
  try {
    const userId = c.req.param("id")
    const adminUserId = c.get("userId") as string || c.user?.id

    const result = await AdminUserSupportService.checkUserWABAHealth(userId, adminUserId)

    if (!result.success) {
      const statusCode = result.error === "User not found" ? 404 : 400
      return c.json({
        error: {
          code: result.error === "User not found" ? "NotFound" : "BadRequest",
          message: result.error
        }
      }, statusCode)
    }

    return c.json({
      success: true,
      data: {
        message: "WABA health check completed",
        accountHealth: result.accountHealth
      }
    })
  } catch (error) {
    console.error("Admin check WABA health error:", error)
    return c.json({
      error: {
        code: "InternalServerError",
        message: "Failed to check WABA health"
      }
    }, 500)
  }
})

export default app
