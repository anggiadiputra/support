import type { Context } from 'hono'
import * as Sentry from '@sentry/node'
import { logger } from '../utils/logger.js'

/**
 * Error code mapping from internal errors to standardized error codes
 * Maps Prisma errors, connection errors, and other internal errors to safe client-facing codes
 * 
 * **Validates: Requirements 6.3**
 */
export const ERROR_CODE_MAP: Record<string, string> = {
  // Prisma errors
  'P2000': 'VALIDATION_ERROR',
  'P2001': 'NOT_FOUND',
  'P2002': 'DUPLICATE_ENTRY',
  'P2003': 'FOREIGN_KEY_VIOLATION',
  'P2004': 'CONSTRAINT_VIOLATION',
  'P2005': 'INVALID_VALUE',
  'P2006': 'INVALID_VALUE',
  'P2007': 'VALIDATION_ERROR',
  'P2008': 'QUERY_ERROR',
  'P2009': 'QUERY_ERROR',
  'P2010': 'QUERY_ERROR',
  'P2011': 'CONSTRAINT_VIOLATION',
  'P2012': 'MISSING_REQUIRED_VALUE',
  'P2013': 'MISSING_REQUIRED_VALUE',
  'P2014': 'RELATION_VIOLATION',
  'P2015': 'NOT_FOUND',
  'P2016': 'QUERY_ERROR',
  'P2017': 'RELATION_VIOLATION',
  'P2018': 'NOT_FOUND',
  'P2019': 'VALIDATION_ERROR',
  'P2020': 'VALUE_OUT_OF_RANGE',
  'P2021': 'TABLE_NOT_FOUND',
  'P2022': 'COLUMN_NOT_FOUND',
  'P2023': 'INCONSISTENT_DATA',
  'P2024': 'CONNECTION_TIMEOUT',
  'P2025': 'NOT_FOUND',
  'P2026': 'UNSUPPORTED_FEATURE',
  'P2027': 'DATABASE_ERROR',
  'P2028': 'TRANSACTION_ERROR',
  'P2030': 'FULLTEXT_INDEX_ERROR',
  'P2031': 'DATABASE_ERROR',
  'P2033': 'NUMBER_OUT_OF_RANGE',
  'P2034': 'TRANSACTION_CONFLICT',
  
  // Connection errors
  'ECONNREFUSED': 'SERVICE_UNAVAILABLE',
  'ECONNRESET': 'SERVICE_UNAVAILABLE',
  'ETIMEDOUT': 'REQUEST_TIMEOUT',
  'ENOTFOUND': 'SERVICE_UNAVAILABLE',
  'EHOSTUNREACH': 'SERVICE_UNAVAILABLE',
  'ENETUNREACH': 'SERVICE_UNAVAILABLE',
  'EPIPE': 'SERVICE_UNAVAILABLE',
  'EAI_AGAIN': 'SERVICE_UNAVAILABLE',
  
  // HTTP-like errors
  'ValidationError': 'VALIDATION_ERROR',
  'UnauthorizedError': 'UNAUTHORIZED',
  'ForbiddenError': 'FORBIDDEN',
  'NotFoundError': 'NOT_FOUND',
  'ConflictError': 'CONFLICT',
  'RateLimitError': 'RATE_LIMIT_EXCEEDED',
  'BadRequestError': 'BAD_REQUEST',
  'InternalServerError': 'INTERNAL_ERROR',
  
  // Auth errors
  'JsonWebTokenError': 'INVALID_TOKEN',
  'TokenExpiredError': 'TOKEN_EXPIRED',
  'NotBeforeError': 'TOKEN_NOT_ACTIVE',
  
  // Generic errors
  'TypeError': 'INTERNAL_ERROR',
  'ReferenceError': 'INTERNAL_ERROR',
  'SyntaxError': 'INTERNAL_ERROR',
  'RangeError': 'INTERNAL_ERROR',
}

/**
 * User-friendly error messages for each error code
 * These are designed to help users understand what went wrong and how to fix it
 */
