/**
 * Bulk Template Send Service
 * 
 * Handles bulk sending of template messages to multiple recipients.
 * Supports CSV data parsing, validation, batch processing, and progress tracking.
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7
 */

import { prisma } from '../utils/database.js';
import WhatsAppAPI from '../utils/whatsapp.js';
import { templateRendererService, type WhatsAppTemplate, type WhatsAppTemplateComponent } from './template-renderer-service.js';
import { templateValidatorService } from './template-validator-service.js';
import { templateVariableService } from './template-variable-service.js';
import { WhatsAppErrorService } from './whatsapp-error-service.js';
import { AuditLogService } from './audit-log-service.js';
import { logger, extractAxiosError } from '../utils/logger.js';
import { resolveCredentialsForSending, getWhatsAppAccountByPhoneNumberId, resolveCredentialsByPhoneNumber } from '../utils/whatsapp-account-helper.js';
import { normalizePhoneNumber } from '../utils/validation.js';
import { getSendTarget } from '../utils/customer-lookup.js';
import { isValidBsuid } from '../types/whatsapp-bsuid.js';
import type { BulkSendStatus, TemplateVariable, TemplateVariableMapping } from '@prisma/client';

/**
 * Error codes for bulk send operations
 */
export const BULK_SEND_ERROR_CODES = {
  JOB_NOT_FOUND: 'JOB_NOT_FOUND',
  INVALID_CSV: 'INVALID_CSV',
  MISSING_COLUMNS: 'MISSING_COLUMNS',
  INVALID_PHONE_NUMBER: 'INVALID_PHONE_NUMBER',
  MISSING_VARIABLE: 'MISSING_VARIABLE',
  JOB_ALREADY_PROCESSING: 'JOB_ALREADY_PROCESSING',
  JOB_CANNOT_CANCEL: 'JOB_CANNOT_CANCEL',
  CONFIGURATION_ERROR: 'CONFIGURATION_ERROR',
} as const;

/**
 * Batch size for processing recipients
 */
const BATCH_SIZE = 50;

/**
 * Rate limit delay between batches (ms)
 */
const BATCH_DELAY_MS = 1000;

/**
 * CSV row data structure
 */
export interface CsvRow {
  phoneNumber: string;
  [variableName: string]: string;
}

/**
 * CSV validation error
 */
export interface CsvValidationError {
  row: number;
  column?: string;
  error: string;
  errorCode: string;
}

/**
 * CSV validation result
 */
export interface CsvValidationResult {
  valid: boolean;
  errors: CsvValidationError[];
  totalRows: number;
  validRows: number;
}

/**
 * Bulk send creation DTO
 */
export interface CreateBulkSendDto {
  templateName: string;
  languageCode: string;
  csvData: CsvRow[];
  messageDelayMs?: number;
  senderPhoneNumberId?: string; // Selected sender phone number (multi-number support)
}

/**
 * Recipient send result
 */
export interface RecipientResult {
  phoneNumber: string;
  success: boolean;
  messageId?: string;
  error?: string;
  errorCode?: string;
  // Message delivery status from webhook (sent/delivered/read/failed)
  status?: 'sent' | 'delivered' | 'read' | 'failed';
  // Debug info for troubleshooting
  sentPayload?: any;
  whatsappErrorResponse?: any;
  timestamp?: string;
}

/**
 * Bulk send job with results
 */
export interface BulkSendJob {
  id: string;
  userId: string;
  templateName: string;
  status: BulkSendStatus;
  totalRecipients: number;
  successCount: number;
  failedCount: number;
  sentCount: number;
  deliveredCount: number;
  readCount: number;
  csvData: CsvRow[];
  results: RecipientResult[] | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

/**
 * BulkTemplateSendService
 * 
 * Handles bulk template message sending with:
 * - Job creation and management
 * - CSV validation and parsing
 * - Batch processing with rate limiting
 * - Progress tracking
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.5, 11.6, 11.7
 */
export class BulkTemplateSendService {
  // ============================================
  // Job Management (Requirements: 11.1, 11.6)
  // ============================================

  /**
   * Create a new bulk send job
   * 
   * @param userId - User ID
   * @param data - Bulk send creation data
   * @returns Created job
   * 
   * Requirements: 11.1
   */
  async createBulkSend(userId: string, data: CreateBulkSendDto): Promise<BulkSendJob & { messageDelayMs?: number }> {
    const job = await prisma.bulkTemplateSend.create({
      data: {
        userId,
        templateName: data.templateName,
        status: 'PENDING',
        totalRecipients: data.csvData.length,
        csvData: data.csvData as any,
        results: null,
      },
    });

    logger.info('Bulk send job created', {
      jobId: job.id,
      userId,
      templateName: data.templateName,
      totalRecipients: data.csvData.length,
      messageDelayMs: data.messageDelayMs,
    });

    return {
      ...this.mapToJob(job),
      messageDelayMs: data.messageDelayMs
    };
  }

