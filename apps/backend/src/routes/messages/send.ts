import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import WhatsAppAPI from '../../utils/whatsapp.js'
import { TokenEncryptionService } from '../../utils/tokenEncryption.js'
import { resolveCredentialsForSending, getWhatsAppAccountsForUser } from '../../utils/whatsapp-account-helper.js'
import { assertCanSend, type TemplateCategory } from '../../services/compliance/assert-can-send.js'
import { LeadScoringService } from '../../services/lead-scoring.js'
import { ActivityService } from '../../services/activity-service.js'
import { webhookService } from '../../services/webhook-service.js'
import { getEffectiveUserId, getActingAgentId } from '../../middleware/resolveContext.js'
import { templateRendererService, type WhatsAppTemplate, type WhatsAppTemplateComponent } from '../../services/template-renderer-service.js'
import { templateVariableService } from '../../services/template-variable-service.js'
import { templateValidatorService } from '../../services/template-validator-service.js'
import { WhatsAppErrorService } from '../../services/whatsapp-error-service.js'
import { wabaHealthService, WABAHealthService } from '../../services/waba/health-service.js'
import { 
  getLocaleFromHeader, 
  getWhatsAppErrorMessage,
  isKnownErrorCode,
  getErrorMetadata
} from '../../services/error-messages/index.js'
import { disconnectService } from '../../services/disconnect-service.js'
import { AuditLogService } from '../../services/audit-log-service.js'
import { memoryQueue } from '../../utils/queue.js'
import { createMemoryVectorStore } from '../../services/ai/memory/index.js'
import { OpenAIProvider } from '../../services/ai/providers/OpenAIProvider.js'
import { eventEmitter } from '../../websocket/index.js'
import { normalizePhoneNumber } from '../../utils/validation.js'
import { getSendTarget, findCustomerByIdentifier } from '../../utils/customer-lookup.js'
import { isValidBsuid } from '../../types/whatsapp-bsuid.js'
import { logger, extractAxiosError } from '../../utils/logger.js'

const app = new Hono()

/**
 * Check if user has AI Chatbot feature (non-FREE tier)
 */
async function hasAIChatbotFeature(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { subscriptionTier: true }
  });
  return user?.subscriptionTier !== 'FREE';
}

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

// WhatsApp Business API limit for text messages
const WHATSAPP_TEXT_MAX_LENGTH = 4096

const ctaUrlInteractiveSchema = z.object({
  type: z.literal('cta_url'),
  header: z.any().optional(),
  body: z.object({ text: z.string() }).optional(),
  footer: z.object({ text: z.string() }).optional(),
  action: z.object({
    name: z.string(),
    parameters: z.object({
      display_text: z.string(),
      url: z.string(),
    }),
  }),
})

const buttonInteractiveSchema = z.object({
  type: z.literal('button'),
  header: z.any().optional(),
  body: z.object({ text: z.string() }).optional(),
  footer: z.object({ text: z.string() }).optional(),
  action: z.object({
    buttons: z.array(z.object({
      type: z.literal('reply'),
      reply: z.object({
        id: z.string(),
        title: z.string(),
      }),
    })).max(3),
  }),
})

const listInteractiveSchema = z.object({
  type: z.literal('list'),
  header: z.any().optional(),
  body: z.object({ text: z.string() }).optional(),
  footer: z.object({ text: z.string() }).optional(),
  action: z.object({
    button: z.string().max(20),
    sections: z.array(z.object({
      title: z.string().max(24).optional(),
      rows: z.array(z.object({
        id: z.string().max(200),
        title: z.string().max(24),
        description: z.string().max(72).optional(),
      })).min(1).max(10),
    })).min(1).max(10),
  }),
})

const carouselCardUrlActionSchema = z.object({
  name: z.literal('cta_url'),
  parameters: z.object({
    display_text: z.string().max(20),
    url: z.string().url(),
  }),
})

const carouselCardQuickReplyActionSchema = z.object({
  buttons: z.array(z.object({
    type: z.literal('quick_reply'),
    quick_reply: z.object({
      id: z.string().max(256),
      title: z.string().max(20),
    }),
  })).min(1).max(3),
})

