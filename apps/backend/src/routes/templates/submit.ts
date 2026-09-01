import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { logger, extractAxiosError } from '../../utils/logger.js'
import { templateVariableService } from '../../services/template-variable-service.js'
import { resolveCredentialsForSending, getWhatsAppAccountById, createWhatsAppApiForAccount } from '../../utils/whatsapp-account-helper.js'

const app = new Hono()

// POST /api/v1/templates/:id/submit - Submit template to Meta for approval
app.post('/:id/submit', async (c: Context) => {
  try {
    const id = c.req.param('id')

    const template = await prisma.messageTemplate.findUnique({
      where: { id },
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

    // Resolve WhatsApp account credentials - prefer template's linked account
    let credentials = null
    let whatsappAccount = null
    if (template.whatsappAccountId) {
      whatsappAccount = await getWhatsAppAccountById(template.whatsappAccountId)
      if (whatsappAccount && whatsappAccount.connectionStatus === 'connected') {
        credentials = {
          wabaId: whatsappAccount.wabaId,
          whatsappAccountId: whatsappAccount.id,
        }
      }
    }
    if (!credentials) {
      const fallback = await resolveCredentialsForSending(template.userId)
      if (fallback) {
        credentials = { wabaId: fallback.wabaId, whatsappAccountId: fallback.whatsappAccountId }
        whatsappAccount = await getWhatsAppAccountById(fallback.whatsappAccountId)
      }
    }

    // Check if WABA is configured
    if (!credentials || !whatsappAccount) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'WABA / phone number belum dikonfigurasi untuk user ini'
        }
      }, 400)
    }

    // Helper to collect placeholder numbers in ascending order
    const getPlaceholders = (text: string | null | undefined) => {
      if (!text) return [] as number[]
      const matches = text.match(/\{\{(\d+)\}\}/g) || []
      return Array.from(new Set(matches.map((m) => parseInt(m.replace(/\{|\}/g, ''), 10)))).filter((n) => !Number.isNaN(n)).sort((a, b) => a - b)
    }

    const hasInvalidBraces = (text?: string | null) => {
      if (!text) return false
      const cleaned = text.replace(/\{\{\d+\}\}/g, '')
      return cleaned.includes('{') || cleaned.includes('}')
    }

    // Fetch variable mappings with examples
    const mappings = await templateVariableService.getMappings(template.userId, template.templateName)

    const findExample = (componentType: string, parameterIndex: number, fallback: string) => {
      const mapping = mappings.find(
        (m) => m.componentType === componentType && m.parameterIndex === parameterIndex
      )
      if (mapping?.variable?.exampleValue) return mapping.variable.exampleValue
      if (mapping?.variable?.name) return `[${mapping.variable.name}]`
      return fallback
    }

    // Basic validation before hitting Meta
    if (hasInvalidBraces(template.content)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Body placeholder harus menggunakan format {{1}}, {{2}}, dan seterusnya'
        }
      }, 400)
    }

    if (template.headerType === 'TEXT' && hasInvalidBraces(template.headerContent)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Header placeholder harus menggunakan format {{1}}, {{2}}, dan seterusnya'
        }
      }, 400)
    }

    // Build template components for Meta API
    const components: any[] = []

    // Header component
    if (template.headerType && template.headerContent) {
      const headerContentTrimmed = template.headerContent.trim()
      if (!headerContentTrimmed) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Header content / sample wajib diisi untuk header media',
          },
        }, 400)
      }
      if (template.headerType !== 'TEXT' && /^https?:\/\//.test(headerContentTrimmed)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Untuk header media, gunakan media_id hasil upload ke WhatsApp Cloud API (bukan URL publik). Upload file dulu lalu pakai media_id-nya sebagai sample.',
          },
        }, 400)
      }
      // Validate media_id for non-text header before submitting to Meta
      let headerExample: any | undefined
      if (template.headerType === 'TEXT') {
        const headerPlaceholders = getPlaceholders(template.headerContent)
        const hasPlaceholder = headerPlaceholders.length > 0
        if (hasPlaceholder) {
          const exampleText = headerPlaceholders.reduce((acc, num) => {
            const placeholder = `{{${num}}}`
            const sample = findExample('header', num, `[Header ${num}]`)
            return acc.replace(placeholder, sample)
          }, template.headerContent)
          headerExample = { header_text: [exampleText] }
        }
      } else {
        try {
          const whatsapp = createWhatsAppApiForAccount(whatsappAccount)
          await whatsapp.getMediaUrl(headerContentTrimmed)
        } catch (err: any) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: 'Media_id header tidak valid untuk WABA ini atau sudah kedaluwarsa. Silakan upload ulang dan gunakan media_id terbaru.',
              details: err?.response?.data,
            },
          }, 400)
        }
        // IMAGE/VIDEO/DOCUMENT must always have sample
        headerExample = { header_handle: [headerContentTrimmed] }
      }

      if (template.headerType !== 'TEXT' && (!headerExample || !headerExample.header_handle || headerExample.header_handle.length === 0)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Media header membutuhkan example URL/media_id',
          },
        }, 400)
      }

      components.push({
        type: 'HEADER',
        format: template.headerType,
        text: template.headerType === 'TEXT' ? template.headerContent : undefined,
        example: headerExample,
      })
    } else if (template.headerType && !template.headerContent) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Header content / sample wajib diisi untuk header media',
        },
      }, 400)
    }

    // Check if this is an AUTHENTICATION template
    const isAuthTemplate = template.category === 'AUTHENTICATION'
    
    if (isAuthTemplate) {
      // =============================================
      // AUTHENTICATION TEMPLATE - Special Meta format
      // =============================================
      // Meta docs: https://developers.facebook.com/docs/whatsapp/business-management-api/authentication-templates
      
      // Parse AUTH-specific fields from buttons array (stored during create)
      const otpButton = Array.isArray(template.buttons) ? template.buttons[0] as any : null
      const addSecurityRecommendation = otpButton?.add_security_recommendation ?? true
      const codeExpirationMinutes = otpButton?.code_expiration_minutes ?? null
      const otpType = otpButton?.otp_type || 'COPY_CODE'
      const copyCodeButtonText = otpButton?.text || undefined
      
      // BODY component for AUTH - NO text field, only add_security_recommendation
      components.push({
        type: 'BODY',
        add_security_recommendation: addSecurityRecommendation,
      })
      
      // FOOTER component for AUTH - only code_expiration_minutes (no text)
      if (codeExpirationMinutes && codeExpirationMinutes > 0) {
        components.push({
          type: 'FOOTER',
          code_expiration_minutes: codeExpirationMinutes,
        })
      }
      
      // BUTTONS component for AUTH - OTP button
      const otpButtonConfig: any = {
        type: 'OTP',
        otp_type: otpType,
      }
      
      // Add button text only for COPY_CODE type
      if (otpType === 'COPY_CODE' && copyCodeButtonText) {
        otpButtonConfig.text = copyCodeButtonText
      }
      
      components.push({
        type: 'BUTTONS',
        buttons: [otpButtonConfig],
      })
    } else {
      // =============================================
      // MARKETING/UTILITY TEMPLATE - Standard format
      // =============================================
      
      // Body component with examples
      const bodyPlaceholders = getPlaceholders(template.content)
      if (bodyPlaceholders.length > 0) {
        const isSequentialBody = bodyPlaceholders.every((num, idx) => num === idx + 1)
        if (!isSequentialBody) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: 'Placeholders di body harus berurutan mulai {{1}} tanpa jeda',
            },
          }, 400)
        }
      }
      const bodyExamples: string[] = []

      if (bodyPlaceholders.length > 0) {
        for (const num of bodyPlaceholders) {
          // Prefer mapping example -> variables array -> fallback placeholder label
          const mappedExample = findExample('body', num, '')

          if (mappedExample) {
            bodyExamples.push(mappedExample)
            continue
          }

          if (Array.isArray(template.variables) && template.variables.length === bodyPlaceholders.length) {
            const variablesArray = template.variables as unknown[]
            const byIndex = variablesArray[num - 1]
            if (typeof byIndex === 'string' && byIndex.trim() !== '') {
              bodyExamples.push(byIndex)
              continue
            }
          }

          bodyExamples.push(`[Variable ${num}]`)
        }
      }

      const bodyExamplePayload =
        bodyExamples.length > 0
          ? { body_text: [bodyExamples] }
          : undefined

      components.push({
        type: 'BODY',
        text: template.content,
        example: bodyExamplePayload,
      })

      // Footer component
      if (template.footerContent) {
        components.push({
          type: 'FOOTER',
          text: template.footerContent
        })
      }

      // Buttons component
      if (template.buttons && Array.isArray(template.buttons) && template.buttons.length > 0) {
        const buttonsWithExamples = template.buttons.map((btn: any, index: number) => {
          if (btn.type === 'URL' && typeof btn.url === 'string' && btn.url.includes('{{1}}')) {
            const example = findExample('button', index, '[link]')
            return {
              ...btn,
              example: [example],
            }
          }
          return btn
        })

        components.push({
          type: 'BUTTONS',
          buttons: buttonsWithExamples,
        })
      }
    }

    // Debug payload sent to Meta (gated by LOG_LEVEL=debug)
    logger.debug('template-submit payload', {
      templateId: template.id,
      name: template.templateName,
      headerType: template.headerType,
      headerContent: template.headerContent,
      components,
    })

    // Submit to Meta using per-account client
    try {
      const whatsapp = createWhatsAppApiForAccount(whatsappAccount)
      const wabaId = credentials.wabaId
      
      const result = await whatsapp.createTemplate({
        wabaId: wabaId,
        name: template.templateName,
        category: template.category,
        language: template.language,
        components
      })

      // Update template with Meta ID
      const updatedTemplate = await prisma.messageTemplate.update({
        where: { id },
        data: {
          metaTemplateId: result.id,
          status: 'PENDING',
          submittedAt: new Date()
        }
      })

      // Audit log
      await auditLog(
        'TEMPLATE_SUBMITTED',
        'MessageTemplate',
        id,
        {
          metaTemplateId: result.id,
          submittedBy: c.user?.id
        },
        c.user?.id
      )

      return c.json({
        success: true,
        data: updatedTemplate,
        meta: result
      })
    } catch (metaError: any) {
      logger.error('Meta API error during template submit', {
        templateId: id,
        error: extractAxiosError(metaError),
      })

      const metaErr = metaError.response?.data?.error
      const invalidMediaHandle = metaErr?.code === 131009 && metaErr?.error_subcode === 2494102

      // If media handle is invalid/expired, surface a clearer message and do NOT mark template rejected
      if (invalidMediaHandle) {
        return c.json({
          error: {
            code: 'InvalidMediaHandle',
            message: 'Header media_id tidak valid atau sudah kedaluwarsa. Silakan upload ulang media header di Template Media Upload, gunakan media_id baru, lalu submit lagi.',
            details: metaErr,
          },
        }, 400)
      }

      // Update template status to rejected for other Meta errors
      await prisma.messageTemplate.updateMany({
        where: { id },
        data: {
          status: 'REJECTED',
          rejectionReason: metaErr?.message || 'Submission failed'
        }
      })

      return c.json({
        error: {
          code: 'MetaAPIError',
          message: metaErr?.message || 'Failed to submit template to Meta',
          details: metaError.response?.data
        }
      }, 400)
    }
  } catch (error) {
    logger.error('Submit template error', { error: extractAxiosError(error) })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to submit template'
      }
    }, 500)
  }
})

export default app
