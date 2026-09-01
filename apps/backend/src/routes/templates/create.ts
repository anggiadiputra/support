import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { templateCacheService } from '../../services/template-cache-service.js'
import { teamService } from '../../services/team-service.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { resolveCredentialsForSending } from '../../utils/whatsapp-account-helper.js'
import { validateTemplateContent } from '../../services/template-validation-rules.js'

const app = new Hono()

const createTemplateSchema = z.object({
  userId: z.string().optional(), // Made optional - will use session user if not provided
  whatsappAccountId: z.string().optional(), // Explicit account selection from frontend
  templateName: z
    .string()
    .min(1)
    .max(512)
    .regex(/^[a-z0-9_]+$/, 'Template name must use lowercase letters, numbers, or underscores'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z
    .string()
    .regex(/^[a-z]{2}(?:_[A-Z]{2})?$/, 'Language code must follow pattern en_US')
    .default('en_US'),
  content: z.string().min(1),
  headerType: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'DOCUMENT']).optional(),
  headerContent: z.string().optional(),
  // Frontend sends headerMediaId when upload succeeds; use it as source of truth for media headers
  headerMediaId: z.string().optional(),
  footerContent: z.string().max(60).optional(),
  buttons: z.array(z.any()).optional(),
  variables: z.array(z.string()).optional(),
  // AUTHENTICATION template specific fields
  addSecurityRecommendation: z.boolean().optional(),
  codeExpirationMinutes: z.number().min(1).max(90).optional().nullable(),
  otpType: z.enum(['COPY_CODE']).optional(),
  copyCodeButtonText: z.string().max(25).optional()
})

