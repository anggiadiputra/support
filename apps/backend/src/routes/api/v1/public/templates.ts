import { Hono } from "hono"
import type { Context } from "hono"
import { prisma } from "../../../../utils/database.js"
import { getApiKeyUserId } from "../../../../middleware/apiKeyAuth.js"
import { logger } from "../../../../utils/logger.js"

const app = new Hono()

/**
 * GET /api/v1/public/templates
 * List WhatsApp message templates for the authenticated user
 *
 * Query parameters:
 * - status: Filter by template status (APPROVED, PENDING, REJECTED)
 * - category: Filter by template category (MARKETING, UTILITY, AUTHENTICATION)
 * - whatsapp_phone_number_id: Filter templates by WhatsApp phone number (returns templates for that number's WABA)
 * - limit: Maximum number of templates to return (default: 100, max: 500)
 * - offset: Number of templates to skip for pagination (default: 0)
 *
 * Requirements: List templates via Public API for n8n/external integrations
 */
app.get("/", async (c: Context) => {
  try {
    const userId = getApiKeyUserId(c)

    // Parse query parameters
    const status = c.req.query("status") || undefined
    const category = c.req.query("category") || undefined
    const whatsappPhoneNumberId = c.req.query("whatsapp_phone_number_id") || undefined
    const limitParam = c.req.query("limit")
    const offsetParam = c.req.query("offset")

    // Validate and parse limit/offset
    const limit = Math.min(
      Math.max(parseInt(limitParam || "100", 10) || 100, 1),
      500
    )
    const offset = Math.max(parseInt(offsetParam || "0", 10) || 0, 0)

    // Validate status if provided
    const validStatuses = [
      "APPROVED",
      "PENDING",
      "REJECTED",
      "PAUSED",
      "DISABLED",
    ]
    if (status && !validStatuses.includes(status.toUpperCase())) {
      return c.json(
        {
          error: {
            code: "ValidationError",
            message: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
          },
        },
        400
      )
    }

    // Validate category if provided
    const validCategories = ["MARKETING", "UTILITY", "AUTHENTICATION"]
    if (category && !validCategories.includes(category.toUpperCase())) {
      return c.json(
        {
          error: {
            code: "ValidationError",
            message: `Invalid category. Allowed values: ${validCategories.join(", ")}`,
          },
        },
        400
      )
    }

    // Resolve whatsapp_phone_number_id to whatsappAccountId
    let whatsappAccountId: string | undefined
    if (whatsappPhoneNumberId) {
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: {
          id: whatsappPhoneNumberId,
          whatsappAccount: {
            userId,
            connectionStatus: "connected",
          },
        },
        select: { whatsappAccountId: true },
      })

      if (!phoneNumber || !phoneNumber.whatsappAccountId) {
        return c.json(
          {
            error: {
              code: "NotFound",
              message: "WhatsApp phone number not found or not connected",
            },
          },
          404
        )
      }

      whatsappAccountId = phoneNumber.whatsappAccountId
    }

    // Build query
    const where: Record<string, unknown> = { userId }

    if (whatsappAccountId) {
      where.whatsappAccountId = whatsappAccountId
    }

    if (status) {
      where.status = status.toUpperCase()
    }

    if (category) {
      where.category = category.toUpperCase()
    }

    // Get total count for pagination
    const total = await prisma.messageTemplate.count({ where })

    // Fetch templates
    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: {
        createdAt: "desc",
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        templateName: true,
        language: true,
        status: true,
        category: true,
        content: true,
        headerType: true,
        headerContent: true,
        footerContent: true,
        buttons: true,
        variables: true,
        createdAt: true,
        updatedAt: true,
      },
    })

    // Transform response for external API consumers
    const data = templates.map((t) => ({
      id: t.id,
      template_name: t.templateName,
      language: t.language,
      status: t.status,
      category: t.category,
      content: t.content,
      header_type: t.headerType,
      header_content: t.headerContent,
      footer_content: t.footerContent,
      buttons: t.buttons,
      variables: t.variables,
      has_variables: !!(t.content?.match(/\{\{(\d+)\}\}/g)?.length),
      created_at: t.createdAt.toISOString(),
      updated_at: t.updatedAt.toISOString(),
    }))

    return c.json({
      success: true,
      data,
      pagination: {
        total,
        limit,
        offset,
        has_more: offset + templates.length < total,
      },
    })
  } catch (error) {
    logger.error("Public API list templates error:", error)

    return c.json(
      {
        error: {
          code: "InternalError",
          message: "Failed to fetch templates",
        },
      },
      500
    )
  }
})

/**
 * GET /api/v1/public/templates/:templateId
 * Get a specific template by ID
 */
app.get("/:templateId", async (c: Context) => {
  try {
    const userId = getApiKeyUserId(c)
    const templateId = c.req.param("templateId")

    if (!templateId) {
      return c.json(
        {
          error: {
            code: "ValidationError",
            message: "Template ID is required",
          },
        },
        400
      )
    }

    const template = await prisma.messageTemplate.findUnique({
      where: { id: templateId },
      select: {
        id: true,
        templateName: true,
        language: true,
        status: true,
        category: true,
        content: true,
        headerType: true,
        headerContent: true,
        footerContent: true,
        buttons: true,
        variables: true,
        createdAt: true,
        updatedAt: true,
        userId: true,
      },
    })

    if (!template) {
      return c.json(
        {
          error: {
            code: "NotFound",
            message: "Template not found",
          },
        },
        404
      )
    }

    // Verify ownership
    if (template.userId !== userId) {
      return c.json(
        {
          error: {
            code: "NotFound",
            message: "Template not found",
          },
        },
        404
      )
    }

    return c.json({
      success: true,
      data: {
        id: template.id,
        template_name: template.templateName,
        language: template.language,
        status: template.status,
        category: template.category,
        content: template.content,
        header_type: template.headerType,
        header_content: template.headerContent,
        footer_content: template.footerContent,
        buttons: template.buttons,
        variables: template.variables,
        has_variables: !!(template.content?.match(/\{\{(\d+)\}\}/g)?.length),
        created_at: template.createdAt.toISOString(),
        updated_at: template.updatedAt.toISOString(),
      },
    })
  } catch (error) {
    logger.error("Public API get template error:", error)

    return c.json(
      {
        error: {
          code: "InternalError",
          message: "Failed to fetch template",
        },
      },
      500
    )
  }
})

export default app