  /**
   * Get phone numbers from customer IDs
   * Filters for consented and non-blacklisted customers only
   * 
   * @param userId - User ID
   * @param customerIds - Array of customer IDs
   * @returns Array of CsvRow with phone numbers
   * 
   * Requirements: 4.1, 6.1
   */
  async getPhoneNumbersFromCustomers(
    userId: string,
    customerIds: string[],
    variableValues: Record<string, string> = {},
    templateCategory?: string
  ): Promise<CsvRow[]> {
    const where: any = {
      id: { in: customerIds },
      userId,
      consentStatus: true,
      blacklisted: false,
    };
    // Only filter out marketing-opted-out customers when sending MARKETING
    // category templates (per Meta policy — utility/auth still allowed).
    if ((templateCategory || '').toUpperCase() === 'MARKETING') {
      where.marketingOptOut = false;
    }
    const customers = await prisma.customer.findMany({
      where,
      select: {
        id: true,
        phoneNumber: true
      }
    });

    logger.info('Fetched eligible customers for broadcast', {
      userId,
      requestedCount: customerIds.length,
      eligibleCount: customers.length
    });

    return customers.map(customer => ({
      phoneNumber: customer.phoneNumber,
      ...variableValues
    }));
  }

  /**
   * Get bulk send job status
   * 
   * @param jobId - Job ID
   * @param userId - User ID for authorization
   * @returns Job status
   * 
   * Requirements: 11.6
   */
  async getBulkSendStatus(jobId: string, userId: string): Promise<BulkSendJob> {
    const job = await prisma.bulkTemplateSend.findFirst({
      where: { id: jobId, userId },
      include: {
        messages: {
          select: {
            wamId: true,
            status: true,
            errorCode: true,
            errorMessage: true,
          },
        },
      },
    });

    if (!job) {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_NOT_FOUND);
    }

    // Create a map of wamId to message info (status + error details)
    const messageInfoMap = new Map<string, { 
      status: string; 
      errorCode?: string | null; 
      errorMessage?: string | null;
    }>();
    for (const msg of job.messages || []) {
      if (msg.wamId) {
        messageInfoMap.set(msg.wamId, {
          status: msg.status.toLowerCase(),
          errorCode: msg.errorCode,
          errorMessage: msg.errorMessage,
        });
      }
    }

    // Enrich results with status and error info from messages
    const results = (job.results as unknown) as RecipientResult[] | null;
    const enrichedResults = results?.map((result) => {
      if (result.success && result.messageId) {
        const msgInfo = messageInfoMap.get(result.messageId);
        if (msgInfo) {
          // If message failed via webhook, include error details from Message table
          if (msgInfo.status === 'failed') {
            return {
              ...result,
              status: 'failed' as const,
              // Prefer error from Message table (webhook), fallback to original result error
              errorCode: msgInfo.errorCode || result.errorCode,
              error: msgInfo.errorMessage || result.error,
            };
          }
          return {
            ...result,
            status: msgInfo.status as 'sent' | 'delivered' | 'read',
          };
        }
      }
      // For failed results (failed at API call time), keep original error info
      if (!result.success) {
        return {
          ...result,
          status: 'failed' as const,
        };
      }
      return result;
    }) || null;

    // Calculate accurate counts from actual message statuses (not from stored counters)
    // This ensures consistency between summary cards and detailed results
    // 
    // Counter logic (cumulative - matches webhook increment behavior):
    // - sentCount: messages that reached at least "sent" status (includes delivered & read)
    // - deliveredCount: messages that reached at least "delivered" status (includes read)
    // - readCount: messages that reached "read" status
    // - failedCount: messages that failed to send
    let computedSentCount = 0;
    let computedDeliveredCount = 0;
    let computedReadCount = 0;
    let computedFailedCount = 0;

    if (enrichedResults) {
      for (const result of enrichedResults) {
        if (!result.success || result.status === 'failed') {
          computedFailedCount++;
        } else {
          // Status follows progression: sent -> delivered -> read
          // Counters are cumulative (same as webhook behavior)
          const status = result.status || 'sent';
          switch (status) {
            case 'read':
              computedReadCount++;
              computedDeliveredCount++;
              computedSentCount++;
              break;
            case 'delivered':
              computedDeliveredCount++;
              computedSentCount++;
              break;
            case 'sent':
            default:
              computedSentCount++;
              break;
          }
        }
      }
    }

    // Return job with computed counts for accuracy
    return this.mapToJob({
      ...job,
      results: enrichedResults,
      // Override stored counters with computed values for consistency
      sentCount: computedSentCount,
      deliveredCount: computedDeliveredCount,
      readCount: computedReadCount,
      failedCount: computedFailedCount,
    });
  }