const carouselCardSchema = z.object({
  card_index: z.number().int().min(0),
  type: z.literal('cta_url'),
  header: z.object({
    type: z.enum(['image', 'video']),
    image: z.object({ link: z.string().url() }).optional(),
    video: z.object({ link: z.string().url() }).optional(),
  }).superRefine((header, ctx) => {
    if (header.type === 'image') {
      if (!header.image) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'image header requires image media',
          path: ['image'],
        })
      }

      if (header.video) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'image header cannot include video media',
          path: ['video'],
        })
      }
    }

    if (header.type === 'video') {
      if (!header.video) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'video header requires video media',
          path: ['video'],
        })
      }

      if (header.image) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'video header cannot include image media',
          path: ['image'],
        })
      }
    }
  }),
  body: z.object({ text: z.string().max(160) }).optional(),
  action: z.union([carouselCardUrlActionSchema, carouselCardQuickReplyActionSchema]),
})

const carouselInteractiveSchema = z.object({
  type: z.literal('carousel'),
  body: z.object({ text: z.string().max(1024) }),
  action: z.object({
    cards: z.array(carouselCardSchema).min(2).max(10),
  }),
}).strict().superRefine((interactive, ctx) => {
  const [firstCard, ...otherCards] = interactive.action.cards

  if (!firstCard) {
    return
  }

  const firstActionShape = 'name' in firstCard.action ? 'cta_url' : 'quick_reply'
  const firstQuickReplyCount = 'buttons' in firstCard.action ? firstCard.action.buttons.length : null

  otherCards.forEach((card, index) => {
    const cardActionShape = 'name' in card.action ? 'cta_url' : 'quick_reply'
    const cardPath = ['action', 'cards', index + 1, 'action']

    if (cardActionShape !== firstActionShape) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'all carousel cards must use the same action shape',
        path: cardPath,
      })
    }

    if (
      firstActionShape === 'quick_reply' &&
      'buttons' in card.action &&
      firstQuickReplyCount !== null &&
      card.action.buttons.length !== firstQuickReplyCount
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'all quick reply carousel cards must have the same number of buttons',
        path: [...cardPath, 'buttons'],
      })
    }
  })
})

export const whatsappInteractiveSchema = z.union([
  ctaUrlInteractiveSchema,
  buttonInteractiveSchema,
  listInteractiveSchema,
  carouselInteractiveSchema,
])

export function validateWhatsAppInteractiveForSend(interactive: unknown) {
  return whatsappInteractiveSchema.safeParse(interactive)
}

export function formatWhatsAppInteractiveForHistory(interactive: unknown): { content: string; mediaUrl: string | null } {
  const result = validateWhatsAppInteractiveForSend(interactive)

  if (!result.success) {
    return {
      content: 'Interactive Message',
      mediaUrl: null,
    }
  }

  const data = result.data

  if (data.type === 'carousel') {
    const cardsSummary = data.action.cards
      .map((card) => `- Card ${card.card_index + 1}: ${card.body?.text || '[media only]'}`)
      .join('\n')

    const firstCard = data.action.cards[0]
    const mediaUrl = firstCard && 'name' in firstCard.action
      ? firstCard.action.parameters.url
      : null

    return {
      content: `${data.body.text || 'Carousel Message'}\n🎠 Carousel\n${cardsSummary}`,
      mediaUrl,
    }
  }

  if (data.type === 'cta_url') {
    const label = data.action.parameters.display_text
    const url = data.action.parameters.url

    return {
      content: `${data.body?.text || 'Interactive Message'}\n[${label}](${url})`,
      mediaUrl: url,
    }
  }

  if (data.type === 'button') {
    return {
      content: `${data.body?.text || 'Interactive Message'}\n${data.action.buttons.map((button) => `[${button.reply.title}]`).join(' ')}`,
      mediaUrl: null,
    }
  }

  const sectionsSummary = data.action.sections
    .flatMap((section) => [
      section.title ? `• ${section.title}` : null,
      ...section.rows.map((row) => `  - ${row.title}`),
    ])
    .filter((line): line is string => Boolean(line))
    .join('\n')

  return {
    content: `${data.body?.text || 'Interactive Message'}\n📋 [${data.action.button || 'View Options'}]${sectionsSummary ? `\n${sectionsSummary}` : ''}`,
    mediaUrl: null,
  }
}