export const GENERIC_ERROR_MESSAGES: Record<string, string> = {
  'VALIDATION_ERROR': 'Data yang Anda masukkan tidak valid',
  'NOT_FOUND': 'Data yang Anda cari tidak ditemukan',
  'DUPLICATE_ENTRY': 'Data ini sudah terdaftar sebelumnya',
  'FOREIGN_KEY_VIOLATION': 'Operasi ini memerlukan data lain yang tidak ditemukan',
  'CONSTRAINT_VIOLATION': 'Operasi ini melanggar aturan data',
  'INVALID_VALUE': 'Satu atau lebih nilai tidak valid',
  'QUERY_ERROR': 'Terjadi kesalahan saat memproses permintaan Anda',
  'MISSING_REQUIRED_VALUE': 'Ada data wajib yang belum diisi',
  'RELATION_VIOLATION': 'Operasi ini melanggar hubungan antar data',
  'VALUE_OUT_OF_RANGE': 'Nilai yang Anda masukkan di luar batas yang diizinkan',
  'TABLE_NOT_FOUND': 'Terjadi kesalahan pada sistem. Silakan hubungi admin.',
  'COLUMN_NOT_FOUND': 'Terjadi kesalahan pada sistem. Silakan hubungi admin.',
  'INCONSISTENT_DATA': 'Data tidak konsisten. Silakan coba lagi.',
  'CONNECTION_TIMEOUT': 'Koneksi terputus. Silakan coba lagi dalam beberapa saat.',
  'UNSUPPORTED_FEATURE': 'Fitur ini belum didukung',
  'DATABASE_ERROR': 'Terjadi kesalahan pada database. Silakan coba lagi.',
  'TRANSACTION_ERROR': 'Operasi gagal diselesaikan. Silakan coba lagi.',
  'FULLTEXT_INDEX_ERROR': 'Terjadi kesalahan pada pencarian. Silakan coba lagi.',
  'NUMBER_OUT_OF_RANGE': 'Angka yang Anda masukkan terlalu besar atau terlalu kecil',
  'TRANSACTION_CONFLICT': 'Operasi ini bertabrakan dengan operasi lain. Silakan coba lagi.',
  'SERVICE_UNAVAILABLE': 'Layanan sedang tidak tersedia. Silakan coba lagi nanti.',
  'REQUEST_TIMEOUT': 'Permintaan memakan waktu terlalu lama. Silakan coba lagi.',
  'UNAUTHORIZED': 'Anda harus login terlebih dahulu',
  'FORBIDDEN': 'Anda tidak memiliki izin untuk melakukan ini',
  'CONFLICT': 'Operasi ini bertentangan dengan kondisi saat ini',
  'RATE_LIMIT_EXCEEDED': 'Terlalu banyak permintaan. Silakan tunggu sebentar dan coba lagi.',
  'BAD_REQUEST': 'Permintaan tidak valid',
  'INTERNAL_ERROR': 'Terjadi kesalahan pada server. Tim kami sudah diberitahu.',
  'INVALID_TOKEN': 'Token autentikasi tidak valid. Silakan login kembali.',
  'TOKEN_EXPIRED': 'Sesi Anda telah berakhir. Silakan login kembali.',
  'TOKEN_NOT_ACTIVE': 'Token autentikasi belum aktif',
  'UNKNOWN_ERROR': 'Terjadi kesalahan yang tidak terduga. Silakan coba lagi.',
}

/**
 * Interface for sanitized error response
 */
export interface SanitizedErrorResponse {
  error: {
    code: string
    message: string
  }
}

/**
 * Interface for detailed error log
 */
export interface DetailedErrorLog {
  code: string
  message: string
  stack?: string
  timestamp: string
  originalError?: string
  prismaCode?: string
  requestId?: string
  path?: string
  method?: string
}

/**
 * Extract Prisma error code from error
 */
function extractPrismaCode(error: unknown): string | undefined {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code: unknown }).code
    if (typeof code === 'string' && code.startsWith('P')) {
      return code
    }
  }
  return undefined
}

