import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { LeadScoringService } from '../../services/lead-scoring.js'
import { ActivityService } from '../../services/activity-service.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

const updateCustomerSchema = z.object({
  name: z.string().optional(),
  email: z.string().email().nullable().optional(),
  consentStatus: z.boolean().optional(),
  blacklisted: z.boolean().optional(),
  // CRM Fields
  leadScore: z.number().optional(),
  pipelineStageId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  customFields: z.array(z.object({
    fieldDefinitionId: z.string(),
    value: z.any()
  })).optional(),
  // Instagram fields
  instagramIgsid: z.string().nullable().optional(),
  instagramUsername: z.string().nullable().optional()
})

// PATCH /api/v1/customers/:id - Update customer
app.patch('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const data = updateCustomerSchema.parse(body)

    const customer = await prisma.customer.findUnique({ where: { id } })
    if (!customer) {
      return c.json({ error: { code: 'NotFound', message: 'Customer not found' } }, 404)
    }

    // Use effectiveUserId for agents to update business owner's customers
    // Requirements: 5.3, 5.4, 6.2
    const effectiveUserId = getEffectiveUserId(c)

    // Check access - allow if admin or if customer belongs to effective user
    if (c.user?.role !== 'ADMIN' && effectiveUserId !== customer.userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    const { customFields, ...simpleData } = data

    // Validate pipelineStageId if provided - skip if stage doesn't exist (user may not have created pipeline yet)
    // Scope to owner via the parent pipeline to prevent moving a customer into
    // another tenant's stage (cross-tenant reference).
    if (simpleData.pipelineStageId) {
      const stageExists = await prisma.pipelineStage.findFirst({
        where: {
          id: simpleData.pipelineStageId,
          pipeline: { userId: customer.userId }
        }
      })
      if (!stageExists) {
        // Remove invalid pipelineStageId from update data instead of erroring
        delete simpleData.pipelineStageId
      }
    }

    const updated = await prisma.customer.update({
      where: { id },
      data: {
        ...simpleData,
        customFields: customFields ? {
          upsert: customFields.map(cf => ({
            where: {
              customerId_fieldDefinitionId: {
                customerId: id,
                fieldDefinitionId: cf.fieldDefinitionId
              }
            },
            create: {
              fieldDefinitionId: cf.fieldDefinitionId,
              value: cf.value
            },
            update: {
              value: cf.value
            }
          }))
        } : undefined
      },
      include: {
        pipelineStage: true,
        customFields: {
          include: { fieldDefinition: true }
        }
      }
    })

    // Log activities for significant changes
    if (c.user?.id) {
      // Log pipeline stage change
      if (data.pipelineStageId !== undefined && data.pipelineStageId !== customer.pipelineStageId) {
        const oldStage = customer.pipelineStageId
          ? await prisma.pipelineStage.findUnique({ where: { id: customer.pipelineStageId } })
          : null
        const newStage = data.pipelineStageId
          ? await prisma.pipelineStage.findUnique({ where: { id: data.pipelineStageId } })
          : null

        ActivityService.logStageChange(
          id,
          c.user.id,
          oldStage?.name || null,
          newStage?.name || 'None'
        ).catch(err => logDetailedError(err, { action: 'logStageChange', customerId: id }))
      }

      // Log field updates
      if (data.name && data.name !== customer.name) {
        ActivityService.logFieldUpdate(
          id,
          c.user.id,
          'name',
          customer.name,
          data.name
        ).catch(err => logDetailedError(err, { action: 'logFieldUpdate', customerId: id }))
      }
    }

    // Trigger lead scoring update asynchronously
    LeadScoringService.updateCustomerScore(id).catch(err =>
      logDetailedError(err, { action: 'updateCustomerScore', customerId: id })
    )

    await auditLog('CUSTOMER_UPDATED', 'Customer', id, { updates: data, updatedBy: c.user?.id }, c.user?.id)

    return c.json({ success: true, data: updated })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to update customer' } }, 500)
  }
})

export default app
