import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

const consentLogSchema = z.object({
  action: z.enum(['OPT_IN', 'OPT_OUT', 'UPDATE']),
  source: z.string(),
  purpose: z.string().optional(),
  ipAddress: z.string().optional()
})

// POST /api/v1/customers/:id/consent - Log consent action
// Note: Agents cannot modify consent status (Requirement 5.5)
app.post('/:id/consent', async (c: Context) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const data = consentLogSchema.parse(body)

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) {
      return c.json({ error: { code: 'NotFound', message: 'Customer not found' } }, 404)
    }

    // Use effectiveUserId for access check
    const effectiveUserId = getEffectiveUserId(c)

    // Check access - allow if admin or if customer belongs to effective user
    if (c.user?.role !== 'ADMIN' && effectiveUserId !== customer.userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Agents cannot modify consent status (Requirement 5.5)
    if (c.user?.role === 'AGENT') {
      return c.json({ error: { code: 'Forbidden', message: 'Agents cannot modify customer consent status' } }, 403)
    }

    // Update customer consent status
    const consentStatus = data.action === 'OPT_IN'
    await prisma.customer.update({
      where: { id },
      data: {
        consentStatus,
        consentCapturedAt: new Date(),
        consentSource: data.source,
        consentPurpose: data.purpose
      }
    })

    // Create consent log
    const consentLog = await prisma.consentLog.create({
      data: {
        customerId: id,
        action: data.action,
        source: data.source,
        purpose: data.purpose,
        ipAddress: data.ipAddress,
        userId: c.user?.id
      }
    })

    await auditLog('CONSENT_UPDATED', 'Customer', id, { action: data.action, updatedBy: c.user?.id }, c.user?.id)

    return c.json({ success: true, data: consentLog })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to update consent' } }, 500)
  }
})

export default app
