/**
 * Template Operations Routes
 * 
 * API endpoints for template operations with variables:
 * - POST /render-preview - Render template preview with variables
 * - POST /send - Send template with variables
 * - POST /validate - Validate variable values
 * 
 * Base Path: /api/v1/templates
 * 
 * Requirements: 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { assertCanSend, type TemplateCategory } from '../../services/compliance/assert-can-send.js'
import { WhatsAppAPI } from '../../utils/whatsapp.js'
import { auditLog } from '../../utils/auditLog.js'
import { templateRendererService, isIndexBasedVariableValues, type WhatsAppTemplate, type WhatsAppTemplateComponent } from '../../services/template-renderer-service.js'
import { templateValidatorService } from '../../services/template-validator-service.js'
import { templateVariableService } from '../../services/template-variable-service.js'
import { LeadScoringService } from '../../services/lead-scoring.js'
import { ActivityService } from '../../services/activity-service.js'
import { webhookService } from '../../services/webhook-service.js'
import { getEffectiveUserId, getActingAgentId } from '../../middleware/resolveContext.js'
import { resolveContext } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { resolveCredentialsForSending } from '../../utils/whatsapp-account-helper.js'

const app = new Hono()

// Apply context resolution middleware to all routes
// This ensures agents can access their business owner's templates
app.use('*', resolveContext)

/**
 * Validation schemas
 */
const renderPreviewSchema = z.object({
  templateName: z.string().min(1, 'Template name is required'),
  languageCode: z.string().min(1, 'Language code is required'),
  variableValues: z.record(z.string(), z.string()).default({}),
  // Optional: template structure if not fetching from DB
  template: z.object({
    id: z.string(),
    name: z.string(),
    language: z.string(),
    status: z.enum(['APPROVED', 'PENDING', 'REJECTED']),
    category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
    components: z.array(z.any())
  }).optional()
})

const sendTemplateSchema = z.object({
  customerId: z.string().min(1, 'Customer ID is required'),
  templateName: z.string().min(1, 'Template name is required'),
  languageCode: z.string().min(1, 'Language code is required'),
  variableValues: z.record(z.string(), z.string()).default({})
})

const validateVariablesSchema = z.object({
  variableValues: z.record(z.string(), z.string()),
  variableIds: z.array(z.string()).min(1, 'At least one variable ID is required')
})

/**
 * Helper function to convert DB template to WhatsAppTemplate format
 * The DB stores template data in separate fields, we need to reconstruct components
 */
function dbTemplateToWhatsAppTemplate(dbTemplate: {
  id: string;
  templateName: string;
  language: string;
  status: string;
  category: string;
  content: string;
  headerType?: string | null;
  headerContent?: string | null;
  footerContent?: string | null;
  buttons?: any;
  variables?: any;
}): WhatsAppTemplate {
  const components: WhatsAppTemplateComponent[] = []

  // Add header component if present
  if (dbTemplate.headerType && dbTemplate.headerContent) {
    components.push({
      type: 'HEADER',
      format: dbTemplate.headerType.toUpperCase() as 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT',
      text: dbTemplate.headerType.toUpperCase() === 'TEXT' ? dbTemplate.headerContent : undefined
    })
  }

  // Add body component (always present)
  components.push({
    type: 'BODY',
    text: dbTemplate.content
  })

  // Add footer component if present
  if (dbTemplate.footerContent) {
    components.push({
      type: 'FOOTER',
      text: dbTemplate.footerContent
    })
  }

  // Add buttons component if present
  if (dbTemplate.buttons && Array.isArray(dbTemplate.buttons) && dbTemplate.buttons.length > 0) {
    components.push({
      type: 'BUTTONS',
      buttons: dbTemplate.buttons
    })
  }

  return {
    id: dbTemplate.id,
    name: dbTemplate.templateName,
    language: dbTemplate.language,
    status: dbTemplate.status as 'APPROVED' | 'PENDING' | 'REJECTED',
    category: dbTemplate.category as 'MARKETING' | 'UTILITY' | 'AUTHENTICATION',
    components
  }
}