export const sendMessageSchema = z.object({
  userId: z.string().optional(), // Optional - will use effectiveUserId if not provided
  customerId: z.string().optional(),
  phoneNumber: z.string().optional(),
  type: z.enum(['text', 'template', 'image', 'document', 'interactive']),
  // Context for reply-to-specific-message (quoted reply)
  context: z.object({
    message_id: z.string() // wamId of the message being replied to
  }).optional(),
  text: z.object({
    body: z.string().min(1, 'Message body is required').max(WHATSAPP_TEXT_MAX_LENGTH, `Message too long (max ${WHATSAPP_TEXT_MAX_LENGTH} characters)`),
    preview_url: z.boolean().optional()
  }).optional(),
  template: z.object({
    name: z.string(),
    language: z.object({ code: z.string() }),
    components: z.array(z.any()).optional()
  }).optional(),
  // Template variable values for the new variable system (Requirement 4.4)
  variableValues: z.record(z.string(), z.string()).optional(),
  image: z.object({
    id: z.string().optional(),
    link: z.string().optional(),
    caption: z.string().optional()
  }).optional(),
  document: z.object({
    id: z.string().optional(),
    link: z.string().optional(),
    filename: z.string().optional(),
    caption: z.string().optional()
  }).optional(),
  interactive: whatsappInteractiveSchema.optional()
})

