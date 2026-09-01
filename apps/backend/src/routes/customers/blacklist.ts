import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

// PATCH /api/v1/customers/:id/blacklist - Toggle blacklist status
app.patch('/:id/blacklist', async (c: Context) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const { blacklisted } = z.object({ blacklisted: z.boolean() }).parse(body)

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

    const updated = await prisma.customer.update({
      where: { id },
      data: { blacklisted }
    })

    await auditLog('CUSTOMER_BLACKLIST_UPDATED', 'Customer', id, {
      blacklisted,
      updatedBy: c.user?.id
    }, c.user?.id)

    return c.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to update blacklist' } }, 500)
  }
})

export default app
