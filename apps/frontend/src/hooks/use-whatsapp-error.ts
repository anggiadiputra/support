"use client"

import { useTranslations } from "next-intl"

/**
 * WhatsApp error category enum matching backend
 */
export enum WhatsAppErrorCategory {
  AUTHORIZATION = 'AUTHORIZATION',
  INTEGRITY = 'INTEGRITY',
  TEMPLATE_CREATION = 'TEMPLATE_CREATION',
  TEMPLATE_SEND = 'TEMPLATE_SEND',
  THROTTLING = 'THROTTLING',
  REGISTRATION = 'REGISTRATION',
  OTHER = 'OTHER'
}

/**
 * WhatsApp API error response format from backend
 */
export interface WhatsAppAPIError {
  error: {
    code: number
    message: string
    category: WhatsAppErrorCategory
    retryable: boolean
    recoveryAction?: string
    details?: {
      originalMessage?: string
      fbtrace_id?: string
    }
  }
}

/**
 * Formatted error for display
 */
export interface FormattedWhatsAppError {
  code: number
  message: string
  category: string
  categoryLabel: string
  retryable: boolean
  recoveryAction?: string
  originalMessage?: string
}

/**
 * Hook for handling WhatsApp error codes with i18n support
 * 
 * @example
 * ```tsx
 * const { getErrorMessage, getRecoveryAction, formatError } = useWhatsAppError()
 * 
 * // Get localized error message
 * const message = getErrorMessage(131000)
 * 
 * // Get recovery action
 * const recovery = getRecoveryAction(131000)
 * 
 * // Format full error response
 * const formatted = formatError(apiError)
 * ```
 */
export function useWhatsAppError() {
  const t = useTranslations("whatsappErrors")

  /**
   * Get localized error message for a WhatsApp error code
   */
  const getErrorMessage = (code: number): string => {
    const key = String(code)
    try {
      const message = t(key)
      // If the key returns itself, it means translation not found
      if (message === key) {
        return t("unknown")
      }
      return message
    } catch {
      return t("unknown")
    }
  }

  /**
   * Get localized recovery action for a WhatsApp error code
   */
  const getRecoveryAction = (code: number): string | undefined => {
    const key = `${code}.recovery`
    try {
      const recovery = t(key)
      // If the key returns itself, it means translation not found
      if (recovery === key) {
        return t("unknown.recovery")
      }
      return recovery
    } catch {
      return t("unknown.recovery")
    }
  }

  /**
   * Get localized category label
   */
  const getCategoryLabel = (category: WhatsAppErrorCategory | string): string => {
    const key = `categories.${category}`
    try {
      const label = t(key)
      if (label === key) {
        return t("categories.OTHER")
      }
      return label
    } catch {
      return t("categories.OTHER")
    }
  }

  /**
   * Format a WhatsApp API error response for display
   */
  const formatError = (error: WhatsAppAPIError): FormattedWhatsAppError => {
    const { code, category, retryable, details } = error.error
    
    return {
      code,
      message: getErrorMessage(code),
      category,
      categoryLabel: getCategoryLabel(category),
      retryable,
      recoveryAction: getRecoveryAction(code),
      originalMessage: details?.originalMessage
    }
  }

  return {
    getErrorMessage,
    getRecoveryAction,
    getCategoryLabel,
    formatError
  }
}