/**
 * Extract error code from error name or Prisma code
 */
function extractErrorCode(error: unknown): string | undefined {
  if (error && typeof error === 'object') {
    // Check for Prisma error code
    if ('code' in error) {
      const code = (error as { code: unknown }).code
      if (typeof code === 'string') {
        return code
      }
    }
    // Check for error name
    if (error instanceof Error) {
      return error.name
    }
  }
  return undefined
}

/**
 * Map internal error to standardized error code
 * 
 * **Validates: Requirements 6.3**
 */
export function mapErrorCode(error: unknown): string {
  const errorCode = extractErrorCode(error)
  
  if (errorCode && ERROR_CODE_MAP[errorCode]) {
    return ERROR_CODE_MAP[errorCode]
  }
  
  // Check if error name is directly in the map
  if (error instanceof Error && ERROR_CODE_MAP[error.name]) {
    return ERROR_CODE_MAP[error.name]
  }
  
  return 'INTERNAL_ERROR'
}

/**
 * Get generic message for error code
 */
export function getGenericMessage(errorCode: string): string {
  return GENERIC_ERROR_MESSAGES[errorCode] || GENERIC_ERROR_MESSAGES['UNKNOWN_ERROR']
}

/**
 * Check if running in production mode
 */
function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Create sanitized error response for client
 * 
 * **Validates: Requirements 6.1, 6.4, 6.5**
 * - Returns only error code and generic message in production
 * - Removes stack traces from client responses
 * - Removes database query details from responses
 */
export function createSanitizedResponse(
  error: unknown,
  forceProduction: boolean = false
): SanitizedErrorResponse {
  const errorCode = mapErrorCode(error)
  const genericMessage = getGenericMessage(errorCode)
  
  // In production, always return generic message
  if (isProduction() || forceProduction) {
    return {
      error: {
        code: errorCode,
        message: genericMessage,
      },
    }
  }
  
  // In development, include more details but still sanitize sensitive info
  const devMessage = error instanceof Error ? error.message : genericMessage
  
  // Remove any potential SQL or database details from dev message
  const sanitizedDevMessage = devMessage
    .replace(/SELECT\s+.*?\s+FROM/gi, '[QUERY]')
    .replace(/INSERT\s+INTO\s+.*?\s+VALUES/gi, '[QUERY]')
    .replace(/UPDATE\s+.*?\s+SET/gi, '[QUERY]')
    .replace(/DELETE\s+FROM/gi, '[QUERY]')
    .replace(/WHERE\s+.*?(?=\s|$)/gi, '[CONDITION]')
  
  return {
    error: {
      code: errorCode,
      message: sanitizedDevMessage,
    },
  }
}

/**
 * Log detailed error information server-side
 *
 * **Validates: Requirements 6.2**
 * - Logs error code, message, stack trace, timestamp
 * - Ensures all error details are captured server-side
 */
export function logDetailedError(
  error: unknown,
  context?: {
    requestId?: string
    path?: string
    method?: string
    ip?: string
    [key: string]: any  // Allow additional context properties
  }
): DetailedErrorLog {
  const errorCode = mapErrorCode(error)
  const prismaCode = extractPrismaCode(error)
  const timestamp = new Date().toISOString()
  
  const logEntry: DetailedErrorLog = {
    code: errorCode,
    message: error instanceof Error ? error.message : 'Unknown error',
    stack: error instanceof Error ? error.stack : undefined,
    timestamp,
    originalError: error instanceof Error ? error.name : typeof error,
    prismaCode,
    requestId: context?.requestId,
    path: context?.path,
    method: context?.method,
  }
  
  // Log to server-side logger with full details
  logger.error('Error occurred', {
    ...logEntry,
    ip: context?.ip,
  })
  
  return logEntry
}

/**
 * Get HTTP status code for error
 */
