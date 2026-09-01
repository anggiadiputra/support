/**
 * WhatsApp Error Service
 *
 * Centralized service for handling WhatsApp Cloud API errors.
 * Provides structured error responses with i18n support.
 *
 * Requirements: 1.2, 1.3, 1.4, 7.1, 7.2, 7.3
 */

import {
  WhatsAppErrorCategory,
  WhatsAppErrorInfo,
  WHATSAPP_ERROR_CODES,
  getWhatsAppErrorInfo,
  isWhatsAppErrorRetryable,
  getWhatsAppErrorCategory,
} from '../utils/whatsappErrorCodes.js'

/**
 * Meta API Error structure from WhatsApp Cloud API
 */
export interface MetaAPIError {
  error?: {
    message?: string
    type?: string
    code?: number
    error_subcode?: number
    error_data?: {
      messaging_product?: string
      details?: string
    }
    fbtrace_id?: string
  }
}

/**
 * Standardized WhatsApp API Error Response
 * Requirements: 7.1
 */
export interface WhatsAppAPIErrorResponse {
  error: {
    code: number
    message: string
    category: WhatsAppErrorCategory
    retryable: boolean
    recoveryAction?: string
    details?: {
      originalMessage?: string
      fbtrace_id?: string
      errorSubcode?: number
    }
  }
}

/**
 * WhatsApp Error Service
 *
 * Provides centralized error handling for WhatsApp Cloud API errors.
 */
export class WhatsAppErrorService {
  /**
   * Get error information for a given error code
   *
   * Returns WhatsAppErrorInfo for known codes, or a generic error for unknown codes.
   * Requirements: 1.2, 1.4
   *
   * @param code - The WhatsApp error code
   * @returns WhatsAppErrorInfo object with error details
   */
  static getErrorInfo(code: number): WhatsAppErrorInfo {
    return getWhatsAppErrorInfo(code)
  }

  /**
   * Format a Meta API error into a standardized response
   *
   * Parses the Meta API error and returns a WhatsAppAPIErrorResponse
   * with all required fields including original error details.
   * Requirements: 7.1, 7.3
   *
   * @param error - The raw error from Meta API
   * @returns Standardized WhatsAppAPIErrorResponse
   */
  static formatErrorResponse(error: MetaAPIError | unknown): WhatsAppAPIErrorResponse {
    // Extract error code from Meta API error structure
    const metaError = error as MetaAPIError
    const code = metaError?.error?.code ?? 0
    const errorInfo = this.getErrorInfo(code)

    return {
      error: {
        code: errorInfo.code,
        message: errorInfo.messageKey,
        category: errorInfo.category,
        retryable: errorInfo.retryable,
        recoveryAction: errorInfo.recoveryKey,
        details: {
          originalMessage: metaError?.error?.message,
          fbtrace_id: metaError?.error?.fbtrace_id,
          errorSubcode: metaError?.error?.error_subcode,
        },
      },
    }
  }

  /**
   * Check if an error code is retryable
   *
   * Requirements: 7.2, 1.3
   *
   * @param code - The WhatsApp error code
   * @returns true if the error is retryable
   */
  static isRetryable(code: number): boolean {
    return isWhatsAppErrorRetryable(code)
  }

  /**
   * Get the category for an error code
   *
   * Requirements: 1.3
   *
   * @param code - The WhatsApp error code
   * @returns WhatsAppErrorCategory enum value
   */
  static getCategory(code: number): WhatsAppErrorCategory {
    return getWhatsAppErrorCategory(code)
  }

  /**
   * Get all known error codes
   *
   * @returns Array of all known error codes
   */
  static getAllKnownCodes(): number[] {
    return Array.from(WHATSAPP_ERROR_CODES.keys())
  }

  /**
   * Check if an error code is known (in the mapping)
   *
   * @param code - The WhatsApp error code
   * @returns true if the code is in the mapping
   */
  static isKnownCode(code: number): boolean {
    return WHATSAPP_ERROR_CODES.has(code)
  }
}

// Re-export types and enums for convenience
export { WhatsAppErrorCategory }
export type { WhatsAppErrorInfo }