  /**
   * Cancel a bulk send job
   * 
   * @param jobId - Job ID
   * @param userId - User ID for authorization
   * 
   * Requirements: 11.6
   */
  async cancelBulkSend(jobId: string, userId: string): Promise<void> {
    const job = await prisma.bulkTemplateSend.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_NOT_FOUND);
    }

    // Can only cancel PENDING or PROCESSING jobs
    if (job.status !== 'PENDING' && job.status !== 'PROCESSING') {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_CANNOT_CANCEL);
    }

    await prisma.bulkTemplateSend.update({
      where: { id: jobId },
      data: {
        status: 'CANCELLED',
        completedAt: new Date(),
      },
    });

    logger.info('Bulk send job cancelled', { jobId, userId });
  }

  /**
   * Get bulk send history for a user
   * 
   * @param userId - User ID
   * @param page - Page number (1-based)
   * @param limit - Items per page
   * @returns Paginated job list
   */
  async getBulkSendHistory(
    userId: string,
    page = 1,
    limit = 20
  ): Promise<{ data: BulkSendJob[]; total: number }> {
    const [jobs, total] = await Promise.all([
      prisma.bulkTemplateSend.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.bulkTemplateSend.count({ where: { userId } }),
    ]);

    return {
      data: jobs.map(j => this.mapToJob(j)),
      total,
    };
  }

  // ============================================
  // CSV Validation (Requirements: 11.2, 11.3)
  // ============================================

  /**
   * Validate CSV data structure and content
   * 
   * @param csvData - Parsed CSV rows
   * @param requiredVariables - Required variable names from template mapping
   * @returns Validation result with errors
   * 
   * Requirements: 11.2, 11.3
   */
  validateCsvData(
    csvData: CsvRow[],
    requiredVariables: string[]
  ): CsvValidationResult {
    const errors: CsvValidationError[] = [];
    let validRows = 0;

    if (!csvData || csvData.length === 0) {
      return {
        valid: false,
        errors: [{
          row: 0,
          error: 'CSV data is empty',
          errorCode: BULK_SEND_ERROR_CODES.INVALID_CSV,
        }],
        totalRows: 0,
        validRows: 0,
      };
    }

    // Check for required columns
    const firstRow = csvData[0];
    const columns = Object.keys(firstRow);

    if (!columns.includes('phoneNumber')) {
      errors.push({
        row: 0,
        column: 'phoneNumber',
        error: 'Missing required column: phoneNumber',
        errorCode: BULK_SEND_ERROR_CODES.MISSING_COLUMNS,
      });
    }

    for (const varName of requiredVariables) {
      if (!columns.includes(varName)) {
        errors.push({
          row: 0,
          column: varName,
          error: `Missing required column: ${varName}`,
          errorCode: BULK_SEND_ERROR_CODES.MISSING_COLUMNS,
        });
      }
    }

    // If missing columns, return early
    if (errors.length > 0) {
      return {
        valid: false,
        errors,
        totalRows: csvData.length,
        validRows: 0,
      };
    }

    // Validate each row
    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      const rowNumber = i + 2; // +2 for 1-based index and header row
      let rowValid = true;

      // Validate phone number
      const phoneValidation = this.validatePhoneNumber(row.phoneNumber);
      if (!phoneValidation.valid) {
        errors.push({
          row: rowNumber,
          column: 'phoneNumber',
          error: phoneValidation.error!,
          errorCode: BULK_SEND_ERROR_CODES.INVALID_PHONE_NUMBER,
        });
        rowValid = false;
      }

      // Validate required variables are present
      for (const varName of requiredVariables) {
        const value = row[varName];
        if (!value || value.trim() === '') {
          errors.push({
            row: rowNumber,
            column: varName,
            error: `Missing value for variable: ${varName}`,
            errorCode: BULK_SEND_ERROR_CODES.MISSING_VARIABLE,
          });
          rowValid = false;
        }
      }

      if (rowValid) {
        validRows++;
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      totalRows: csvData.length,
      validRows,
    };
  }

  /**
   * Validate phone number format
   * 
   * @param phoneNumber - Phone number to validate
   * @returns Validation result
   */
  validatePhoneNumber(phoneNumber: string): { valid: boolean; error?: string } {
    if (!phoneNumber || phoneNumber.trim() === '') {
      return { valid: false, error: 'Phone number is required' };
    }

    // Remove spaces and dashes
    const cleaned = phoneNumber.replace(/[\s-]/g, '');

    // E.164 format: + followed by 1-15 digits
    const e164Pattern = /^\+?[1-9]\d{1,14}$/;

    if (!e164Pattern.test(cleaned)) {
      return {
        valid: false,
        error: `Invalid phone number format: ${phoneNumber}. Expected E.164 format (e.g., +628123456789)`,
      };
    }

    return { valid: true };
  }

  /**
   * Parse CSV string to array of rows
   * 
   * @param csvString - Raw CSV string
   * @returns Parsed rows
   */
  parseCsvString(csvString: string): CsvRow[] {
    const lines = csvString.trim().split('\n');
    if (lines.length < 2) {
      throw new Error('CSV must have at least a header row and one data row');
    }

    const headers = this.parseCsvLine(lines[0]);
    const rows: CsvRow[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = this.parseCsvLine(lines[i]);
      const row: CsvRow = { phoneNumber: '' };

      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j] || '';
      }

      rows.push(row);
    }

    return rows;
  }

  /**
   * Parse a single CSV line handling quoted values
   */
  private parseCsvLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current.trim());
    return result;
  }

  // ============================================
  // Bulk Send Processing (Requirements: 11.5, 11.6, 11.7)
  // ============================================

  /**
   * Process a bulk send job
   * 
   * @param jobId - Job ID to process
   * @param userId - User ID for authorization
   * @param messageDelayMs - Delay between messages in milliseconds
   * 
   * Requirements: 11.5, 11.6, 11.7
   */
  async processBulkSend(jobId: string, userId: string, messageDelayMs: number = 1000, senderPhoneNumberId?: string): Promise<void> {
    // Get job
    const job = await prisma.bulkTemplateSend.findFirst({
      where: { id: jobId, userId },
    });

    if (!job) {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_NOT_FOUND);
    }

    if (job.status === 'PROCESSING') {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_ALREADY_PROCESSING);
    }

    if (job.status !== 'PENDING') {
      throw new Error(`Cannot process job with status: ${job.status}`);
    }

    // Resolve WhatsApp credentials: use specific phone number if provided
    let credentials = null;
    if (senderPhoneNumberId) {
      const phoneNumberRecord = await getWhatsAppAccountByPhoneNumberId(senderPhoneNumberId);
      if (phoneNumberRecord && phoneNumberRecord.userId === userId) {
        credentials = await resolveCredentialsByPhoneNumber(phoneNumberRecord);
      }
    }
    if (!credentials) {
      credentials = await resolveCredentialsForSending(userId);
    }

    if (!credentials) {
      throw new Error(BULK_SEND_ERROR_CODES.CONFIGURATION_ERROR);
    }

    // Get template from database (filter by account if known)
    const templateWhere: any = {
      userId,
      templateName: job.templateName,
      status: 'APPROVED',
    };
    if (credentials.whatsappAccountId) {
      templateWhere.whatsappAccountId = credentials.whatsappAccountId;
    }
    const dbTemplate = await prisma.messageTemplate.findFirst({
      where: templateWhere,
    });

    if (!dbTemplate) {
      await this.updateJobStatus(jobId, 'FAILED', [], 'Template not found or not approved');
      return;
    }

    // Get variable mappings
    const mappings = await templateVariableService.getMappings(userId, job.templateName);

    // Update status to processing and save sender info for recovery
    await prisma.bulkTemplateSend.update({
      where: { id: jobId },
      data: { 
        status: 'PROCESSING',
        senderPhoneNumberId: senderPhoneNumberId || credentials.phoneNumberId,
        messageDelayMs,
        lastHeartbeat: new Date(),
        lastProcessedIndex: 0,
      },
    });

    logger.info('Starting bulk send processing', {
      jobId,
      totalRecipients: job.totalRecipients,
    });

    // Process using the shared internal method
    await this.processFromIndex(
      jobId,
      userId,
      0, // Start from beginning
      messageDelayMs,
      credentials,
      dbTemplate,
      mappings
    );
  }

  /**
   * Resume a bulk send job that was interrupted (e.g., server restart)
   * 
   * Handles both:
   * - New jobs with lastProcessedIndex tracking
   * - Legacy jobs (before this feature) by counting existing results
   * 
   * @param jobId - Job ID to resume
   * 
   * Requirements: 11.5, 11.6, 11.7
   */
  async resumeBulkSend(jobId: string): Promise<void> {
    // Get job without userId filter (for recovery)
    const job = await prisma.bulkTemplateSend.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_NOT_FOUND);
    }

    if (job.status !== 'PROCESSING') {
      logger.info('Job is not in PROCESSING status, skipping resume', { 
        jobId, 
        status: job.status 
      });
      return;
    }

    const csvData = job.csvData as CsvRow[];
    
    // Determine start index:
    // 1. Use lastProcessedIndex if available (new tracking)
    // 2. Otherwise, count existing results (legacy jobs before this feature)
    let startIndex = job.lastProcessedIndex || 0;
    
    // For legacy jobs without lastProcessedIndex, calculate from results
    if (!job.lastProcessedIndex && job.results) {
      const existingResults = job.results as unknown as RecipientResult[];
      if (Array.isArray(existingResults)) {
        startIndex = existingResults.length;
        logger.info('Legacy job detected, calculated startIndex from results', {
          jobId,
          resultsCount: existingResults.length,
          startIndex,
        });
      }
    }

    // Check if already completed
    if (startIndex >= csvData.length) {
      logger.info('Job already processed all recipients, marking as completed', { jobId });
      await prisma.bulkTemplateSend.update({
        where: { id: jobId },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
        },
      });
      return;
    }

    logger.info('Resuming bulk send processing', {
      jobId,
      userId: job.userId,
      startIndex,
      totalRecipients: job.totalRecipients,
      alreadyProcessed: startIndex,
      remaining: csvData.length - startIndex,
    });

    // Resolve credentials using saved sender info or fallback
    let credentials = null;
    if (job.senderPhoneNumberId) {
      const phoneNumberRecord = await getWhatsAppAccountByPhoneNumberId(job.senderPhoneNumberId);
      if (phoneNumberRecord && phoneNumberRecord.userId === job.userId) {
        credentials = await resolveCredentialsByPhoneNumber(phoneNumberRecord);
      }
    }
    if (!credentials) {
      credentials = await resolveCredentialsForSending(job.userId);
    }

    if (!credentials) {
      logger.error('Cannot resume broadcast: no credentials found', { jobId });
      await prisma.bulkTemplateSend.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
      return;
    }

    // Get template
    const templateWhere: any = {
      userId: job.userId,
      templateName: job.templateName,
      status: 'APPROVED',
    };
    if (credentials.whatsappAccountId) {
      templateWhere.whatsappAccountId = credentials.whatsappAccountId;
    }
    const dbTemplate = await prisma.messageTemplate.findFirst({
      where: templateWhere,
    });

    if (!dbTemplate) {
      logger.error('Cannot resume broadcast: template not found', { jobId, templateName: job.templateName });
      await prisma.bulkTemplateSend.update({
        where: { id: jobId },
        data: {
          status: 'FAILED',
          completedAt: new Date(),
        },
      });
      return;
    }

    // Get variable mappings
    const mappings = await templateVariableService.getMappings(job.userId, job.templateName);

    // Update heartbeat to indicate we're resuming
    await prisma.bulkTemplateSend.update({
      where: { id: jobId },
      data: { lastHeartbeat: new Date() },
    });

    // Process from the last saved index
    await this.processFromIndex(
      jobId,
      job.userId,
      startIndex,
      job.messageDelayMs || 1000,
      credentials,
      dbTemplate,
      mappings
    );
  }

  /**
   * Internal method to process broadcast from a specific index
   * Used by both processBulkSend and resumeBulkSend
   */
  private async processFromIndex(
    jobId: string,
    userId: string,
    startIndex: number,
    messageDelayMs: number,
    credentials: { accessToken: string; phoneNumberId: string; whatsappAccountId?: string },
    dbTemplate: any,
    mappings: (TemplateVariableMapping & { variable: TemplateVariable })[]
  ): Promise<void> {
    const job = await prisma.bulkTemplateSend.findUnique({
      where: { id: jobId },
    });

    if (!job) {
      throw new Error(BULK_SEND_ERROR_CODES.JOB_NOT_FOUND);
    }

    const csvData = job.csvData as CsvRow[];
    
    // Load existing results if resuming
    const existingResults = (job.results as unknown as RecipientResult[]) || [];
    const results: RecipientResult[] = [...existingResults];
    
    // Count existing successes/failures
    let successCount = job.successCount || 0;
    let failedCount = job.failedCount || 0;

    // Create WhatsApp client
    const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken });

    // Process from startIndex
    for (let i = startIndex; i < csvData.length; i++) {
      // Check if job was cancelled
      const currentJob = await prisma.bulkTemplateSend.findUnique({
        where: { id: jobId },
        select: { status: true },
      });

      if (currentJob?.status === 'CANCELLED') {
        logger.info('Bulk send job cancelled during processing', { jobId });
        break;
      }

      const row = csvData[i];
      const result = await this.sendToRecipient(
        credentials.phoneNumberId,
        row,
        job.templateName,
        dbTemplate.language,
        dbTemplate,
        mappings,
        whatsapp,
        userId,
        jobId
      );

      results.push(result);

      if (result.success) {
        successCount++;
      } else {
        failedCount++;
      }

      // Update progress and heartbeat after each message
      // This ensures we can resume from the exact position if server restarts
      await prisma.bulkTemplateSend.update({
        where: { id: jobId },
        data: {
          successCount,
          failedCount,
          results: results as any,
          lastProcessedIndex: i + 1, // Next index to process
          lastHeartbeat: new Date(),
        },
      });

      // Delay between messages (user-configurable)
      if (messageDelayMs > 0 && i < csvData.length - 1) {
        await this.delay(messageDelayMs);
      }
    }

    // Final update
    const finalStatus = await prisma.bulkTemplateSend.findUnique({
      where: { id: jobId },
      select: { status: true },
    });

    // Only update to COMPLETED if not cancelled
    if (finalStatus?.status !== 'CANCELLED') {
      await prisma.bulkTemplateSend.update({
        where: { id: jobId },
        data: {
          status: failedCount === csvData.length ? 'FAILED' : 'COMPLETED',
          successCount,
          failedCount,
          results: results as any,
          lastProcessedIndex: csvData.length,
          completedAt: new Date(),
        },
      });
    }

    logger.info('Bulk send processing completed', {
      jobId,
      successCount,
      failedCount,
      totalRecipients: csvData.length,
      startedFrom: startIndex,
    });
  }

  /**
   * Find stuck broadcast jobs that need recovery
   * A job is considered stuck if:
   * - Status is PROCESSING
   * - Last heartbeat is older than specified timeout (default 5 minutes)
   * 
   * @param timeoutMinutes - Minutes since last heartbeat to consider job stuck
   * @returns Array of stuck job IDs
   */
  async findStuckJobs(timeoutMinutes: number = 5): Promise<string[]> {
    const cutoffTime = new Date(Date.now() - timeoutMinutes * 60 * 1000);
    
    const stuckJobs = await prisma.bulkTemplateSend.findMany({
      where: {
        status: 'PROCESSING',
        OR: [
          { lastHeartbeat: { lt: cutoffTime } },
          { lastHeartbeat: null }, // Jobs without heartbeat (legacy)
        ],
      },
      select: { id: true },
    });

    return stuckJobs.map(job => job.id);
  }

  /**
   * Send template to a single recipient
   * Now also saves the message to database so it appears in inbox
   */
  private async sendToRecipient(
    phoneNumberId: string,
    row: CsvRow,
    templateName: string,
    languageCode: string,
    dbTemplate: any,
    mappings: (TemplateVariableMapping & { variable: TemplateVariable })[],
    whatsapp: any,
    userId: string,
    bulkSendJobId: string
  ): Promise<RecipientResult> {
    let sentPayload: any = null; // Store for error logging
    try {
      // Normalize identifier — normalizePhoneNumber preserves BSUID format
      // (guard added in Phase 1 of BSUID rollout).
      const phoneNumber = normalizePhoneNumber(row.phoneNumber);

      // BSUID passthrough carried from broadcast route (see routes/broadcast/index.ts).
      // Preferred routing: __customerId → DB lookup → getSendTarget.
      // Fallback: __whatsappBsuid direct, or phoneNumber column (may itself be a BSUID).
      const rowBsuid = ((row as any).__whatsappBsuid as string | undefined) || null;
      const rowCustomerId = ((row as any).__customerId as string | undefined) || null;

      // Log incoming row data for debugging
      logger.info('sendToRecipient called', {
        phoneNumber,
        templateName,
        hasBsuid: !!rowBsuid,
        hasCustomerId: !!rowCustomerId,
        rowKeys: Object.keys(row),
        mappingsCount: mappings.length
      });

      // Extract all non-phoneNumber keys from row.
      // Also skip __-prefixed internal passthrough keys (not template variables).
      const allKeys = Object.keys(row).filter(k => k !== 'phoneNumber' && !k.startsWith('__'));
      
      // Categorize keys
      const numericKeys = allKeys.filter(k => /^\d+$/.test(k)); // "1", "2", "3"
      const headerMediaKeys = allKeys.filter(k => k.startsWith('header_')); // "header_image", "header_video", "header_document"
      const buttonKeys = allKeys.filter(k => k.startsWith('button_')); // "button_0", "button_1", "button_0_copy_code"
      const otpKeys = allKeys.filter(k => ['coupon_code', 'otp_code', 'copy_code'].includes(k));
      
      logger.info('Variable keys extracted', {
        phoneNumber,
        allKeys,
        numericKeys,
        headerMediaKeys,
        buttonKeys,
        otpKeys,
        hasVariables: allKeys.length > 0
      });
      
      // Build components directly if we have variable values
      let components: any[] = [];
      
      // Convert DB template to WhatsAppTemplate format (needed for multiple checks)
      const template = this.dbTemplateToWhatsAppTemplate(dbTemplate);
      
      // Check if we have any special keys (header media, buttons, OTP)
      const hasSpecialKeys = headerMediaKeys.length > 0 || buttonKeys.length > 0 || otpKeys.length > 0;
      
      // Check if template has FLOW buttons (always need component even without variables)
      const templateButtons = template.components.find(c => c.type === 'BUTTONS')?.buttons || [];
      const hasFlowButton = templateButtons.some((b: any) => b.type === 'FLOW');
      
      // Always build payload if: has variables, has mappings, or has FLOW button
      const shouldBuildPayload = hasSpecialKeys || numericKeys.length > 0 || mappings.length > 0 || hasFlowButton;
      
      if (shouldBuildPayload) {
        // Use templateRendererService for proper handling of all variable types
        const variableValues: Record<string, string> = {};
        
        // Add all row values to variableValues
        for (const key of allKeys) {
          if (row[key]) {
            variableValues[key] = row[key].trim();
          }
        }
        
        // Also add mapping-based values if available
        for (const mapping of mappings) {
          const varName = mapping.variable.name;
          if (row[varName] && !variableValues[mapping.variableId]) {
            variableValues[mapping.variableId] = row[varName];
          }
        }

        logger.info('Building template payload with renderer service', {
          phoneNumber,
          templateName,
          templateCategory: template.category,
          variableValues: JSON.stringify(variableValues),
          hasHeaderMedia: headerMediaKeys.length > 0,
          hasButtons: buttonKeys.length > 0,
          hasOtp: otpKeys.length > 0,
          hasFlowButton,
          templateButtons: JSON.stringify(templateButtons)
        });

        // Build payload using renderer service
        const payload = templateRendererService.buildTemplatePayload(
          templateName,
          languageCode,
          template,
          variableValues,
          mappings
        );
        
        components = payload.components;
        
        logger.info('Template payload built', {
          phoneNumber,
          componentsCount: components.length,
          components: JSON.stringify(components)
        });
      }

      // Build final template payload
      const templatePayload: any = {
        name: templateName,
        language: { code: languageCode },
      };
      
      if (components.length > 0) {
        templatePayload.components = components;
      }

      // Store payload for error logging
      sentPayload = templatePayload;

      // Resolve customer for routing + DB save. Try customerId passthrough first
      // (most reliable), fall back to phone/BSUID lookup or create new.
      const phoneNumberRecord = await prisma.phoneNumber.findUnique({
        where: { phoneNumberId }
      })

      let customer = null
      if (rowCustomerId) {
        customer = await prisma.customer.findUnique({ where: { id: rowCustomerId } })
      }
      if (!customer) {
        // Lookup by phone OR BSUID (whichever matches). Handles both new BSUID
        // rows and legacy rows with BSUID stored in phoneNumber column.
        const lookupOR: any[] = []
        if (phoneNumber) lookupOR.push({ phoneNumber })
        if (rowBsuid) lookupOR.push({ whatsappBsuid: rowBsuid })
        if (lookupOR.length > 0) {
          customer = await prisma.customer.findFirst({
            where: {
              userId,
              whatsappPhoneNumberId: phoneNumberRecord?.id || null,
              OR: lookupOR,
            },
          })
        }
      }
      if (!customer) {
        // Create new — populate BSUID column when input is a BSUID.
        const phoneIsBsuid = isValidBsuid(phoneNumber)
        customer = await prisma.customer.create({
          data: {
            userId,
            phoneNumber,
            consentStatus: true, // Receiving broadcast implies consent
            whatsappPhoneNumberId: phoneNumberRecord?.id || null,
            ...(rowBsuid && {
              whatsappBsuid: rowBsuid,
              bsuidMappedAt: new Date(),
            }),
            ...(!rowBsuid && phoneIsBsuid && {
              whatsappBsuid: phoneNumber,
              bsuidMappedAt: new Date(),
            }),
          },
        })
      }

      // Build sendTarget via customer-lookup helper — handles BSUID-in-phone
      // workaround and dual (phone+BSUID) routing per docs/bsuid.md.
      const sendTarget = getSendTarget(customer)

      // BSUID compliance guard: auth templates cannot be sent to BSUID-only
      // recipients (Meta error 131062). Fail fast before calling upstream.
      if (
        (dbTemplate.category as string | undefined)?.toUpperCase() === 'AUTHENTICATION' &&
        !sendTarget.to &&
        sendTarget.recipient
      ) {
        logger.warn('Broadcast: blocked auth template to BSUID-only recipient', {
          customerId: customer.id,
          templateName,
          recipient: sendTarget.recipient,
        })
        return {
          phoneNumber: sendTarget.recipient,
          success: false,
          error: 'Template autentikasi tidak dapat dikirim menggunakan BSUID. Penerima belum memiliki nomor telepon.',
          errorCode: 'BsuidNotSupportedForAuthTemplate',
        }
      }

      // Log FULL payload before sending (use info level for visibility)
      logger.info('=== SENDING TEMPLATE MESSAGE ===', {
        phoneNumber,
        templateName,
        languageCode,
        componentsCount: components.length,
        sendTarget,
        fullPayload: JSON.stringify(templatePayload, null, 2)
      });

      // Send message via correct identifier (phone and/or BSUID)
      const result = await whatsapp.sendMessage({
        phoneNumberId,
        ...sendTarget,
        type: 'template',
        template: templatePayload,
      });

      const wamId = result.messages?.[0]?.id;

      // Render template content for storage
      let renderedContent = dbTemplate.content || '';
      
      // Replace variables with actual values from row
      const renderVarKeys = Object.keys(row).filter(k => k !== 'phoneNumber' && /^\d+$/.test(k));
      const renderSortedKeys = renderVarKeys.sort((a, b) => parseInt(a) - parseInt(b));
      
      for (const key of renderSortedKeys) {
        const value = row[key]?.trim() || '';
        renderedContent = renderedContent.replace(`{{${key}}}`, value);
      }

      // Add header and footer if present
      if (dbTemplate.headerType === 'TEXT' && dbTemplate.headerContent) {
        renderedContent = `${dbTemplate.headerContent}\n\n${renderedContent}`;
      }
      if (dbTemplate.footerContent) {
        renderedContent = `${renderedContent}\n\n${dbTemplate.footerContent}`;
      }

      // Create message record with PENDING status
      // Status will be updated to SENT/DELIVERED/FAILED via webhook from Meta
      await prisma.message.create({
        data: {
          userId,
          customerId: customer.id,
          messageType: 'TEMPLATE',
          direction: 'OUTBOUND',
          content: renderedContent,
          wamId,
          status: 'PENDING',
          source: 'API', // Broadcast messages are sent via API
          templateId: dbTemplate.id,
          bulkSendJobId, // Link to broadcast job for delivery tracking
          whatsappPhoneNumberId: phoneNumberRecord?.id || null, // Track which business number sent this
        },
      });

      logger.debug('Broadcast message saved to database', {
        phoneNumber,
        customerId: customer.id,
        wamId,
      });

      return {
        phoneNumber: row.phoneNumber,
        success: true,
        messageId: wamId,
        sentPayload: sentPayload,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      // Use WhatsAppErrorService for consistent error handling (Requirement 7.1)
      const metaError = error.response?.data || error;
      const errorResponse = WhatsAppErrorService.formatErrorResponse(metaError);
      const errorCode = errorResponse.error.code;
      
      // LOG FULL ERROR DETAIL — axios trees stripped by extractAxiosError,
      // nested tokens redacted by the logger serializer (defense-in-depth).
      logger.error('WhatsApp API error during bulk send', {
        phoneNumber: row.phoneNumber,
        templateName,
        errorCode,
        category: errorResponse.error.category,
        retryable: errorResponse.error.retryable,
        error: extractAxiosError(error),
        sentPayload,
      });

      // Log to audit log for admin dashboard visibility
      await AuditLogService.logMessageSendFailed(
        userId,
        row.phoneNumber,
        errorResponse.error.message,
        {
          templateName,
          errorCode: errorCode?.toString(),
          sentPayload: sentPayload,
          whatsappErrorResponse: error.response?.data || { message: error.message },
          bulkSendJobId,
        }
      ).catch(e => logger.error('Failed to log audit', { error: e.message }));

      // Return with full debug info for admin dashboard
      return {
        phoneNumber: row.phoneNumber,
        success: false,
        error: errorResponse.error.message,
        errorCode: errorCode?.toString(),
        sentPayload: sentPayload,
        whatsappErrorResponse: error.response?.data || { message: error.message },
        timestamp: new Date().toISOString(),
      };
    }
  }

  /**
   * Convert DB template to WhatsAppTemplate format
   */
  private dbTemplateToWhatsAppTemplate(dbTemplate: any): WhatsAppTemplate {
    const components: WhatsAppTemplateComponent[] = [];

    // Handle header - TEXT headers need content, media headers (IMAGE/VIDEO/DOCUMENT) may not
    if (dbTemplate.headerType) {
      const headerFormat = dbTemplate.headerType.toUpperCase();
      const isMediaHeader = ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(headerFormat);
      
      // Add header component if it's a text header with content OR a media header
      if ((headerFormat === 'TEXT' && dbTemplate.headerContent) || isMediaHeader) {
        components.push({
          type: 'HEADER',
          format: headerFormat,
          text: headerFormat === 'TEXT' ? dbTemplate.headerContent : undefined,
        });
      }
    }

    components.push({
      type: 'BODY',
      text: dbTemplate.content,
    });

    if (dbTemplate.footerContent) {
      components.push({
        type: 'FOOTER',
        text: dbTemplate.footerContent,
      });
    }

    if (dbTemplate.buttons && Array.isArray(dbTemplate.buttons) && dbTemplate.buttons.length > 0) {
      components.push({
        type: 'BUTTONS',
        buttons: dbTemplate.buttons,
      });
    }

    logger.debug('Converted DB template to WhatsApp format', {
      templateName: dbTemplate.templateName,
      category: dbTemplate.category,
      headerType: dbTemplate.headerType,
      hasButtons: dbTemplate.buttons?.length > 0,
      buttonTypes: dbTemplate.buttons?.map((b: any) => b.type) || [],
      componentsCount: components.length
    });

    return {
      id: dbTemplate.id,
      name: dbTemplate.templateName,
      language: dbTemplate.language,
      status: dbTemplate.status,
      category: dbTemplate.category,
      components,
    };
  }

  /**
   * Update job status with error message
   */
  private async updateJobStatus(
    jobId: string,
    status: BulkSendStatus,
    results: RecipientResult[],
    errorMessage?: string
  ): Promise<void> {
    await prisma.bulkTemplateSend.update({
      where: { id: jobId },
      data: {
        status,
        results: results as any,
        completedAt: new Date(),
      },
    });

    if (errorMessage) {
      logger.error('Bulk send job failed', { jobId, error: errorMessage });
    }
  }

  /**
   * Map Prisma model to BulkSendJob interface
   */
  private mapToJob(job: any): BulkSendJob {
    return {
      id: job.id,
      userId: job.userId,
      templateName: job.templateName,
      status: job.status,
      totalRecipients: job.totalRecipients,
      successCount: job.successCount,
      failedCount: job.failedCount,
      sentCount: job.sentCount ?? 0,
      deliveredCount: job.deliveredCount ?? 0,
      readCount: job.readCount ?? 0,
      csvData: job.csvData as CsvRow[],
      results: job.results as RecipientResult[] | null,
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
      completedAt: job.completedAt,
    };
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const bulkTemplateSendService = new BulkTemplateSendService();
