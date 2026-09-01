/**
 * Broadcast Routes
 * 
 * API endpoints for broadcast message sending:
 * - POST /send - Create and start broadcast job
 * - GET /jobs - Get broadcast jobs list
 * - GET /jobs/:id - Get broadcast job detail
 * - POST /jobs/:id/cancel - Cancel broadcast job
 * 
 * Base Path: /api/v1/broadcast
 * 
 * Requirements: 1.1, 6.1, 6.2
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { bulkTemplateSendService, BULK_SEND_ERROR_CODES, type CsvRow, type RecipientResult } from '../../services/bulk-template-send-service.js'
import { broadcastQueue } from '../../utils/queue.js'
import { isValidBsuid } from '../../types/whatsapp-bsuid.js'
import { validateRecipient } from '../../utils/recipient-validator.js'
import { getEffectiveUserId, getActingAgentId } from '../../middleware/resolveContext.js'
import { resolveContext } from '../../middleware/resolveContext.js'
import { auditLog } from '../../utils/auditLog.js'
import { logger } from '../../utils/logger.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { resolveCredentialsForSending, getWhatsAppAccountByPhoneNumberId, resolveCredentialsByPhoneNumber } from '../../utils/whatsapp-account-helper.js'

const app = new Hono()

// Apply context resolution middleware to all routes
app.use('*', resolveContext)

/**
 * Validation schemas
 */
const createBroadcastSchema = z.object({
  templateName: z.string().min(1, 'Template name is required'),
  languageCode: z.string().min(1, 'Language code is required'),
  variableValues: z.record(z.string(), z.string()).optional().default({}),
  recipientSource: z.enum(['customers', 'csv']),
  customerIds: z.array(z.string()).optional(),
  phoneNumbers: z.array(z.string()).optional(),
  // CSV data with per-row variables (sent directly from frontend for hybrid CSV+manual mode)
  csvData: z.array(z.record(z.string(), z.string())).optional(),
  phoneNumberId: z.string().optional(), // Selected sender phone number (multi-number support)
  messageDelayMs: z.number().min(0).max(30000).optional().default(1000), // 0-30 seconds, default 1s
}).refine(
  (data) => {
    if (data.recipientSource === 'customers') {
      return data.customerIds && data.customerIds.length > 0
    }
    if (data.recipientSource === 'csv') {
      // Accept either phoneNumbers OR csvData (with per-row variables)
      return (data.phoneNumbers && data.phoneNumbers.length > 0) || 
             (data.csvData && data.csvData.length > 0)
    }
    return false
  },
  {
    message: 'customerIds required for customers source, phoneNumbers or csvData required for csv source'
  }
)

/**
 * Parse pagination parameters from query string
 */
function parsePagination(query: Record<string, string | undefined>): { page: number; limit: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
  const limit = Math.min(Math.max(1, parseInt(query.limit || '20', 10) || 20), 100)
  return { page, limit }
}


