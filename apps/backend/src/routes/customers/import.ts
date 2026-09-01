import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { normalizePhoneNumber } from '../../utils/validation.js'
import { isValidBsuid } from '../../types/whatsapp-bsuid.js'

const app = new Hono()

// POST /api/v1/customers/import - Import customers from CSV
app.post('/import', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { customers } = z
      .object({
        customers: z.array(
          z
            .object({
              // Identity: phone OR BSUID (at least one required per row).
              // whatsappUsername is display-only; cannot stand alone as identity.
              phoneNumber: z.string().optional(),
              whatsappBsuid: z.string().optional(),
              whatsappUsername: z.string().optional(),
              name: z.string().optional(),
              email: z.string().email().optional(),
              consentStatus: z.boolean().default(false),
              consentSource: z.string().optional(),
            })
            .refine((row) => !!(row.phoneNumber || row.whatsappBsuid), {
              message: 'Each row requires phoneNumber or whatsappBsuid',
              path: ['phoneNumber'],
            }),
        ),
      })
      .parse(body)

    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // Use effectiveUserId for agents to import customers under business owner
    const effectiveUserId = getEffectiveUserId(c)

    const results = {
      success: 0,
      failed: 0,
      errors: [] as any[]
    }

    for (const customerData of customers) {
      const rowIdentifier = customerData.phoneNumber || customerData.whatsappBsuid || '(empty)'
      try {
        // Normalize identifiers. normalizePhoneNumber preserves BSUID format.
        const normalizedPhone = customerData.phoneNumber
          ? normalizePhoneNumber(customerData.phoneNumber)
          : null
        const bsuid = customerData.whatsappBsuid?.trim() || null
        const username = customerData.whatsappUsername?.trim() || null

        if (bsuid && !isValidBsuid(bsuid)) {
          results.failed++
          results.errors.push({
            phoneNumber: rowIdentifier,
            error: 'Invalid BSUID format',
          })
          continue
        }

        const storedPhoneNumber = normalizedPhone || bsuid
        if (!storedPhoneNumber) {
          results.failed++
          results.errors.push({
            phoneNumber: rowIdentifier,
            error: 'phoneNumber or whatsappBsuid required',
          })
          continue
        }

        // Dedup by phone OR BSUID (manual import ⇒ whatsappPhoneNumberId is null)
        const dedupOR: any[] = []
        if (normalizedPhone) dedupOR.push({ phoneNumber: normalizedPhone })
        if (bsuid) {
          dedupOR.push({ whatsappBsuid: bsuid })
          if (!normalizedPhone) dedupOR.push({ phoneNumber: bsuid })
        }

        const existing = await prisma.customer.findFirst({
          where: {
            userId: effectiveUserId,
            whatsappPhoneNumberId: null,
            OR: dedupOR,
          }
        })

        if (existing) {
          results.failed++
          results.errors.push({
            phoneNumber: rowIdentifier,
            error: 'Customer already exists'
          })
          continue
        }

        // Create customer
        const customer = await prisma.customer.create({
          data: {
            userId: effectiveUserId,
            phoneNumber: storedPhoneNumber,
            ...(bsuid && { whatsappBsuid: bsuid, bsuidMappedAt: new Date() }),
            ...(!bsuid && normalizedPhone && isValidBsuid(normalizedPhone) && {
              whatsappBsuid: normalizedPhone,
              bsuidMappedAt: new Date(),
            }),
            ...(username && { whatsappUsername: username }),
            name: customerData.name,
            email: customerData.email,
            consentStatus: customerData.consentStatus,
            consentSource: customerData.consentSource || 'CSV Import',
            consentCapturedAt: customerData.consentStatus ? new Date() : null
          }
        })

        // Create consent log if opted in
        if (customerData.consentStatus) {
          await prisma.consentLog.create({
            data: {
              customerId: customer.id,
              action: 'OPT_IN',
              source: customerData.consentSource || 'CSV Import',
              userId: c.user.id
            }
          })
        }

        results.success++
      } catch (err) {
        results.failed++
        results.errors.push({
          phoneNumber: rowIdentifier,
          error: err instanceof Error ? err.message : 'Unknown error'
        })
      }
    }

    await auditLog('CUSTOMERS_IMPORTED', 'Customer', effectiveUserId, {
      total: customers.length,
      success: results.success,
      failed: results.failed,
      importedBy: c.user.id
    }, c.user.id)

    return c.json({
      success: true,
      data: results,
      message: `Imported ${results.success} customers, ${results.failed} failed`
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to import customers' } }, 500)
  }
})

export default app