function getStatusCode(error: unknown): number {
  if (error instanceof Error) {
    switch (error.name) {
      case 'ValidationError':
      case 'BadRequestError':
        return 400
      case 'UnauthorizedError':
      case 'JsonWebTokenError':
      case 'TokenExpiredError':
      case 'NotBeforeError':
        return 401
      case 'ForbiddenError':
        return 403
      case 'NotFoundError':
        return 404
      case 'ConflictError':
        return 409
      case 'RateLimitError':
        return 429
      default:
        break
    }
  }
  
  // Check for Prisma error codes
  const prismaCode = extractPrismaCode(error)
  if (prismaCode) {
    switch (prismaCode) {
      case 'P2001':
      case 'P2015':
      case 'P2018':
      case 'P2025':
        return 404
      case 'P2002':
        return 409
      case 'P2000':
      case 'P2005':
      case 'P2006':
      case 'P2007':
      case 'P2012':
      case 'P2013':
      case 'P2019':
      case 'P2020':
      case 'P2033':
        return 400
      default:
        return 500
    }
  }
  
  return 500
}

/**
 * Error handler middleware for Hono
 * 
 * Implements secure error handling:
 * - Sanitizes error responses for clients
 * - Logs detailed errors server-side
 * - Maps internal errors to standardized codes
 * 
 * **Validates: Requirements 6.1, 6.2, 6.3, 6.4, 6.5**
 */
export async function errorHandler(c: Context, next: () => Promise<void>) {
  try {
    await next()
  } catch (err) {
    // Extract request context for logging
    const context = {
      requestId: c.req.header('x-request-id') || crypto.randomUUID(),
      path: c.req.path,
      method: c.req.method,
      ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
    }
    
    // Capture exception in Sentry
    if (process.env.SENTRY_DSN) {
      Sentry.captureException(err, (scope) => {
        scope.clear()
        if (context.requestId) scope.setTag('request_id', context.requestId)
        if (context.path) scope.setTag('path', context.path)
        if (context.method) scope.setTag('method', context.method)
        if (context.ip) scope.setTag('ip', context.ip)
        return scope
      })
    }

    // Log detailed error server-side
    logDetailedError(err, context)
    
    // Get appropriate status code
    const status = getStatusCode(err)
    
    // Create sanitized response for client
    const response = createSanitizedResponse(err)
    
    return c.json(response, { status } as any)
  }
}

/**
 * Handle error and return sanitized response (utility function)
 * Can be used directly in route handlers
 */
export function handleError(
  error: unknown,
  context?: {
    requestId?: string
    path?: string
    method?: string
    ip?: string
  }
): { response: SanitizedErrorResponse; status: number; log: DetailedErrorLog } {
  const log = logDetailedError(error, context)
  const response = createSanitizedResponse(error)
  const status = getStatusCode(error)

  return { response, status, log }
}

/**
 * Sanitize Zod validation errors for safe client response
 * Logs full validation details server-side, returns user-friendly field-level errors to client
 *
 * Usage in route handlers:
 * ```
 * if (!validation.success) {
 *   return handleValidationError(validation.error, c)
 * }
 * ```
 */
export function handleValidationError(
  error: any,
  c: Context
) {
  const context = {
    requestId: c.req.header('x-request-id') || crypto.randomUUID(),
    path: c.req.path,
    method: c.req.method,
    ip: c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown',
  }

  // Log detailed validation errors server-side only
  logger.error('Validation error occurred', {
    ...context,
    timestamp: new Date().toISOString(),
    validationErrors: error.issues,
  })

  // Capture in Sentry if configured
  if (process.env.SENTRY_DSN) {
    Sentry.captureMessage('Validation Error', {
      level: 'warning',
      contexts: {
        validation: {
          issues: error.issues,
        },
        request: context,
      },
    })
  }

  // Return user-friendly field-level validation errors to client
  // Zod messages are already user-friendly and safe to expose
  return c.json(
    {
      error: {
        code: 'VALIDATION_ERROR',
        message: GENERIC_ERROR_MESSAGES['VALIDATION_ERROR'],
        fields: error.issues?.map((issue: any) => ({
          field: issue.path.join('.') || 'unknown',
          message: issue.message,
        })) || [],
      },
    },
    400
  )
}