/**
 * POST /api/v1/broadcast/send
 * Create and start a broadcast job
 * 
 * Body:
 * - templateName: string (required) - WhatsApp template name
 * - languageCode: string (required) - Template language code
 * - variableValues: Record<string, string> (optional) - Variable values for all recipients
 * - recipientSource: 'customers' | 'csv' (required) - Source of recipients
 * - customerIds: string[] (required if recipientSource='customers') - Customer IDs
 * - phoneNumbers: string[] (required if recipientSource='csv') - Phone numbers
 * 
 * Returns: Created broadcast job
 * 
 * Requirements: 1.1, 6.1
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
    const validation = createBroadcastSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { templateName, languageCode, variableValues, recipientSource, customerIds, phoneNumbers, csvData: directCsvData, phoneNumberId } = validation.data

    // Resolve credentials: use selected phone number if provided, otherwise fallback
    let credentials = null
    if (phoneNumberId) {
      const phoneNumberRecord = await getWhatsAppAccountByPhoneNumberId(phoneNumberId)
      if (phoneNumberRecord && phoneNumberRecord.userId === userId) {
        credentials = await resolveCredentialsByPhoneNumber(phoneNumberRecord)
      }
    }
    if (!credentials) {
      credentials = await resolveCredentialsForSending(userId)
    }

    if (!credentials) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'WhatsApp Business Account not connected or no phone number available'
        }
      }, 400)
    }

    // Verify template exists and is approved (filter by account if known)
    const templateWhere: any = {
      userId,
      templateName,
      language: languageCode,
      status: 'APPROVED'
    }
    if (credentials.whatsappAccountId) {
      templateWhere.whatsappAccountId = credentials.whatsappAccountId
    }
    const template = await prisma.messageTemplate.findFirst({
      where: templateWhere
    })

    if (!template) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Template not found or not approved'
        }
      }, 404)
    }

    // Build CSV data based on recipient source
    let csvData: CsvRow[] = []

    if (recipientSource === 'customers' && customerIds) {
      // Build filter — marketingOptOut only applies for MARKETING category
      // templates (Meta policy: utility / authentication still allowed).
      const broadcastWhere: any = {
        id: { in: customerIds },
        userId,
        consentStatus: true,
        blacklisted: false,
      }
      if ((template.category || '').toUpperCase() === 'MARKETING') {
        broadcastWhere.marketingOptOut = false
      }

      // Get customers and extract phone numbers with additional fields for personalization
      const customers = await prisma.customer.findMany({
        where: broadcastWhere,
        select: {
          id: true,
          phoneNumber: true,
          name: true,
          email: true,
          tags: true,
          leadScore: true,
          notes: true,
          instagramUsername: true,
          // BSUID passthrough for correct routing in bulk-template-send-service.
          // Handles customers where phoneNumber column holds a BSUID string
          // (BSUID-only customers workaround).
          whatsappBsuid: true,
          whatsappUsername: true,
        }
      })

      if (customers.length === 0) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'No eligible customers found'
          }
        }, 400)
      }

      // Build CSV data with customer fields and resolve placeholders
      csvData = customers.map(customer => {
        // Detect BSUID-workaround rows so we don't leak BSUID strings into
        // customer_phone placeholder (would render "US.134..." as a phone).
        const phoneNumberIsBsuid = isValidBsuid(customer.phoneNumber)
        const realPhone = phoneNumberIsBsuid ? '' : (customer.phoneNumber || '')

        // Start with customer data fields (for placeholder resolution)
        const customerFields: Record<string, string> = {
          customer_name: customer.name || '',
          customer_email: customer.email || '',
          customer_phone: realPhone,
          customer_tags: customer.tags?.join(', ') || '',
          customer_lead_score: customer.leadScore?.toString() || '0',
          customer_instagram: customer.instagramUsername || '',
        }

        // Process variable values - resolve any {customer_*} placeholders
        const resolvedVariables: Record<string, string> = {}
        for (const [key, value] of Object.entries(variableValues)) {
          let resolvedValue = value
          // Replace {customer_*} placeholders with actual customer data
          for (const [fieldKey, fieldValue] of Object.entries(customerFields)) {
            resolvedValue = resolvedValue.replace(new RegExp(`\\{${fieldKey}\\}`, 'gi'), fieldValue)
          }
          resolvedVariables[key] = resolvedValue
        }

        return {
          phoneNumber: customer.phoneNumber,
          // Internal passthrough — read by bulk-template-send-service to route
          // via getSendTarget (handles BSUID-in-phone workaround and real BSUID).
          __whatsappBsuid: customer.whatsappBsuid ?? '',
          __customerId: customer.id,
          ...resolvedVariables,
          // Also include raw customer fields for potential direct use
          __customer_name: customer.name || '',
          __customer_email: customer.email || '',
        }
      })
    } else if (recipientSource === 'csv') {
      // Check if we have direct csvData (with per-row variables from frontend)
      if (directCsvData && directCsvData.length > 0) {
        // Use csvData directly from frontend (already contains per-row variables)
        // Validate phone numbers in csvData
        const validRows: CsvRow[] = []
        const invalidPhones: string[] = []

        for (const row of directCsvData) {
          // Accept EITHER phoneNumber column OR bsuid column.
          // Username is NOT supported as CSV input — Meta only accepts `to`
          // (phone) or `recipient` (BSUID / parent BSUID). Username is only
          // useful for internal display / customer lookup.
          const rowPhone = row.phoneNumber
          const rowBsuid = (row as any).bsuid || (row as any).whatsapp_bsuid || ''

          // Priority: explicit BSUID column wins if provided
          const rawInput = String(rowBsuid || rowPhone || '').trim()
          if (!rawInput) {
            invalidPhones.push('(empty)')
            continue
          }

          const validated = validateRecipient(rawInput)

          if (validated.kind === 'phone') {
            validRows.push({ ...row, phoneNumber: validated.value })
          } else if (validated.kind === 'bsuid') {
            // Route via BSUID. Store BSUID in phoneNumber slot (workaround
            // consistent with rest of codebase) and flag via __whatsappBsuid
            // so bulk-template-send-service can call getSendTarget correctly.
            validRows.push({
              ...row,
              phoneNumber: validated.value,
              __whatsappBsuid: validated.value,
            })
          } else {
            invalidPhones.push(rawInput)
          }
        }

        if (invalidPhones.length > 0) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: `Recipient tidak valid. Gunakan nomor telepon E.164 (+6281234567890) atau BSUID (US.13491...)`,
              details: {
                invalidPhones: invalidPhones.slice(0, 10),
                totalInvalid: invalidPhones.length,
                hint: 'CSV boleh punya kolom phoneNumber (E.164) atau bsuid (BSUID WhatsApp).'
              }
            }
          }, 400)
        }

        if (validRows.length === 0) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: 'Tidak ada nomor telepon yang valid dalam csvData'
            }
          }, 400)
        }

        csvData = validRows
      } else if (phoneNumbers && phoneNumbers.length > 0) {
        // Fallback: use phoneNumbers array with variableValues (legacy behavior).
        // Also accept BSUIDs in this array — same routing as CSV path.
        const validRecipients: Array<{ phoneNumber: string; isBsuid: boolean }> = []
        const invalidPhones: string[] = []

        for (const phone of phoneNumbers) {
          const validated = validateRecipient(phone)
          if (validated.kind === 'phone') {
            validRecipients.push({ phoneNumber: validated.value, isBsuid: false })
          } else if (validated.kind === 'bsuid') {
            validRecipients.push({ phoneNumber: validated.value, isBsuid: true })
          } else {
            invalidPhones.push(phone)
          }
        }

        // Reject if ANY recipient is invalid
        if (invalidPhones.length > 0) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: `Recipient tidak valid. Gunakan nomor telepon E.164 (+6281234567890) atau BSUID (US.13491...)`,
              details: {
                invalidPhones: invalidPhones.slice(0, 10),
                totalInvalid: invalidPhones.length,
                hint: 'Pastikan semua nomor E.164 diawali + dan kode negara, atau berikan BSUID (format US.xxxxx).'
              }
            }
          }, 400)
        }

        if (validRecipients.length === 0) {
          return c.json({
            error: {
              code: 'ValidationError',
              message: 'Tidak ada recipient yang valid.'
            }
          }, 400)
        }

        csvData = validRecipients.map(r => ({
          phoneNumber: r.phoneNumber,
          ...(r.isBsuid && { __whatsappBsuid: r.phoneNumber }),
          ...variableValues
        }))
      }
    }

    // Create bulk send job
    const job = await bulkTemplateSendService.createBulkSend(userId, {
      templateName,
      languageCode,
      csvData,
      messageDelayMs: validation.data.messageDelayMs,
      senderPhoneNumberId: credentials.phoneNumberId
    })

    // Audit log
    await auditLog(
      'BROADCAST_CREATED',
      'BulkTemplateSend',
      job.id,
      {
        templateName,
        languageCode,
        recipientSource,
        totalRecipients: job.totalRecipients,
        createdBy: (c as any).user?.id,
        actingAgentId
      },
      (c as any).user?.id
    )

    logger.info('Broadcast job created via API', {
      jobId: job.id,
      userId,
      templateName,
      recipientSource,
      totalRecipients: job.totalRecipients
    })

    // Add to queue for processing (supports concurrent broadcasts per account)
    const delayMs = job.messageDelayMs || validation.data.messageDelayMs || 1000
    await broadcastQueue.add(
      'new-broadcast',
      {
        type: 'new',
        jobId: job.id,
        userId,
        messageDelayMs: delayMs,
        senderPhoneNumberId: credentials.phoneNumberId,
      },
      {
        jobId: `broadcast-${job.id}`,
      }
    )

    return c.json({
      success: true,
      data: job
    }, 201)
  } catch (error: any) {
    logger.error('Create broadcast error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to create broadcast job'
      }
    }, 500)
  }
})


/**
 * GET /api/v1/broadcast/jobs
 * Get broadcast jobs list with pagination
 * 
 * Query:
 * - page: number (optional, default: 1) - Page number
 * - limit: number (optional, default: 20) - Items per page
 * - status: string (optional) - Filter by status (PENDING, PROCESSING, COMPLETED, FAILED, CANCELLED)
 * 
 * Returns: Paginated list of broadcast jobs
 * 
 * Requirements: 6.1, 6.2
 */