/**
 * POST /api/v1/templates/render-preview
 * Render template preview with variable values
 * 
 * Body:
 * - templateName: string (required) - WhatsApp template name
 * - languageCode: string (required) - Template language code
 * - variableValues: Record<string, string> - Map of variableId to value
 * - template: WhatsAppTemplate (optional) - Template structure if not fetching from DB
 * 
 * Returns: RenderedTemplate with header, body, footer, buttons
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
app.post('/render-preview', async (c: Context) => {
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

    // Parse and validate request body
    const body = await c.req.json()
    const validation = renderPreviewSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { templateName, languageCode, variableValues, template: providedTemplate } = validation.data

    // Get template structure
    let template: WhatsAppTemplate
    
    if (providedTemplate) {
      // Use provided template structure
      template = providedTemplate as WhatsAppTemplate
    } else {
      // Fetch template from database
      const dbTemplate = await prisma.messageTemplate.findFirst({
        where: {
          userId,
          templateName,
          language: languageCode
        }
      })

      if (!dbTemplate) {
        return c.json({
          error: {
            code: 'NotFound',
            message: 'Template not found'
          }
        }, 404)
      }

      // Convert DB template to WhatsAppTemplate format
      template = dbTemplateToWhatsAppTemplate(dbTemplate)
    }

    // Get variable mappings for this template
    const mappings = await templateVariableService.getMappings(userId, templateName)

    // Render template with variable values
    const rendered = templateRendererService.renderTemplate(
      template,
      variableValues,
      mappings
    )

    return c.json({
      success: true,
      data: rendered
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to render template preview'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/templates/send
 * Send template message with variables to a customer
 * 
 * Body:
 * - customerId: string (required) - Customer ID to send to
 * - templateName: string (required) - WhatsApp template name
 * - languageCode: string (required) - Template language code
 * - variableValues: Record<string, string> - Map of variableId to value
 * 
 * Returns: Message record and WhatsApp API result
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */
app.post('/send', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const actingAgentId = getActingAgentId(c)
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validation = sendTemplateSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { customerId, templateName, languageCode, variableValues } = validation.data

    // Resolve WhatsApp account credentials for sending
    const credentials = await resolveCredentialsForSending(userId)

    if (!credentials) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'WhatsApp Business Account not connected or configuration incomplete'
        }
      }, 400)
    }

    // Get customer
    const customer = await prisma.customer.findUnique({
      where: { id: customerId }
    })

    if (!customer) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Customer not found'
        }
      }, 404)
    }

    // Verify customer belongs to user
    if (customer.userId !== userId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied to this customer'
        }
      }, 403)
    }

    // Get template from database
    const dbTemplate = await prisma.messageTemplate.findFirst({
      where: {
        userId,
        templateName,
        language: languageCode
      }
    })

    if (!dbTemplate) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Template not found'
        }
      }, 404)
    }

    // Check template is approved
    if (dbTemplate.status !== 'APPROVED') {
      return c.json({
        error: {
          code: 'TemplateNotApproved',
          message: `Template is not approved. Current status: ${dbTemplate.status}`
        }
      }, 400)
    }

    // Centralized compliance check (blacklist, consent, marketing opt-out)
    const complianceCheck = await assertCanSend(customer.id, {
      kind: 'template',
      category: ((dbTemplate.category as string)?.toUpperCase() as TemplateCategory) || 'UTILITY',
    })
    if (!complianceCheck.ok) {
      return c.json(
        {
          error: {
            code: complianceCheck.code,
            message: complianceCheck.message,
            ...(complianceCheck.meta || {}),
          },
        },
        complianceCheck.httpStatus,
      )
    }

    // Convert DB template to WhatsAppTemplate format
    const template = dbTemplateToWhatsAppTemplate(dbTemplate)

    // Get variable mappings
    const mappings = await templateVariableService.getMappings(userId, templateName)

    // Check if using index-based variableValues (e.g., {"1": "value1", "2": "value2"})
    // This allows users to send templates without setting up variable library
    const usingIndexBasedValues = isIndexBasedVariableValues(variableValues)

    // Only validate against variable library if NOT using index-based values
    if (!usingIndexBasedValues && Object.keys(variableValues).length > 0) {
      // Get variables for validation
      const variableIds = Object.keys(variableValues)
      const variables = await prisma.templateVariable.findMany({
        where: {
          id: { in: variableIds },
          userId
        }
      })

      // Validate all variable values (Requirement 4.1)
      const validationResult = templateValidatorService.validateAllVariables(
        variableValues,
        variables
      )

      if (!validationResult.valid) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Variable validation failed',
            details: validationResult.errors
          }
        }, 400)
      }
    }

    // Build WhatsApp API payload (Requirement 4.2, 4.3)
    const payload = templateRendererService.buildTemplatePayload(
      templateName,
      languageCode,
      template,
      variableValues,
      mappings
    )

    // Send via WhatsApp API with per-account token
    const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken })
    const result = await whatsapp.sendMessage({
      phoneNumberId: credentials.phoneNumberId,
      to: customer.phoneNumber,
      type: 'template',
      template: payload
    })

    // Render template for storage
    const rendered = templateRendererService.renderTemplate(
      template,
      variableValues,
      mappings
    )

    // Build content string for message record
    let content = rendered.body
    if (rendered.header?.type === 'text') {
      content = `${rendered.header.content}\n\n${content}`
    }
    if (rendered.footer) {
      content = `${content}\n\n${rendered.footer}`
    }

    // Save message to database (Requirement 4.4)
    const message = await prisma.message.create({
      data: {
        userId,
        customerId: customer.id,
        messageType: 'TEMPLATE',
        direction: 'OUTBOUND',
        content,
        wamId: result.messages?.[0]?.id,
        status: 'SENT',
        templateId: dbTemplate.id
      }
    })

    // Only save variable history and increment usage for variable library (not index-based)
    if (!usingIndexBasedValues && Object.keys(variableValues).length > 0) {
      // Save variable history for suggestions
      const historyEntries = Object.entries(variableValues).map(([variableId, value]) => ({
        templateName,
        variableId,
        value,
        customerId: customer.id
      }))

      await templateVariableService.saveVariableHistoryBatch(userId, historyEntries)

      // Increment usage count for variables
      const variableIds = Object.keys(variableValues)
      for (const variableId of variableIds) {
        await templateVariableService.incrementUsageCount(variableId).catch(err =>
          logDetailedError(err, { path: c.req.path, method: c.req.method })
        )
      }
    }

    // Audit log
    await auditLog(
      'TEMPLATE_MESSAGE_SENT',
      'Message',
      message.id,
      {
        to: customer.phoneNumber,
        templateName,
        languageCode,
        sentBy: c.user?.id,
        actingAgentId
      },
      c.user?.id
    )

    // Update lead scoring
    LeadScoringService.updateCustomerScore(customer.id).catch(err =>
      logDetailedError(err, { path: c.req.path, method: c.req.method })
    )

    // Log activity
    if (c.user?.id) {
      ActivityService.logMessageActivity(
        customer.id,
        c.user.id,
        'sent',
        message.id,
        content?.substring(0, 100)
      ).catch(err => logDetailedError(err, { path: c.req.path, method: c.req.method }))
    }

    // Emit webhook event
    webhookService.emitEvent(
      userId,
      'message.sent',
      'whatsapp',
      credentials.phoneNumberRecordId,
      {
        message_id: message.id,
        customer_id: customer.id,
        customer_phone: customer.phoneNumber,
        direction: 'outbound',
        message_type: 'template',
        content: content || undefined,
        phone_number_id: credentials.phoneNumberRecordId,
        business_phone: credentials.displayPhoneNumber,
      }
    ).catch(err => logDetailedError(err, { path: c.req.path, method: c.req.method }))

    return c.json({
      success: true,
      data: {
        message,
        whatsappResult: result,
        rendered
      }
    })
  } catch (error: any) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    // Handle WhatsApp API errors (Requirement 4.5)
    if (error.response?.data?.error) {
      const waError = error.response.data.error
      const readableMessage = templateValidatorService.getReadableErrorMessage(
        waError.code,
        waError.message
      )
      
      return c.json({
        error: {
          code: waError.code || 'WhatsAppError',
          message: readableMessage,
          details: waError.error_data?.details
        }
      }, 400)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to send template message'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/templates/validate
 * Validate variable values before sending
 * 
 * Body:
 * - variableValues: Record<string, string> - Map of variableId to value
 * - variableIds: string[] - Array of variable IDs to validate
 * 
 * Returns: Validation result with errors per variable
 * 
 * Requirements: 4.1, 7.1, 7.2, 7.3, 7.4
 */
app.post('/validate', async (c: Context) => {
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

    // Parse and validate request body
    const body = await c.req.json()
    const validation = validateVariablesSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { variableValues, variableIds } = validation.data

    // Get variables from database
    const variables = await prisma.templateVariable.findMany({
      where: {
        id: { in: variableIds },
        userId
      }
    })

    // Check all requested variables were found
    if (variables.length !== variableIds.length) {
      const foundIds = new Set(variables.map(v => v.id))
      const missingIds = variableIds.filter(id => !foundIds.has(id))
      
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Some variables not found',
          details: { missingIds }
        }
      }, 404)
    }

    // Validate all variables
    const result = templateValidatorService.validateAllVariables(
      variableValues,
      variables
    )

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to validate variables'
      }
    }, 500)
  }
})

export default app