// POST /api/v1/templates - Create template
app.post('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const body = await c.req.json()
    const data = createTemplateSchema.parse(body)

    // Resolve effective userId - for Agents, use their Business Owner's ID
    let userId = data.userId || c.user.id

    if (c.user.role === 'AGENT') {
      const businessOwnerId = await teamService.getBusinessOwnerIdForAgent(c.user.id)
      if (businessOwnerId) {
        userId = businessOwnerId
      }
    }

    // Check user access - must be own data, agent of owner, or admin
    const isOwnData = c.user.id === userId
    const isAgentOfOwner = c.user.role === 'AGENT' && await teamService.getBusinessOwnerIdForAgent(c.user.id) === userId
    if (c.user.role !== 'ADMIN' && !isOwnData && !isAgentOfOwner) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Access denied'
        }
      }, 403)
    }

    // Validate template content - must have some actual text, not just variables
    const contentWithoutVariables = data.content.replace(/\{\{\d+\}\}/g, '').trim()
    if (!contentWithoutVariables) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Template must contain some text content, not just variables'
        }
      }, 400)
    }

    // Validate against Meta's template rules
    const validationResult = validateTemplateContent({
      content: data.content,
      category: data.category,
      footerContent: data.footerContent,
      headerContent: data.headerContent,
      headerType: data.headerType,
      buttons: data.buttons
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

    // For AUTHENTICATION templates, the body is fixed by Meta: "*{{1}}* is your verification code."
    // We auto-provide the example value and skip placeholder validation
    const isAuthTemplate = data.category === 'AUTHENTICATION'
    
    // Validate placeholder numbering and examples (skip for AUTH templates)
    const placeholderMatches = data.content.match(/\{\{(\d+)\}\}/g) || []
    const placeholderNumbers = Array.from(new Set(placeholderMatches.map((m) => parseInt(m.replace(/\{|\}/g, ''), 10)))).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)

    // Detect malformed single-brace placeholders (e.g., {1}} or {1})
    const hasInvalidBraces = (text?: string | null) => {
      if (!text) return false
      const cleaned = text.replace(/\{\{\d+\}\}/g, '')
      return cleaned.includes('{') || cleaned.includes('}')
    }

    if (!isAuthTemplate && hasInvalidBraces(data.content)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Placeholder harus menggunakan format {{1}}, {{2}}, dan seterusnya',
        },
      }, 400)
    }

    if (!isAuthTemplate && placeholderNumbers.length > 0) {
      // Must start at 1 and be contiguous (1..n)
      const isSequential = placeholderNumbers.every((num, idx) => num === idx + 1)
      if (!isSequential) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Placeholders must be sequential starting from {{1}} with no gaps',
          },
        }, 400)
      }
    }

    if (!isAuthTemplate && data.variables && placeholderNumbers.length !== data.variables.length) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Variables count (${data.variables.length}) must match placeholders count (${placeholderNumbers.length || 0})`,
        },
      }, 400)
    }

    if (!isAuthTemplate && !data.variables && placeholderNumbers.length > 0) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Provide example values for all placeholders',
        },
      }, 400)
    }
    
    // For AUTH templates, auto-provide example value for the OTP code placeholder
    let effectiveVariables = data.variables
    if (isAuthTemplate && placeholderNumbers.length > 0 && !data.variables) {
      // Meta expects example like "123456" for the OTP code
      effectiveVariables = ['123456']
    }

    // Normalize media sample for headers: prefer explicit mediaId when provided
    const normalizedHeaderContent = (data.headerContent || data.headerMediaId || '').trim()

    // Validate header presence
    if (data.headerType) {
      if (!normalizedHeaderContent) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Header content is required when header type is set',
          },
        }, 400)
      }
      if (data.headerType !== 'TEXT' && normalizedHeaderContent.length === 0) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Media header membutuhkan sample URL/media_id',
          },
        }, 400)
      }
      if (data.headerType === 'TEXT' && normalizedHeaderContent.length > 60) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Header text must be 60 characters or less',
          },
        }, 400)
      }

      if (data.headerType === 'TEXT' && hasInvalidBraces(normalizedHeaderContent)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Header placeholder harus menggunakan format {{1}}, {{2}}, dan seterusnya',
          },
        }, 400)
      }
    }

    // Validate buttons (basic WhatsApp constraints)
    // Skip button validation for AUTH templates - they use OTP buttons with different structure
    if (!isAuthTemplate && data.buttons && Array.isArray(data.buttons)) {
      const quickReplies = data.buttons.filter((b) => b.type === 'QUICK_REPLY')
      const ctas = data.buttons.filter((b) => b.type === 'URL' || b.type === 'PHONE_NUMBER')

      if (quickReplies.length > 3) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Maximum 3 quick reply buttons allowed',
          },
        }, 400)
      }

      if (ctas.length > 2) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Maximum 2 call-to-action buttons allowed',
          },
        }, 400)
      }

      for (const btn of data.buttons) {
        // Skip OTP buttons - they don't require text property
        if (btn.type === 'OTP') continue
        
        if (!btn?.text || btn.text.length > 25) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: 'Each button must have text up to 25 characters',
            },
          }, 400)
        }
      }
    }

    // Resolve WhatsApp credentials - prefer explicit account selection from frontend
    let credentials: Awaited<ReturnType<typeof resolveCredentialsForSending>> = null
    if (data.whatsappAccountId) {
      // User explicitly selected an account - resolve credentials for that account
      const { getWhatsAppAccountById, decryptAccountToken } = await import('../../utils/whatsapp-account-helper.js')
      const account = await getWhatsAppAccountById(data.whatsappAccountId)
      if (account && account.phoneNumbers.length > 0) {
        const primaryPhone = account.phoneNumbers[0]
        credentials = {
          phoneNumberId: primaryPhone.phoneNumberId,
          phoneNumberRecordId: primaryPhone.id,
          displayPhoneNumber: primaryPhone.displayPhoneNumber,
          accessToken: decryptAccountToken(account),
          wabaId: account.wabaId,
          whatsappAccountId: account.id,
          userId,
        }
      }
    }
    if (!credentials) {
      credentials = await resolveCredentialsForSending(userId)
    }

    if (!credentials) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'WhatsApp Business Account not connected'
        }
      }, 404)
    }

    // Check if template already exists
    const existingTemplate = await prisma.messageTemplate.findFirst({
      where: {
        userId: userId,
        templateName: data.templateName,
        language: data.language
      }
    })

    if (existingTemplate) {
      return c.json({
        error: {
          code: 'Conflict',
          message: `Template "${data.templateName}" (${data.language}) already exists. Please use a different name or update the existing template.`,
          details: {
            existingTemplateId: existingTemplate.id,
            existingStatus: existingTemplate.status
          }
        }
      }, 409)
    }

    // Create template in database, linked to the resolved WhatsApp account
    const template = await prisma.messageTemplate.create({
      data: {
        userId: userId,
        whatsappAccountId: credentials.whatsappAccountId,
        templateName: data.templateName,
        category: data.category,
        language: data.language,
        content: data.content,
        headerType: isAuthTemplate ? undefined : data.headerType, // AUTH templates can't have media headers
        // Persist the media_id returned by upload even if frontend forgot to copy it into headerContent
        headerContent: isAuthTemplate ? undefined : (normalizedHeaderContent || undefined),
        footerContent: isAuthTemplate ? undefined : data.footerContent, // AUTH templates handle footer differently
        buttons: data.buttons || [],
        variables: effectiveVariables || [],
        // Store AUTH-specific fields in metadata or separate columns if needed
        // For now, buttons array already contains OTP button config from frontend
      }
    })

    // Audit log
    await auditLog(
      'TEMPLATE_CREATED',
      'MessageTemplate',
      template.id,
      {
        templateName: data.templateName,
        category: data.category,
        userId: userId,
        createdBy: c.user?.id
      },
      c.user?.id
    )

    // Invalidate template list cache
    await templateCacheService.invalidateTemplateList(userId)

    return c.json({
      success: true,
      data: template
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    // Handle unique constraint errors
    if (error.code === 'P2002') {
      return c.json({
        error: {
          code: 'Conflict',
          message: 'A template with this name and language already exists. Please choose a different name.',
          details: {
            constraint: error.meta?.target
          }
        }
      }, 409)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to create template'
      }
    }, 500)
  }
})

export default app