app.get('/jobs', async (c: Context) => {
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

    const { page, limit } = parsePagination(c.req.query())
    // Support multiple status values: ?status=PENDING&status=PROCESSING
    const statuses = c.req.queries('status')

    // Build where clause
    const where: any = { userId }
    if (statuses && statuses.length > 0) {
      // Filter out empty strings and use IN clause for multiple statuses
      const validStatuses = statuses.filter((s: string) => s && s.trim())
      if (validStatuses.length === 1) {
        where.status = validStatuses[0]
      } else if (validStatuses.length > 1) {
        where.status = { in: validStatuses }
      }
    }

    const [jobs, total] = await Promise.all([
      prisma.bulkTemplateSend.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          templateName: true,
          status: true,
          totalRecipients: true,
          successCount: true,
          failedCount: true,
          sentCount: true,
          deliveredCount: true,
          readCount: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true
        }
      }),
      prisma.bulkTemplateSend.count({ where })
    ])

    return c.json({
      success: true,
      data: jobs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error: any) {
    logger.error('Get broadcast jobs error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get broadcast jobs'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/broadcast/jobs/:id
 * Get broadcast job detail
 * 
 * Params:
 * - id: string (required) - Broadcast job ID
 * 
 * Returns: Broadcast job with status and results
 * 
 * Requirements: 6.1, 6.2
 */
app.get('/jobs/:id', async (c: Context) => {
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

    const jobId = c.req.param('id')

    if (!jobId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Job ID is required'
        }
      }, 400)
    }

    const job = await bulkTemplateSendService.getBulkSendStatus(jobId, userId)

    return c.json({
      success: true,
      data: job
    })
  } catch (error: any) {
    if (error.message === BULK_SEND_ERROR_CODES.JOB_NOT_FOUND) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Broadcast job not found'
        }
      }, 404)
    }

    logger.error('Get broadcast job detail error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get broadcast job detail'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/broadcast/jobs/:id/cancel
 * Cancel a broadcast job
 * 
 * Params:
 * - id: string (required) - Broadcast job ID
 * 
 * Returns: Success status
 * 
 * Requirements: 6.2
 */
app.post('/jobs/:id/cancel', async (c: Context) => {
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

    const jobId = c.req.param('id')

    if (!jobId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Job ID is required'
        }
      }, 400)
    }

    await bulkTemplateSendService.cancelBulkSend(jobId, userId)

    // Audit log
    await auditLog(
      'BROADCAST_CANCELLED',
      'BulkTemplateSend',
      jobId,
      {
        cancelledBy: (c as any).user?.id,
        actingAgentId
      },
      (c as any).user?.id
    )

    logger.info('Broadcast job cancelled via API', {
      jobId,
      userId
    })

    return c.json({
      success: true,
      message: 'Broadcast job cancelled'
    })
  } catch (error: any) {
    if (error.message === BULK_SEND_ERROR_CODES.JOB_NOT_FOUND) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Broadcast job not found'
        }
      }, 404)
    }

    if (error.message === BULK_SEND_ERROR_CODES.JOB_CANNOT_CANCEL) {
      return c.json({
        error: {
          code: 'InvalidOperation',
          message: 'Cannot cancel job with current status. Only PENDING or PROCESSING jobs can be cancelled.'
        }
      }, 400)
    }

    logger.error('Cancel broadcast error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to cancel broadcast job'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/broadcast/jobs/stuck
 * Get user's stuck broadcast jobs that need recovery
 * 
 * A job is considered stuck if:
 * - Status is PROCESSING
 * - Last heartbeat > 5 minutes ago OR no heartbeat (legacy job)
 * 
 * Returns: List of stuck broadcast jobs with recovery info
 */
app.get('/stuck', async (c: Context) => {
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

    const cutoffTime = new Date(Date.now() - 5 * 60 * 1000) // 5 minutes ago

    const stuckJobs = await prisma.bulkTemplateSend.findMany({
      where: {
        userId,
        status: 'PROCESSING',
        OR: [
          { lastHeartbeat: { lt: cutoffTime } },
          { lastHeartbeat: null }, // Legacy jobs without heartbeat
        ],
      },
      select: {
        id: true,
        templateName: true,
        status: true,
        totalRecipients: true,
        successCount: true,
        failedCount: true,
        lastProcessedIndex: true,
        lastHeartbeat: true,
        results: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    })

    // Calculate progress info for each stuck job
    const jobsWithProgress = stuckJobs.map(job => {
      // For legacy jobs, calculate processed count from results
      let processedCount = job.lastProcessedIndex || 0
      if (!job.lastProcessedIndex && job.results) {
        const results = job.results as unknown as RecipientResult[]
        if (Array.isArray(results)) {
          processedCount = results.length
        }
      }

      const remainingCount = job.totalRecipients - processedCount
      const progressPercent = job.totalRecipients > 0 
        ? Math.round((processedCount / job.totalRecipients) * 100) 
        : 0

      return {
        id: job.id,
        templateName: job.templateName,
        status: job.status,
        totalRecipients: job.totalRecipients,
        processedCount,
        remainingCount,
        progressPercent,
        successCount: job.successCount,
        failedCount: job.failedCount,
        lastHeartbeat: job.lastHeartbeat,
        isLegacyJob: !job.lastProcessedIndex && !job.lastHeartbeat,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }
    })

    return c.json({
      success: true,
      data: jobsWithProgress,
      total: jobsWithProgress.length,
    })
  } catch (error: any) {
    logger.error('Get stuck broadcasts error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get stuck broadcasts'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/broadcast/jobs/:id/resume
 * Manually resume a stuck broadcast job
 * 
 * Params:
 * - id: string (required) - Broadcast job ID
 * 
 * Returns: Success status with job info
 */
app.post('/jobs/:id/resume', async (c: Context) => {
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

    const jobId = c.req.param('id')

    if (!jobId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Job ID is required'
        }
      }, 400)
    }

    // Verify job belongs to user and is in PROCESSING status
    const job = await prisma.bulkTemplateSend.findFirst({
      where: { id: jobId, userId },
      select: {
        id: true,
        status: true,
        totalRecipients: true,
        lastProcessedIndex: true,
        results: true,
      }
    })

    if (!job) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Broadcast job not found'
        }
      }, 404)
    }

    if (job.status !== 'PROCESSING') {
      return c.json({
        error: {
          code: 'InvalidOperation',
          message: `Cannot resume job with status ${job.status}. Only PROCESSING jobs can be resumed.`
        }
      }, 400)
    }

    // Check if job is already in queue
    const existingJobs = await broadcastQueue.getJobs(['waiting', 'active', 'delayed'])
    const alreadyQueued = existingJobs.some(
      (queueJob) => queueJob.data.jobId === jobId && queueJob.data.type === 'resume'
    )

    if (alreadyQueued) {
      return c.json({
        error: {
          code: 'AlreadyQueued',
          message: 'This broadcast is already queued for recovery'
        }
      }, 400)
    }

    // Calculate progress for response
    let processedCount = job.lastProcessedIndex || 0
    if (!job.lastProcessedIndex && job.results) {
      const results = job.results as unknown as RecipientResult[]
      if (Array.isArray(results)) {
        processedCount = results.length
      }
    }
    const remainingCount = job.totalRecipients - processedCount

    // Add to queue for resumption
    await broadcastQueue.add(
      'resume-broadcast',
      {
        type: 'resume',
        jobId,
      },
      {
        jobId: `resume-${jobId}-${Date.now()}`, // Unique ID
      }
    )

    // Audit log
    await auditLog(
      'BROADCAST_RESUMED',
      'BulkTemplateSend',
      jobId,
      {
        resumedBy: (c as any).user?.id,
        actingAgentId,
        processedCount,
        remainingCount,
      },
      (c as any).user?.id
    )

    logger.info('Broadcast job queued for resume via API', {
      jobId,
      userId,
      processedCount,
      remainingCount,
    })

    return c.json({
      success: true,
      message: 'Broadcast job queued for recovery',
      data: {
        jobId,
        processedCount,
        remainingCount,
        totalRecipients: job.totalRecipients,
      }
    })
  } catch (error: any) {
    logger.error('Resume broadcast error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to resume broadcast job'
      }
    }, 500)
  }
})

export default app
