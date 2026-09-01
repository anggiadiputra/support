import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { templateCacheService } from '../../services/template-cache-service.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { validateTemplateContent } from '../../services/template-validation-rules.js'

const app = new Hono()

const updateTemplateSchema = z.object({
  content: z.string().min(1).optional(),
  headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).nullable().optional(),
  headerContent: z.string().nullable().optional(),
  headerMediaId: z.string().nullable().optional(),
  footerContent: z.string().max(60).nullable().optional(),
  buttons: z.array(z.any()).optional()
})

// PATCH /api/v1/templates/:id - Update template
app.patch('/:id', async (c: Context) => {
  try {
    const id = c.req.param('id')
    const body = await c.req.json()
    const data = updateTemplateSchema.parse(body)

    const template = await prisma.messageTemplate.findUnique({
      where: { id }
    })

    if (!template) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Template not found'
        }
      }, 404)
    }

    // Check access
    if (c.user?.role !== 'ADMIN' && c.user?.id !== template.userId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied'
        }
      }, 403)
    }

    // Can only update templates that are not approved
    if (template.status === 'APPROVED') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Cannot update approved templates. Create a new version instead.'
        }
      }, 400)
    }

    const normalizedHeaderContent = (data.headerContent || data.headerMediaId || '')?.trim()
    const updateData: any = { ...data, headerContent: undefined }
    delete updateData.headerMediaId

    // Normalize header clearing: if headerType is null/undefined, also clear headerContent
    if (data.headerType === null || data.headerType === undefined) {
      updateData.headerType = null
      if (data.headerContent === undefined) {
        updateData.headerContent = null
      }
    }

    if (data.headerType && !normalizedHeaderContent) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Header content is required when header type is set'
        }
      }, 400)
    }

    if (data.headerType) {
      updateData.headerContent = normalizedHeaderContent
    }

    // Validate against Meta's template rules if content is being updated
    if (data.content) {
      const validationResult = validateTemplateContent({
        content: data.content,
        footerContent: data.footerContent ?? template.footerContent,
        headerContent: normalizedHeaderContent || template.headerContent,
        headerType: data.headerType ?? template.headerType
      })

      if (!validationResult.valid) {
        const firstIssue = validationResult.issues[0]
        return c.json({
          error: {
            code: 'ValidationError',
            message: firstIssue.message,
            details: {
              rule: firstIssue.rule,
              messageId: firstIssue.messageId,
              allIssues: validationResult.issues
            }
          }
        }, 400)
      }
    }

    const updatedTemplate = await prisma.messageTemplate.update({
      where: { id },
      data: updateData
    })

    // Audit log
    await auditLog(
      'TEMPLATE_UPDATED',
      'MessageTemplate',
      id,
      {
        updates: data,
        updatedBy: c.user?.id
      },
      c.user?.id
    )

    // Invalidate template list cache
    await templateCacheService.invalidateTemplateList(template.userId)

    return c.json({
      success: true,
      data: updatedTemplate
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update template'
      }
    }, 500)
  }
})

export default app
