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

const createCustomerSchema = z
  .object({
    // Identity — accept phoneNumber (E.164) OR whatsappBsuid. At least one required.
    // whatsappUsername is display-only (not a Meta recipient parameter) and cannot
    // stand alone as identity — must accompany phone or BSUID.
    phoneNumber: z.string().min(3).optional(),
    whatsappBsuid: z.string().optional(),
    whatsappUsername: z.string().optional(),

    name: z.string().optional(),
    email: z.string().email().optional(),
    consentStatus: z.boolean().default(false),
    consentSource: z.string().optional(),
    consentPurpose: z.string().optional(),
    // WhatsApp phone number this customer belongs to (required for proper filtering)
    whatsappPhoneNumberId: z.string().min(1, 'WhatsApp account is required'),
    // CRM Fields
    leadScore: z.number().optional(),
    pipelineStageId: z.string().optional(),
    tags: z.array(z.string()).optional(),
    notes: z.string().optional(),
    customFields: z
      .array(
        z.object({
          fieldDefinitionId: z.string(),
          value: z.any(),
        }),
      )
      .optional(),
  })
  .refine((data) => !!(data.phoneNumber || data.whatsappBsuid), {
    message: 'Either phoneNumber or whatsappBsuid is required',
    path: ['phoneNumber'],
  })

// POST /api/v1/customers - Create customer
app.post('/', async (c: Context) => {
  try {
    const body = await c.req.json()
    const data = createCustomerSchema.parse(body)

    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // Normalize identifiers. normalizePhoneNumber preserves BSUID format
    // (guard in utils/validation.ts) so it's safe for either input.
    const normalizedPhone = data.phoneNumber ? normalizePhoneNumber(data.phoneNumber) : null
    const bsuid = data.whatsappBsuid?.trim() || null
    const username = data.whatsappUsername?.trim() || null

    if (bsuid && !isValidBsuid(bsuid)) {
      return c.json(
        {
          error: {
            code: 'InvalidBsuid',
            message: 'Invalid BSUID format. Expected <ISO country code>.<alphanumeric> (e.g., US.13491208655302741918)',
          },
        },
        400,
      )
    }

    // Store BSUID in phoneNumber column when no real phone provided (workaround
    // consistent with rest of codebase — see docs/plans/2026-07-01-*.md Phase 2 decision).
    const storedPhoneNumber = normalizedPhone || bsuid
    if (!storedPhoneNumber) {
      return c.json(
        { error: { code: 'ValidationError', message: 'phoneNumber or whatsappBsuid is required' } },
        400,
      )
    }

    // Use effectiveUserId for agents to create customers under business owner
    // Requirements: 5.4, 6.2
    const effectiveUserId = getEffectiveUserId(c)

    // Verify the WhatsApp phone number belongs to this user
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: {
        id: data.whatsappPhoneNumberId,
        whatsappAccount: {
          userId: effectiveUserId
        }
      }
    })

    if (!phoneNumber) {
      return c.json({ error: { code: 'InvalidPhoneNumber', message: 'WhatsApp account not found or not owned by user' } }, 400)
    }

    // Check duplicate by EITHER phone OR BSUID
    const dedupOR: any[] = []
    if (normalizedPhone) dedupOR.push({ phoneNumber: normalizedPhone })
    if (bsuid) dedupOR.push({ whatsappBsuid: bsuid })
    // Also check if BSUID lives in phoneNumber column (legacy workaround)
    if (bsuid && !normalizedPhone) dedupOR.push({ phoneNumber: bsuid })

    const existing = await prisma.customer.findFirst({
      where: {
        userId: effectiveUserId,
        whatsappPhoneNumberId: data.whatsappPhoneNumberId,
        OR: dedupOR,
      }
    })

    if (existing) {
      return c.json({ error: { code: 'CustomerExists', message: 'Customer already exists for this WhatsApp account' } }, 409)
    }

    // Validate pipelineStageId if provided - scope to owner via the parent
    // pipeline to prevent referencing another tenant's stage.
    let validPipelineStageId: string | null = null
    if (data.pipelineStageId) {
      const pipelineStage = await prisma.pipelineStage.findFirst({
        where: {
          id: data.pipelineStageId,
          pipeline: { userId: effectiveUserId }
        }
      })
      if (pipelineStage) {
        validPipelineStageId = data.pipelineStageId
      }
    }

    const customer = await prisma.customer.create({
      data: {
        userId: effectiveUserId,
        // Store real phone if given, else BSUID (workaround) so phoneNumber
        // column is never NULL (schema constraint).
        phoneNumber: storedPhoneNumber,
        // Canonical BSUID column — set when caller provides one explicitly,
        // OR when phone input itself is a BSUID (mirror for consistent lookup).
        ...(bsuid && { whatsappBsuid: bsuid, bsuidMappedAt: new Date() }),
        ...(!bsuid && normalizedPhone && isValidBsuid(normalizedPhone) && {
          whatsappBsuid: normalizedPhone,
          bsuidMappedAt: new Date(),
        }),
        ...(username && { whatsappUsername: username }),
        name: data.name,
        email: data.email,
        consentStatus: data.consentStatus,
        consentSource: data.consentSource,
        consentPurpose: data.consentPurpose,
        consentCapturedAt: data.consentStatus ? new Date() : null,
        // Link to WhatsApp phone number for proper multi-number filtering
        whatsappPhoneNumberId: data.whatsappPhoneNumberId,
        // CRM Fields
        leadScore: data.leadScore || 0,
        pipelineStageId: validPipelineStageId,
        tags: data.tags || [],
        notes: data.notes,
        customFields: {
          create: data.customFields?.map(cf => ({
            fieldDefinitionId: cf.fieldDefinitionId,
            value: cf.value
          }))
        }
      }
    })

    // Create consent log if opted in
    if (data.consentStatus) {
      await prisma.consentLog.create({
        data: {
          customerId: customer.id,
          action: 'OPT_IN',
          source: data.consentSource || 'manual',
          purpose: data.consentPurpose,
          userId: c.user.id
        }
      })
    }

    await auditLog('CUSTOMER_CREATED', 'Customer', customer.id, {
      phoneNumber: normalizedPhone,
      bsuid,
      createdBy: c.user.id
    }, c.user.id)

    return c.json({ success: true, data: customer }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to create customer' } }, 500)
  }
})

export default app
