/**
 * Broadcast Eligible Customers Route
 * 
 * GET /api/v1/customers/broadcast-eligible
 * Returns customers eligible for broadcast (consented and not blacklisted)
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

/**
 * GET /api/v1/customers/broadcast-eligible
 * List customers eligible for broadcast
 * 
 * Query params:
 * - search: string (optional) - Search by name or phone number
 * - tags: string (optional) - Comma-separated tags to filter by
 * - pipelineStageId: string (optional) - Filter by pipeline stage
 * - page: number (optional, default: 1) - Page number
 * - limit: number (optional, default: 50) - Items per page
 * 
 * Returns: Paginated list of eligible customers
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */
app.get('/broadcast-eligible', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = getEffectiveUserId(c)

    // Parse query params
    const search = c.req.query('search')
    const tagsParam = c.req.query('tags')
    const pipelineStageId = c.req.query('pipelineStageId')
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId')
    // templateCategory: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE'
    // Only MARKETING triggers the marketingOptOut filter (per Meta policy:
    // user_preferences/131050 only suppress marketing category messages).
    const templateCategory = (c.req.query('templateCategory') || '').toUpperCase()
    const page = Math.max(1, parseInt(c.req.query('page') || '1', 10) || 1)
    const limit = Math.min(Math.max(1, parseInt(c.req.query('limit') || '50', 10) || 50), 100)

    // Build where clause - consented + not blacklisted always.
    // marketingOptOut filter applied only when sending MARKETING templates.
    const where: any = {
      userId,
      consentStatus: true,
      blacklisted: false
    }
    if (templateCategory === 'MARKETING') {
      where.marketingOptOut = false
    }

    // Filter by WhatsApp phone number (multi-number support)
    if (whatsappPhoneNumberId) {
      where.whatsappPhoneNumberId = whatsappPhoneNumberId
    }

    // Search filter
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phoneNumber: { contains: search, mode: 'insensitive' } }
      ]
    }

    // Tags filter
    if (tagsParam) {
      const tags = tagsParam.split(',').map(t => t.trim()).filter(Boolean)
      if (tags.length > 0) {
        where.tags = { hasSome: tags }
      }
    }

    // Pipeline stage filter
    if (pipelineStageId) {
      where.pipelineStageId = pipelineStageId
    }

    // Get customers with pagination + count of marketing-opted-out customers
    // that would otherwise be eligible (for transparency in the UI when sending
    // a MARKETING template).
    const [customers, total, marketingOptedOutCount] = await Promise.all([
      prisma.customer.findMany({
        where,
        select: {
          id: true,
          phoneNumber: true,
          name: true,
          tags: true,
          marketingOptOut: true,
          // BSUID / username identifiers — surfaced so UI can label BSUID-only
          // customers and so downstream broadcast routing has full context.
          whatsappBsuid: true,
          whatsappUsername: true,
          whatsappParentBsuid: true,
          pipelineStage: {
            select: {
              id: true,
              name: true,
              color: true
            }
          }
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.customer.count({ where }),
      // Count customers who match other filters but are marketing-opted-out
      prisma.customer.count({
        where: {
          userId,
          consentStatus: true,
          blacklisted: false,
          marketingOptOut: true,
          ...(whatsappPhoneNumberId ? { whatsappPhoneNumberId } : {}),
          ...(pipelineStageId ? { pipelineStageId } : {}),
        }
      })
    ])

    return c.json({
      success: true,
      data: customers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      // Transparency: how many customers are opted out of marketing.
      // For UTILITY/AUTH templates this is informational only (they're still
      // in `data`). For MARKETING templates these have been filtered out.
      marketingOptedOutCount
    })
  } catch (error) {
    console.error('Get broadcast eligible customers error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch eligible customers' } }, 500)
  }
})

export default app