// POST /api/v1/messages/send - Send message
app.post('/send', async (c: Context) => {
  // Store credentials info in outer scope so catch block can access them
  let resolvedWabaId: string | null = null
  let resolvedPhoneNumberId: string | null = null

  try {
    const body = await c.req.json()

    const data = sendMessageSchema.parse(body)

    // Use effectiveUserId for agents to send on behalf of business owner
    // Requirements: 5.3, 6.2, 6.3
    const effectiveUserId = getEffectiveUserId(c)
    const actingAgentId = getActingAgentId(c)
    const isAgent = c.user?.role === 'AGENT'

    // For agents, ALWAYS use effectiveUserId (business owner's ID) regardless of what's sent
    // This prevents agents from sending on behalf of other users
    // For non-agents, allow explicit userId if it matches effectiveUserId
    const targetUserId = isAgent 
      ? effectiveUserId 
      : (data.userId || effectiveUserId)

    // Check access - allow if admin or if userId matches effective user
    if (c.user?.role !== 'ADMIN' && effectiveUserId !== targetUserId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied'
        }
      }, 403)
    }

    // Get user (business owner)
    const user = await prisma.user.findUnique({
      where: { id: targetUserId }
    })

    if (!user) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'User not found'
        }
      }, 400)
    }

    // Resolve WhatsApp credentials (customer's linked number > primary number > any connected)
    const credentials = await resolveCredentialsForSending(targetUserId, data.customerId)

    if (!credentials) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'No connected WhatsApp Business Account found. Please connect a WhatsApp account first.',
          recoveryAction: 'Go to WABA page and click "Connect WhatsApp Business" to connect'
        }
      }, 400)
    }

    const phoneNumberId = credentials.phoneNumberId
    resolvedWabaId = credentials.wabaId
    resolvedPhoneNumberId = credentials.phoneNumberId

    // Get or create customer
    let customer
    if (data.customerId) {
      // Scope lookup to the target user to prevent IDOR — a caller must not be
      // able to target another tenant's customer by supplying its id.
      customer = await prisma.customer.findFirst({
        where: { id: data.customerId, userId: targetUserId }
      })
    } else if (data.phoneNumber) {
      // Resolve phone number record for linking customer to business number
      const phoneNumberRecord = await prisma.phoneNumber.findUnique({
        where: { phoneNumberId: credentials.phoneNumberId }
      })

      // Normalize identifier (guard preserves BSUID format automatically)
      const normalizedIdentifier = normalizePhoneNumber(data.phoneNumber)
      const inputIsBsuid = isValidBsuid(normalizedIdentifier)

      // BSUID-aware lookup: matches by phoneNumber OR whatsappBsuid
      const lookup = await findCustomerByIdentifier(
        targetUserId,
        normalizedIdentifier,
        phoneNumberRecord?.id ?? null,
      )

      if (lookup.customer) {
        customer = await prisma.customer.findUnique({ where: { id: lookup.customer.id } })
      } else {
        // Create — populate whichever column matches the input format.
        // NOTE: while phoneNumber is still NOT NULL (pre-Phase-2), BSUID-only
        // input is stored as phoneNumber = <BSUID> AND whatsappBsuid = <BSUID>
        // for maximum lookup coverage. Phase 2 migration cleans this up.
        customer = await prisma.customer.create({
          data: {
            userId: targetUserId,
            phoneNumber: normalizedIdentifier,
            ...(inputIsBsuid && {
              whatsappBsuid: normalizedIdentifier,
              bsuidMappedAt: new Date(),
            }),
            consentStatus: false,
            whatsappPhoneNumberId: phoneNumberRecord?.id || null,
          }
        })
      }
    }

    if (!customer) {
      return c.json({
        error: {
          code: 'CustomerRequired',
          message: 'Customer not found'
        }
      }, 400)
    }

    // Variables for template message handling (Requirement 4.4)
    let dbTemplate: any = null
    let renderedContent: string | null = null
    let templatePayload: any = null

    // Load template from database for template messages (needed for compliance
    // check below to determine MARKETING vs UTILITY/AUTH category)
    if (data.type === 'template' && data.template) {
      dbTemplate = await prisma.messageTemplate.findFirst({
        where: {
          userId: targetUserId,
          templateName: data.template.name,
          language: data.template.language.code
        }
      })
    }

    // Centralized compliance check (blacklist, consent, marketing opt-out, 24h window)
    const complianceCheck = await assertCanSend(
      customer.id,
      data.type === 'template'
        ? {
            kind: 'template',
            category: ((dbTemplate?.category as string)?.toUpperCase() as TemplateCategory) || 'UTILITY',
          }
        : { kind: 'freeform' }
    )
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

    // Handle template with variable values using mapping system (Requirement 4.4)
    if (data.type === 'template' && data.template && data.variableValues && Object.keys(data.variableValues).length > 0 && dbTemplate) {
      // Convert DB template to WhatsAppTemplate format
      const template = dbTemplateToWhatsAppTemplate(dbTemplate)

      // Get variable mappings
      const mappings = await templateVariableService.getMappings(targetUserId, data.template.name)

      // Translate numeric keys (from frontend manual input) to variableIds using mappings
      const processedVariableValues: Record<string, string> = { ...data.variableValues }
      const mappedVariableIds: string[] = []

      for (const [key, value] of Object.entries(data.variableValues)) {
        if (/^\d+$/.test(key)) {
          const paramIndex = parseInt(key) - 1
          // Try to find mapping for this parameter (prioritize body as it's most common)
          // Use case-insensitive comparison for componentType
          const mapping = mappings.find(m =>
            m.parameterIndex === paramIndex &&
            m.componentType.toLowerCase() === 'body'
          ) || mappings.find(m =>
            m.parameterIndex === paramIndex
          )

          if (mapping) {
            processedVariableValues[mapping.variableId] = value
            mappedVariableIds.push(mapping.variableId)
          }
        } else {
          mappedVariableIds.push(key)
        }
      }

      // Get variables for validation
      const variables = await prisma.templateVariable.findMany({
        where: {
          id: { in: mappedVariableIds },
          userId: targetUserId
        }
      })

      // Validate all variable values
      if (variables.length > 0) {
        const validationResult = templateValidatorService.validateAllVariables(
          processedVariableValues,
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

      // Build WhatsApp API payload with variables
      const builtPayload = templateRendererService.buildTemplatePayload(
        data.template.name,
        data.template.language.code,
        template,
        processedVariableValues,
        mappings
      )

      // Check if the built payload actually has valid parameters (not empty strings)
      // If it's empty or has only empty strings but frontend sent valid parameters, we prefer frontend's data
      const hasBuiltParams = builtPayload.components?.some(c =>
        c.parameters && c.parameters.some(p => p.text && p.text.trim() !== '')
      )
      const frontendHasParams = data.template?.components?.some((c: any) =>
        c.parameters && c.parameters.some((p: any) => p.text && p.text.trim() !== '')
      )

      // FIXED: If no mappings exist, don't use built payload - use frontend components directly
      if (mappings.length === 0) {
        // Keep templatePayload as null so frontend components are used
      } else if (hasBuiltParams) {
        templatePayload = builtPayload
      } else if (!frontendHasParams) {
        templatePayload = builtPayload
      }
      // else: keep templatePayload as null so it uses data.template (which has the frontend components)

      // Render template for storage
      const rendered = templateRendererService.renderTemplate(
        template,
        processedVariableValues,
        mappings
      )

      // Build content string for message record
      renderedContent = rendered.body
      if (rendered.header?.type === 'text') {
        renderedContent = `${rendered.header.content}\n\n${renderedContent}`
      }
      if (rendered.footer) {
        renderedContent = `${renderedContent}\n\n${rendered.footer}`
      }

      // Save variable history for suggestions
      if (customer) {
        const historyEntries = variables.map(v => ({
          templateName: data.template!.name,
          variableId: v.id,
          value: processedVariableValues[v.id] || '',
          customerId: customer.id
        })).filter(entry => entry.value !== '')

        if (historyEntries.length > 0) {
          await templateVariableService.saveVariableHistoryBatch(targetUserId, historyEntries).catch(err =>
            console.error('Failed to save variable history:', err)
          )

          // Increment usage count for variables
          for (const variable of variables) {
            templateVariableService.incrementUsageCount(variable.id).catch(err =>
              console.error(`Failed to increment usage count for variable ${variable.id}:`, err)
            )
          }
        }
      }
    }

    // Prepare payload for WhatsApp
    // If ID is present, we don't need to send link to WhatsApp (it might confuse the API)
    // We must deep clone or carefully clone the nested objects to avoid mutating 'data' which is used later
    const whatsappData = JSON.parse(JSON.stringify(data))

    // Check if template has variables but no components were sent
    // This catches the case where frontend didn't send variable values
    if (data.type === 'template' && dbTemplate?.content) {
      const templateVariables = dbTemplate.content.match(/\{\{(\d+)\}\}/g)
      const hasVariablesInTemplate = templateVariables && templateVariables.length > 0
      const hasComponentsSent = data.template?.components && data.template.components.length > 0

      // Check if body component has parameters (this is what frontend sends)
      const bodyComponent = data.template?.components?.find((c: any) => c.type === 'body')
      const hasBodyParameters = bodyComponent?.parameters && bodyComponent.parameters.length > 0

      // If template has variables but no components/payload were sent
      // Check if we should return an error or try to proceed
      if (hasVariablesInTemplate && !templatePayload && !hasBodyParameters && !hasComponentsSent) {
        // Extract variable numbers from template (e.g., {{1}}, {{2}})
        const varNumbers = templateVariables!.map((v: string) => parseInt(v.replace(/[{}]/g, '')))
        const uniqueVarNumbers = [...new Set(varNumbers)].sort((a: number, b: number) => a - b)

        // Return error with helpful message
        return c.json({
          error: {
            code: 'MissingVariables',
            message: `Template "${dbTemplate.templateName}" requires ${templateVariables.length} variable(s) but none were provided`,
            details: {
              requiredVariables: templateVariables.length,
              variableNumbers: uniqueVarNumbers,
              templateContent: dbTemplate.content,
              receivedComponents: data.template?.components,
              hint: 'Frontend must send template.components with body.parameters containing variable values'
            }
          }
        }, 400)
      }
    }

    // If we built a template payload with variables (from variableValues + mappings system), use it
    if (templatePayload) {
      whatsappData.template = templatePayload
    }
    // Otherwise, if frontend sent components directly (simple variable input), use as-is
    // This supports the "Fill Template Variables" dialog that sends components directly
    else if (data.type === 'template' && data.template?.components && data.template.components.length > 0) {
      // Frontend already built the correct WhatsApp API payload with components
      // Just ensure the template structure is correct
      whatsappData.template = {
        name: data.template.name,
        language: data.template.language,
        components: data.template.components
      }
    }

    // Build rendered content for message storage (for display in chat)
    // This must happen AFTER template payload is set, regardless of which path was taken
    if (data.type === 'template' && !renderedContent && dbTemplate?.content) {
      // Try to render content from template + components for storage
      const componentsToUse = whatsappData.template?.components || data.template?.components
      const bodyComponent = componentsToUse?.find((c: any) => c.type === 'body')
      
      if (bodyComponent?.parameters && bodyComponent.parameters.length > 0) {
        let content = dbTemplate.content
        bodyComponent.parameters.forEach((param: any, index: number) => {
          content = content.replace(`{{${index + 1}}}`, param.text || '')
        })
        renderedContent = content
      } else {
        // Fallback to original template content if no parameters
        renderedContent = dbTemplate.content
      }
    }

    if (whatsappData.type === 'image' && whatsappData.image?.id) {
      delete whatsappData.image.link
    } else if (whatsappData.type === 'document' && whatsappData.document?.id) {
      delete whatsappData.document.link
    } else if (whatsappData.type === 'interactive' && whatsappData.interactive) {
      const interactiveValidation = validateWhatsAppInteractiveForSend(whatsappData.interactive)

      if (!interactiveValidation.success) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: interactiveValidation.error.issues[0]?.message || 'Invalid interactive payload',
            details: interactiveValidation.error.issues,
          }
        }, 400)
      }

      whatsappData.interactive = interactiveValidation.data

      // Debug: Log interactive payload for list messages
      if (whatsappData.interactive.type === 'list') {
        console.log('📋 List Message Payload:', JSON.stringify(whatsappData.interactive, null, 2))
      }
    }

    // Create WhatsApp client with resolved account credentials
    const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken });

    const sendTarget = getSendTarget(customer)

    // BSUID compliance guard: Meta rejects auth templates (one-tap/zero-tap/copy-code)
    // sent to BSUID recipients (error 131062). Fail fast with a local error so the
    // client gets a clear message instead of a generic upstream failure.
    // Reference: docs/bsuid.md line 22
    if (
      data.type === 'template' &&
      (dbTemplate?.category as string | undefined)?.toUpperCase() === 'AUTHENTICATION' &&
      !sendTarget.to &&
      sendTarget.recipient
    ) {
      logger.warn('Blocked auth template send to BSUID-only recipient', {
        customerId: customer.id,
        templateName: data.template?.name,
        recipient: sendTarget.recipient,
      })
      return c.json(
        {
          error: {
            code: 'BsuidNotSupportedForAuthTemplate',
            message:
              'Template autentikasi (one-tap/zero-tap/copy-code) tidak dapat dikirim menggunakan BSUID. Penerima ini belum memiliki nomor telepon terdaftar.',
            metaErrorCode: 131062,
          },
        },
        400,
      )
    }

    const result = await whatsapp.sendMessage({
      phoneNumberId: phoneNumberId,
      ...sendTarget, // Includes to and/or recipient (BSUID)
      type: data.type as any,
      context: data.context, // For reply-to-specific-message (quoted reply)
      ...whatsappData
    })

    // Extract media URL or ID
    let mediaUrl = null
    if (data.type === 'image') {
      mediaUrl = data.image?.link || data.image?.id
    } else if (data.type === 'document') {
      mediaUrl = data.document?.link || data.document?.id
    } else if (data.type === 'interactive') {
      mediaUrl = formatWhatsAppInteractiveForHistory(data.interactive).mediaUrl
    }

    // Extract content
    let content: string | null = null
    if (data.text?.body) {
      content = data.text.body
    } else if (data.image?.caption) {
      content = data.image.caption
    } else if (data.document?.caption) {
      content = data.document.caption
    } else if (data.type === 'interactive') {
      content = formatWhatsAppInteractiveForHistory(data.interactive).content
    } else if (data.type === 'template' && renderedContent) {
      // Use rendered content for template messages with variables (Requirement 4.4)
      content = renderedContent
    }

    // Save message with business owner's userId but track agent in metadata
    // Requirements: 6.3 - Record message with Business Owner's userId but track Agent as sender
    // Requirement 4.4 - Save rendered content to message record for template messages
    // Resolve phone number record for linking message to business number
    const msgPhoneRecord = await prisma.phoneNumber.findUnique({
      where: { phoneNumberId: credentials.phoneNumberId }
    })

    const message = await prisma.message.create({
      data: {
        userId: targetUserId,
        customerId: customer.id,
        messageType: data.type.toUpperCase() as any,
        direction: 'OUTBOUND',
        content,
        mediaUrl,
        wamId: result.messages?.[0]?.id,
        status: 'SENT',
        templateId: dbTemplate?.id || undefined,
        whatsappPhoneNumberId: msgPhoneRecord?.id || null,
      }
    })

    await auditLog(
      data.type === 'template' ? 'TEMPLATE_MESSAGE_SENT' : 'MESSAGE_SENT',
      'Message',
      message.id,
      {
        to: customer.phoneNumber,
        type: data.type,
        sentBy: c.user?.id,
        actingAgentId: actingAgentId, // Track agent if message sent by agent
        templateName: data.template?.name,
        templateLanguage: data.template?.language?.code,
        hasVariables: data.variableValues ? Object.keys(data.variableValues).length > 0 : false
      },
      c.user?.id
    )

    // Trigger lead scoring update asynchronously
    LeadScoringService.updateCustomerScore(customer.id).catch(err =>
      console.error(`Failed to update lead score for customer ${customer.id}:`, err)
    )

    // Log message activity
    if (c.user?.id) {
      ActivityService.logMessageActivity(
        customer.id,
        c.user.id,
        'sent',
        message.id,
        content?.substring(0, 100)
      ).catch(err => console.error('Failed to log message activity:', err))
    }

    // Emit webhook event for message.sent (Requirement 3.1, 8.1, 8.2, 8.4)
    // Include template information for template messages (Requirement 4.4)
    webhookService.emitEvent(
      targetUserId,
      'message.sent',
      'whatsapp',
      credentials.phoneNumberRecordId,
      {
        message_id: message.id,
        customer_id: customer.id,
        customer_phone: customer.phoneNumber,
        direction: 'outbound',
        message_type: data.type,
        content: content || undefined,
        media_url: mediaUrl || undefined,
        phone_number_id: credentials.phoneNumberRecordId,
        business_phone: credentials.displayPhoneNumber,
      }
    ).catch(err => console.error('Failed to emit message.sent webhook:', err))

    // Audit log: Message sent successfully
    AuditLogService.logMessageSent(targetUserId, message.id, {
      customerId: customer.id,
      customerPhone: customer.phoneNumber,
      messageType: data.type.toUpperCase(),
      wamId: result.messages?.[0]?.id,
      source: actingAgentId ? 'AGENT' : 'INBOX',
      channel: 'whatsapp',
    }).catch(err => console.error('Failed to log message sent:', err))

    // Queue memory for human agent reply (non-blocking)
    if (data.type === 'text' && content && await hasAIChatbotFeature(targetUserId)) {
      try {
        // Get last customer inbound message
        const lastInboundMessage = await prisma.message.findFirst({
          where: {
            customerId: customer.id,
            direction: 'INBOUND',
            messageType: 'TEXT',
            content: { not: null },
          },
          orderBy: { timestamp: 'desc' },
        });

        // Get WhatsApp account ID
        const phoneRecord = await prisma.phoneNumber.findUnique({
          where: { phoneNumberId: credentials.phoneNumberId },
          select: { whatsappAccountId: true }
        });

        if (lastInboundMessage?.content && phoneRecord?.whatsappAccountId) {
          const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '');
          const memoryStore = createMemoryVectorStore(openaiProvider);

          const memory = await memoryStore.createMemory({
            userId: targetUserId,
            customerId: customer.id,
            whatsappAccountId: phoneRecord.whatsappAccountId,
            memoryType: 'HUMAN_REPLY',
            customerMessage: lastInboundMessage.content,
            responseMessage: content,
            inboundMessageId: lastInboundMessage.id,
            outboundMessageId: message.id,
          });

          await memoryQueue.add('embed-memory', {
            type: 'embed-memory',
            memoryId: memory.id
          });
          console.log('🧠 Memory queued for human reply embedding:', memory.id);
        }
      } catch (memoryError) {
        console.error('Failed to queue human reply memory:', memoryError);
        // Don't throw - memory failure shouldn't affect main flow
      }
    }

    // Mark WABA health issues as resolved since message was sent successfully
    if (credentials.wabaId) {
      wabaHealthService.markAsResolved(credentials.wabaId).catch(err =>
        console.error('Failed to mark WABA health as resolved:', err)
      )
    }

    // Emit outbound_message to business room for real-time sync
    eventEmitter.emitOutboundMessageToBusinessRoom(effectiveUserId, {
      conversationId: customer.id,
      channel: 'whatsapp',
      message: {
        id: message.id,
        content: message.content || '',
        contentType: (message.messageType?.toLowerCase() || 'text') as 'text' | 'image' | 'video' | 'audio' | 'document' | 'template' | 'interactive',
        timestamp: new Date().toISOString(),
        senderId: actingAgentId || effectiveUserId,
        senderName: c.user?.name || 'Unknown',
        senderType: 'human'
      }
    })

    return c.json({
      success: true,
      data: {
        message,
        whatsappResult: result
      }
    })
  } catch (error: any) {
    logger.error('Send message error', { error: extractAxiosError(error) })

    // Audit log: Message send failed
    const effectiveUserId = getEffectiveUserId(c)
    const body = await c.req.json().catch(() => ({}))
    AuditLogService.logMessageSendFailed(
      effectiveUserId,
      body.customerId || body.phoneNumber || 'unknown',
      error.message || 'Unknown error',
      {
        messageType: body.type,
        errorCode: error.response?.data?.error?.code,
        errorSubcode: error.response?.data?.error?.error_subcode,
      }
    ).catch(e => logger.error('Failed to log message send error', { error: extractAxiosError(e) }))
    
    // Use WhatsAppErrorService for consistent error handling (Requirement 7.1)
    const metaError = error.response?.data || error
    const errorResponse = WhatsAppErrorService.formatErrorResponse(metaError)
    const errorInfo = WhatsAppErrorService.getErrorInfo(errorResponse.error.code)
    
    // Check for phone number deleted/disconnected error (code 100 + subcode 33)
    // This indicates user has disconnected WhatsApp from their phone
    const errorCode = errorResponse.error.code
    const errorSubcode = errorResponse.error.details?.errorSubcode
    
    // Get locale from Accept-Language header for i18n error messages
    const locale = getLocaleFromHeader(c.req.header('Accept-Language'))
    
    // =========================================
    // User-friendly error responses using centralized error service
    // Hide technical codes, show helpful messages with i18n support
    // =========================================
    
    // Phone number deleted/disconnected (code 100 + subcode 33)
    if (errorCode === 100 && errorSubcode === 33) {
      const disconnectUserId = getEffectiveUserId(c)

      // Look up connected WhatsApp accounts for this user and auto-disconnect them
      getWhatsAppAccountsForUser(disconnectUserId, true).then(accounts => {
        for (const account of accounts) {
          disconnectService.autoDisconnectWaba(
            account.id,
            'Phone number deleted or disconnected (error 100, subcode 33)'
          ).catch(err => console.error('Failed to auto-disconnect WABA:', err))
        }
      }).catch(err => console.error('Failed to look up WhatsApp accounts for auto-disconnect:', err))
      
      const errorMsg = getWhatsAppErrorMessage(100, locale, 33)
      if (errorMsg) {
        return c.json({
          error: {
            code: errorMsg.error_code,
            message: errorMsg.message,
            category: errorMsg.category,
            retryable: errorMsg.retryable,
            recoveryAction: errorMsg.recovery_action
          }
        }, errorMsg.http_status)
      }
    }
    
    // Try to get error message from centralized service for known error codes
    if (isKnownErrorCode(errorCode, errorSubcode)) {
      const errorMsg = getWhatsAppErrorMessage(errorCode, locale, errorSubcode)
      if (errorMsg) {
        return c.json({
          error: {
            code: errorMsg.error_code,
            message: errorMsg.message,
            category: errorMsg.category,
            retryable: errorMsg.retryable,
            recoveryAction: errorMsg.recovery_action
          }
        }, errorMsg.http_status)
      }
    }
    
    // Check if this is a health-related error and update WABA health status
    if (WABAHealthService.isHealthError(errorResponse.error.code)) {
      if (resolvedWabaId) {
        wabaHealthService.updateStatusFromError(
          resolvedWabaId,
          resolvedPhoneNumberId || null,
          errorResponse.error.code,
          errorResponse.error.details?.originalMessage || errorInfo.title,
          metaError
        ).catch(err => console.error('Failed to update WABA health status:', err))
      }
    }
    
    // For any other unhandled errors, return a generic user-friendly message
    // Don't expose technical error codes to users
    // Try to get metadata for unknown codes
    const fallbackMetadata = getErrorMetadata(errorCode, errorSubcode)
    const genericErrorMsg = getWhatsAppErrorMessage(131000, locale) // GenericError
    
    return c.json({
      error: {
        code: 'SendMessageFailed',
        message: genericErrorMsg?.message || (locale === 'id' ? 'Gagal mengirim pesan. Silakan coba lagi.' : 'Failed to send message. Please try again.'),
        category: fallbackMetadata ? errorInfo.category.toLowerCase() : 'unknown',
        retryable: fallbackMetadata?.retryable ?? errorInfo.retryable,
        recoveryAction: genericErrorMsg?.recovery_action || (fallbackMetadata?.retryable 
          ? (locale === 'id' ? 'Tunggu beberapa saat dan coba lagi.' : 'Wait a moment and try again.')
          : (locale === 'id' ? 'Jika masalah berlanjut, hubungi tim support.' : 'If the problem persists, contact support.'))
      }
    }, (fallbackMetadata?.http_status || errorInfo.httpStatus) as 400 | 401 | 403 | 404 | 500 | 503)
  }
})

export default app
