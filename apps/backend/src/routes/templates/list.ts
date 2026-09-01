import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { templateCacheService } from '../../services/template-cache-service.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// Apply context resolution middleware
// This ensures agents can list their business owner's templates
// Requirements: 6.1
app.use('*', resolveContext)

// GET /api/v1/templates - List templates from database
// Templates are synced from Meta via POST /api/v1/templates/sync
// Only returns templates from connected WhatsApp accounts
app.get('/', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Filter by status if provided
    const status = c.req.query('status') || undefined
    const category = c.req.query('category') || undefined
    const includeDisconnected = c.req.query('includeDisconnected') === 'true'
    const filters = { status, category }

    // Skip cache for now to debug - always fetch fresh data
    // TODO: Re-enable cache after debugging
    // const cached = await templateCacheService.getTemplateList(userId, filters)
    // if (cached) {
    //   return c.json({
    //     success: true,
    //     data: cached
    //   })
    // }

    // Get connected WhatsApp accounts for this user
    const connectedAccounts = await prisma.whatsAppAccount.findMany({
      where: {
        userId,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })
    const connectedAccountIds = connectedAccounts.map(a => a.id)

    const where: any = { userId }

    // Filter by WhatsApp account (multi-number support).
    // Callers may pass EITHER:
    //   - whatsappAccountId: the WhatsAppAccount.id (CUID) directly, OR
    //   - whatsappPhoneNumberId: the PhoneNumber.id (CUID) of the conversation,
    //     which we resolve to its parent WhatsAppAccount.
    // Using the phone-number form is required by oneinbox, where a conversation
    // is identified by its phone number rather than the WABA account id.
    const whatsappAccountIdQuery = c.req.query('whatsappAccountId') || undefined
    const whatsappPhoneNumberIdQuery = c.req.query('whatsappPhoneNumberId') || undefined

    let resolvedAccountId: string | undefined = whatsappAccountIdQuery

    if (!resolvedAccountId && whatsappPhoneNumberIdQuery) {
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: { id: whatsappPhoneNumberIdQuery, userId },
        select: { whatsappAccountId: true },
      })

      if (!phoneNumber?.whatsappAccountId) {
        // Phone number not found or not owned by this user - return empty
        // (don't 404; caller likely is the inbox transitioning between accounts)
        return c.json({
          success: true,
          data: [],
        })
      }

      resolvedAccountId = phoneNumber.whatsappAccountId
    }

    if (resolvedAccountId) {
      where.whatsappAccountId = resolvedAccountId
    } else if (!includeDisconnected && connectedAccountIds.length > 0) {
      // Only show templates from connected WhatsApp accounts
      // Unless explicitly requesting all templates (includeDisconnected=true)
      where.whatsappAccountId = { in: connectedAccountIds }
    } else if (!includeDisconnected && connectedAccountIds.length === 0) {
      // No connected accounts - return empty list
      console.log(`📋 No connected WhatsApp accounts for userId: ${userId}`)
      return c.json({
        success: true,
        data: []
      })
    }

    if (status) {
      where.status = status
    }

    if (category) {
      where.category = category
    }

    console.log(`📋 Listing templates for userId: ${userId}, connectedAccounts: ${connectedAccountIds.length}, where:`, where)
    
    const templates = await prisma.messageTemplate.findMany({
      where,
      orderBy: {
        createdAt: 'desc'
      }
    })

    console.log(`📋 Found ${templates.length} templates:`, templates.map(t => `${t.templateName} (userId: ${t.userId})`))

    // Add hasVariables field to each template for frontend convenience
    const templatesWithVariableInfo = templates.map(t => ({
      ...t,
      hasVariables: !!(t.content?.match(/\{\{(\d+)\}\}/g)?.length)
    }))

    // Cache the result
    await templateCacheService.setTemplateList(userId, templatesWithVariableInfo, filters)

    return c.json({
      success: true,
      data: templatesWithVariableInfo
    })
  } catch (error) {
    console.error('List templates error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch templates'
      }
    }, 500)
  }
})

export default app
