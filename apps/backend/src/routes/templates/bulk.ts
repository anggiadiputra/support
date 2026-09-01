/**
 * Bulk Template Send Routes
 * 
 * API endpoints for bulk template message sending:
 * - POST /bulk/send - Create and start bulk send job
 * - GET /bulk/:id - Get bulk send job status
 * - POST /bulk/:id/cancel - Cancel bulk send job
 * - GET /bulk - Get bulk send history
 * 
 * Base Path: /api/v1/templates/bulk
 * 
 * Requirements: 11.1, 11.6, 11.7
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../../utils/database.js'
import { bulkTemplateSendService, BULK_SEND_ERROR_CODES, type CsvRow } from '../../services/bulk-template-send-service.js'
import { templateVariableService } from '../../services/template-variable-service.js'
import { getEffectiveUserId, getActingAgentId } from '../../middleware/resolveContext.js'
import { resolveContext } from '../../middleware/resolveContext.js'
import { auditLog } from '../../utils/auditLog.js'
import { logger } from '../../utils/logger.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { resolveCredentialsForSending } from '../../utils/whatsapp-account-helper.js'
import { broadcastQueue } from '../../utils/queue.js'

const app = new Hono()

// Apply context resolution middleware to all routes
// This ensures agents can access their business owner's bulk send jobs
app.use('*', resolveContext)

/**
 * Validation schemas
 */
const createBulkSendSchema = z.object({
  templateName: z.string().min(1, 'Template name is required'),
  languageCode: z.string().min(1, 'Language code is required'),
  csvData: z.array(z.record(z.string(), z.string())).min(1, 'CSV data is required')
})

/**
 * Parse pagination parameters from query string
 */
function parsePagination(query: Record<string, string | undefined>): { page: number; limit: number } {
  const page = Math.max(1, parseInt(query.page || '1', 10) || 1)
  const limit = Math.min(Math.max(1, parseInt(query.limit || '20', 10) || 20), 100)
  return { page, limit }
}

/**
 * POST /api/v1/templates/bulk/send
 * Create and start a bulk send job
 * 
 * Body:
 * - templateName: string (required) - WhatsApp template name
 * - languageCode: string (required) - Template language code
 * - csvData: CsvRow[] (required) - Array of CSV rows with phoneNumber and variables
 * 
 * Returns: Created bulk send job
 * 
 * Requirements: 11.1, 11.2, 11.3
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
    const validation = createBulkSendSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { templateName, languageCode, csvData } = validation.data

    // Verify user has WABA connected
    const credentials = await resolveCredentialsForSending(userId)

    if (!credentials) {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'WhatsApp Business Account not connected or configuration incomplete'
        }
      }, 400)
    }

    // Verify template exists and is approved
    const template = await prisma.messageTemplate.findFirst({
      where: {
        userId,
        templateName,
        language: languageCode,
        status: 'APPROVED'
      }
    })

    if (!template) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Template not found or not approved'
        }
      }, 404)
    }

    // Get variable mappings to determine required variables
    const mappings = await templateVariableService.getMappings(userId, templateName)
    const requiredVariables = mappings.map(m => m.variable.name)

    // Validate CSV data
    const csvValidation = bulkTemplateSendService.validateCsvData(
      csvData as CsvRow[],
      requiredVariables
    )

    if (!csvValidation.valid) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'CSV data validation failed',
          details: {
            errors: csvValidation.errors,
            totalRows: csvValidation.totalRows,
            validRows: csvValidation.validRows
          }
        }
      }, 400)
    }

    // Create bulk send job
    const job = await bulkTemplateSendService.createBulkSend(userId, {
      templateName,
      languageCode,
      csvData: csvData as CsvRow[]
    })

    // Audit log
    await auditLog(
      'BULK_SEND_CREATED',
      'BulkTemplateSend',
      job.id,
      {
        templateName,
        languageCode,
        totalRecipients: job.totalRecipients,
        createdBy: c.user?.id,
        actingAgentId
      },
      c.user?.id
    )

    logger.info('Bulk send job created via API', {
      jobId: job.id,
      userId,
      templateName,
      totalRecipients: job.totalRecipients
    })

    // Add to queue for processing (supports concurrent broadcasts per account)
    await broadcastQueue.add(
      'new-broadcast',
      {
        type: 'new',
        jobId: job.id,
        userId,
        messageDelayMs: 1000,
        senderPhoneNumberId: undefined, // Legacy API doesn't have phoneNumberId
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
    logger.error('Create bulk send error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to create bulk send job'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/templates/bulk/:id
 * Get bulk send job status
 * 
 * Params:
 * - id: string (required) - Bulk send job ID
 * 
 * Returns: Bulk send job with status and results
 * 
 * Requirements: 11.6
 */
app.get('/:id', async (c: Context) => {
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
          message: 'Bulk send job not found'
        }
      }, 404)
    }

    logger.error('Get bulk send status error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get bulk send status'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/templates/bulk/:id/cancel
 * Cancel a bulk send job
 * 
 * Params:
 * - id: string (required) - Bulk send job ID
 * 
 * Returns: Success status
 * 
 * Requirements: 11.6
 */
app.post('/:id/cancel', async (c: Context) => {
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
      'BULK_SEND_CANCELLED',
      'BulkTemplateSend',
      jobId,
      {
        cancelledBy: c.user?.id,
        actingAgentId
      },
      c.user?.id
    )

    logger.info('Bulk send job cancelled via API', {
      jobId,
      userId
    })

    return c.json({
      success: true,
      message: 'Bulk send job cancelled'
    })
  } catch (error: any) {
    if (error.message === BULK_SEND_ERROR_CODES.JOB_NOT_FOUND) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Bulk send job not found'
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

    logger.error('Cancel bulk send error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to cancel bulk send job'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/templates/bulk
 * Get bulk send history for the user
 * 
 * Query:
 * - page: number (optional, default: 1) - Page number
 * - limit: number (optional, default: 20) - Items per page
 * 
 * Returns: Paginated list of bulk send jobs
 * 
 * Requirements: 11.7
 */
app.get('/', async (c: Context) => {
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

    // Parse pagination params
    const { page, limit } = parsePagination(c.req.query())

    const result = await bulkTemplateSendService.getBulkSendHistory(userId, page, limit)

    return c.json({
      success: true,
      data: result.data,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.ceil(result.total / limit)
      }
    })
  } catch (error: any) {
    logger.error('Get bulk send history error', { error: error.message })
    
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get bulk send history'
      }
    }, 500)
  }
})

export default app
