/**
 * Broadcast Error Categorizer
 *
 * Categorizes WhatsApp API errors for better user understanding.
 * Groups errors by type to show actionable summaries.
 */

/**
 * Translation function type from next-intl
 * When t is provided, use t(`${code}.message`) and t(`${code}.recovery`)
 * When t is NOT provided, return fallback message in English
 */
export type TranslationFunction = (key: string) => string

/**
 * Error info returned by getErrorInfo
 */
export interface WhatsAppErrorInfo {
  code: string | null
  message: string
  recoveryAction: string
  category: ErrorCategory
}

/**
 * Default English fallback messages for common error codes
 * Used when translation function is not provided
 */
const FALLBACK_ERROR_MESSAGES: Record<string, { message: string; recovery: string }> = {
  unknown: {
    message: 'An unknown error occurred.',
    recovery: 'Please try again or contact support.',
  },
}

/**
 * Get structured error info from error string and optional error code
 * @param error - The error string
 * @param errorCode - Optional error code
 * @param t - Optional translation function from next-intl useTranslations('whatsappErrors')
 */
export function getErrorInfo(
  error: string,
  errorCode?: string,
  t?: TranslationFunction
): WhatsAppErrorInfo {
  const code = errorCode || extractErrorCode(error, errorCode)
  const category = categorizeError(error, errorCode)
  
  // When translation function is provided, use i18n
  if (t && code) {
    const message = t(`${code}.message`)
    const recovery = t(`${code}.recovery`)
    
    // Check if translation exists (next-intl returns the key if not found)
    const hasTranslation = message !== `${code}.message`
    
    if (hasTranslation) {
      return {
        code,
        message,
        recoveryAction: recovery,
        category,
      }
    }
  }

  // Fallback for unknown error codes (English)
  return {
    code,
    message: error || FALLBACK_ERROR_MESSAGES.unknown.message,
    recoveryAction: FALLBACK_ERROR_MESSAGES.unknown.recovery,
    category,
  }
}

/**
 * Default English recovery actions for each category
 */
const FALLBACK_CATEGORY_RECOVERY_ACTIONS: Record<ErrorCategory, string> = {
  PAYMENT: 'Check payment method in Meta Business Suite',
  RATE_LIMIT: 'Wait a moment and reduce sending speed',
  TEMPLATE: 'Check template configuration and parameters',
  RECIPIENT: 'Verify recipient number and their WhatsApp status',
  AUTHORIZATION: 'Reconnect your WhatsApp Business account',
  INTEGRITY: 'Review Meta policies and appeal if necessary',
  OTHER: 'Try again later or contact support',
}

/**
 * Get recovery action for a category
 * @param category - The error category
 * @param t - Optional translation function from next-intl useTranslations('broadcast')
 */
export function getCategoryRecoveryAction(
  category: ErrorCategory,
  t?: TranslationFunction
): string {
  // When translation function is provided, use i18n
  if (t) {
    const key = `errors.recovery.${category}`
    const translated = t(key)
    // Check if translation exists (next-intl returns the key if not found)
    if (translated !== key) {
      return translated
    }
  }
  
  // Fallback to English
  return FALLBACK_CATEGORY_RECOVERY_ACTIONS[category]
}

export type ErrorCategory =
  | 'PAYMENT'
  | 'RATE_LIMIT'
  | 'TEMPLATE'
  | 'RECIPIENT'
  | 'AUTHORIZATION'
  | 'INTEGRITY'
  | 'OTHER'

export interface ErrorCategoryInfo {
  category: ErrorCategory
  label: string
  labelKey: string // i18n key
  description: string
  descriptionKey: string // i18n key
  icon: string
  severity: 'critical' | 'warning' | 'info'
  actionRequired: boolean
  actionKey?: string // i18n key for action
}

export interface CategorizedError {
  category: ErrorCategory
  count: number
  errors: Array<{
    phoneNumber: string
    error: string
    errorCode?: string
  }>
}

export interface ErrorSummary {
  totalFailed: number
  categories: CategorizedError[]
  hasCriticalErrors: boolean
  primaryIssue: ErrorCategory | null
}

/**
 * WhatsApp error codes mapped to categories
 * Source: docs/plans/error.md (Meta Cloud API documentation)
 */
const ERROR_CODE_CATEGORIES: Record<string, ErrorCategory> = {
  // ==========================================
  // AUTHORIZATION ERRORS
  // ==========================================
  '0': 'AUTHORIZATION', // AuthException - token expired/invalid
  '3': 'AUTHORIZATION', // API Method - capability/permission issue
  '10': 'AUTHORIZATION', // Permission Denied
  '190': 'AUTHORIZATION', // Access token has expired
  '200': 'AUTHORIZATION', // API Permission (200-299 range)
  '131005': 'AUTHORIZATION', // Access denied

  // ==========================================
  // INTEGRITY/POLICY ERRORS
  // ==========================================
  '368': 'INTEGRITY', // Temporarily blocked for policies violations
  '130497': 'INTEGRITY', // Business account restricted from messaging users in this country
  '131031': 'INTEGRITY', // Account has been locked

  // ==========================================
  // RATE LIMITING / THROTTLING
  // ==========================================
  '4': 'RATE_LIMIT', // API Too Many Calls
  '80007': 'RATE_LIMIT', // Rate limit issues
  '130429': 'RATE_LIMIT', // Rate limit hit (throughput)
  '131048': 'RATE_LIMIT', // Spam rate limit hit
  '131056': 'RATE_LIMIT', // (Business, Consumer) pair rate limit hit
  '133016': 'RATE_LIMIT', // Account register/deregister rate limit exceeded

  // ==========================================
  // PAYMENT / BILLING
  // ==========================================
  '131042': 'PAYMENT', // Business eligibility payment issue
  '134011': 'PAYMENT', // WhatsApp Payments terms of service not accepted

  // ==========================================
  // TEMPLATE ERRORS (Send)
  // ==========================================
  '132000': 'TEMPLATE', // Template Param Count Mismatch
  '132001': 'TEMPLATE', // Template does not exist
  '132005': 'TEMPLATE', // Template Hydrated Text Too Long
  '132007': 'TEMPLATE', // Template Format Character Policy Violated
  '132012': 'TEMPLATE', // Template Parameter Format Mismatch
  '132015': 'TEMPLATE', // Template Paused (low quality)
  '132016': 'TEMPLATE', // Template Disabled (permanently)
  '132068': 'TEMPLATE', // Flow is blocked
  '132069': 'TEMPLATE', // Flow is throttled
  '131051': 'TEMPLATE', // Unsupported message type
  '131055': 'TEMPLATE', // Method not allowed - only marketing templates supported
  '134100': 'TEMPLATE', // Only marketing messages supported (MM API)
  '134101': 'TEMPLATE', // Template still syncing
  '134102': 'TEMPLATE', // Template unavailable for use

  // ==========================================
  // TEMPLATE CREATION ERRORS
  // ==========================================
  '2388019': 'TEMPLATE', // Message Template Limit Exceeded
  '2388040': 'TEMPLATE', // Character limit exceeded
  '2388047': 'TEMPLATE', // Message header format is incorrect
  '2388072': 'TEMPLATE', // Message body format is incorrect
  '2388073': 'TEMPLATE', // Message footer format is incorrect
  '2388293': 'TEMPLATE', // Parameters words ratio exceeds limit
  '2388299': 'TEMPLATE', // Leading or trailing parameters not allowed

  // ==========================================
  // RECIPIENT ERRORS
  // ==========================================
  '131021': 'RECIPIENT', // Recipient cannot be sender
  '131026': 'RECIPIENT', // Message Undeliverable (not on WA, old version, etc)
  '131047': 'RECIPIENT', // Re-engagement message (24hr window expired)
  '131049': 'RECIPIENT', // Meta chose not to deliver (spam/quality)
  '131050': 'RECIPIENT', // User has stopped receipt of marketing messages
  '130472': 'RECIPIENT', // User's number is part of an experiment
  '133010': 'RECIPIENT', // Phone number Not Registered on WhatsApp

  // ==========================================
  // PARAMETER / VALIDATION ERRORS
  // ==========================================
  '33': 'OTHER', // Parameter value is not valid (phone deleted)
  '100': 'OTHER', // Invalid parameter
  '131008': 'OTHER', // Required parameter is missing
  '131009': 'OTHER', // Parameter value is not valid
  '135000': 'OTHER', // Generic user error

  // ==========================================
  // MEDIA ERRORS
  // ==========================================
  '131052': 'OTHER', // Media download error
  '131053': 'OTHER', // Media upload error

  // ==========================================
  // SERVICE / SERVER ERRORS
  // ==========================================
  '1': 'OTHER', // API Unknown
  '2': 'OTHER', // API Service - temporarily unavailable
  '131000': 'OTHER', // Something went wrong (generic)
  '131016': 'OTHER', // Service unavailable
  '131057': 'OTHER', // Account in maintenance mode
  '133004': 'OTHER', // Server Temporarily Unavailable
  '2494100': 'OTHER', // Account is in maintenance mode (migration)

  // ==========================================
  // REGISTRATION / PHONE ERRORS
  // ==========================================
  '131037': 'OTHER', // Display name needs approval before sending
  '131045': 'OTHER', // Incorrect certificate
  '133000': 'OTHER', // Incomplete Deregistration
  '133005': 'OTHER', // Two step verification PIN Mismatch
  '133006': 'OTHER', // Phone number re-verification needed
  '133008': 'OTHER', // Too Many two step verification PIN Guesses
  '133009': 'OTHER', // Two step verification PIN Guessed Too Fast
  '133015': 'OTHER', // Wait before registering phone number

  // ==========================================
  // MIGRATION ERRORS
  // ==========================================
  '2388001': 'OTHER', // Confirm ownership / disable two-step auth
  '2388012': 'OTHER', // Phone number already exists in account
  '2388091': 'OTHER', // Phone not eligible for migration
  '2388093': 'OTHER', // Phone not eligible for migration
  '2388103': 'OTHER', // Various migration errors
  
  // ==========================================
  // SYNCHRONIZATION ERRORS
  // ==========================================
  '2593107': 'OTHER', // Synchronization Request limit exceeded
  '2593108': 'OTHER', // Synchronization Request outside time window

  // ==========================================
  // INSIGHT ERRORS
  // ==========================================
  '200005': 'OTHER', // Template insights unavailable
  '200006': 'OTHER', // Cannot disable template insights
  '200007': 'OTHER', // Template Insights not enabled

  // ==========================================
  // WABA ERRORS
  // ==========================================
  '2593079': 'OTHER', // WABA marked for migration to another solution ID
  '2593085': 'OTHER', // Invalid WhatsApp Business Account for OBO Mobility
  '1752041': 'OTHER', // Duplicate Request (onboarding)
}

/**
 * Category metadata for UI display
 */
export const ERROR_CATEGORY_INFO: Record<ErrorCategory, ErrorCategoryInfo> = {
  PAYMENT: {
    category: 'PAYMENT',
    label: 'Payment Issue',
    labelKey: 'broadcast.errors.categories.payment',
    description: 'Payment method not configured or billing issue with Meta',
    descriptionKey: 'broadcast.errors.categories.paymentDesc',
    icon: 'IconCreditCardOff',
    severity: 'critical',
    actionRequired: true,
    actionKey: 'broadcast.errors.actions.setupPayment',
  },
  RATE_LIMIT: {
    category: 'RATE_LIMIT',
    label: 'Rate Limited',
    labelKey: 'broadcast.errors.categories.rateLimit',
    description: 'Too many messages sent too quickly',
    descriptionKey: 'broadcast.errors.categories.rateLimitDesc',
    icon: 'IconClockPause',
    severity: 'warning',
    actionRequired: false,
  },
  TEMPLATE: {
    category: 'TEMPLATE',
    label: 'Template Issue',
    labelKey: 'broadcast.errors.categories.template',
    description: 'Problem with template configuration or parameters',
    descriptionKey: 'broadcast.errors.categories.templateDesc',
    icon: 'IconTemplate',
    severity: 'critical',
    actionRequired: true,
    actionKey: 'broadcast.errors.actions.checkTemplate',
  },
  RECIPIENT: {
    category: 'RECIPIENT',
    label: 'Recipient Issue',
    labelKey: 'broadcast.errors.categories.recipient',
    description: 'Recipient blocked messages or has invalid number',
    descriptionKey: 'broadcast.errors.categories.recipientDesc',
    icon: 'IconUserOff',
    severity: 'info',
    actionRequired: false,
  },
  AUTHORIZATION: {
    category: 'AUTHORIZATION',
    label: 'Authorization Error',
    labelKey: 'broadcast.errors.categories.authorization',
    description: 'Access token expired or permission denied',
    descriptionKey: 'broadcast.errors.categories.authorizationDesc',
    icon: 'IconLockOff',
    severity: 'critical',
    actionRequired: true,
    actionKey: 'broadcast.errors.actions.reconnect',
  },
  INTEGRITY: {
    category: 'INTEGRITY',
    label: 'Policy Violation',
    labelKey: 'broadcast.errors.categories.integrity',
    description: 'Account restricted due to policy violations',
    descriptionKey: 'broadcast.errors.categories.integrityDesc',
    icon: 'IconShieldOff',
    severity: 'critical',
    actionRequired: true,
    actionKey: 'broadcast.errors.actions.reviewPolicy',
  },
  OTHER: {
    category: 'OTHER',
    label: 'Other Error',
    labelKey: 'broadcast.errors.categories.other',
    description: 'Unexpected error occurred',
    descriptionKey: 'broadcast.errors.categories.otherDesc',
    icon: 'IconAlertCircle',
    severity: 'info',
    actionRequired: false,
  },
}

/**
 * Extract error code from error message or errorCode field
 */
function extractErrorCode(error: string, errorCode?: string): string | null {
  // If errorCode is provided, use it
  if (errorCode) {
    return errorCode
  }

  // Try to extract from error message patterns
  // Pattern: "whatsappErrors.XXXXX" or just "XXXXX"
  const patterns = [
    /whatsappErrors\.(\d+)/,
    /error[_\s]?code[:\s]*(\d+)/i,
    /\((\d{3,6})\)/,
    /^(\d{3,6})$/,
  ]

  for (const pattern of patterns) {
    const match = error.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}

/**
 * Categorize an error based on its code or message
 */
function categorizeError(error: string, errorCode?: string): ErrorCategory {
  const code = extractErrorCode(error, errorCode)

  if (code && ERROR_CODE_CATEGORIES[code]) {
    return ERROR_CODE_CATEGORIES[code]
  }

  // Fallback: try to match by error message content
  const errorLower = error.toLowerCase()

  if (errorLower.includes('payment') || errorLower.includes('billing') || errorLower.includes('eligibility')) {
    return 'PAYMENT'
  }
  if (errorLower.includes('rate') || errorLower.includes('limit') || errorLower.includes('throttl')) {
    return 'RATE_LIMIT'
  }
  if (errorLower.includes('template') || errorLower.includes('param')) {
    return 'TEMPLATE'
  }
  // RECIPIENT checks BEFORE AUTHORIZATION to avoid "permission" false positive
  // "User has not given permission", "not opted in", "blocked" are recipient issues, not auth
  if (
    errorLower.includes('recipient') || 
    errorLower.includes('undeliverable') || 
    errorLower.includes('blocked') ||
    errorLower.includes('opted') ||
    errorLower.includes('marketing') ||
    errorLower.includes('not registered') ||
    errorLower.includes('invalid phone') ||
    errorLower.includes('user permission') ||
    errorLower.includes('not deliver')
  ) {
    return 'RECIPIENT'
  }
  // AUTHORIZATION - be more specific to avoid false positives
  if (
    errorLower.includes('access token') || 
    errorLower.includes('token expired') ||
    errorLower.includes('invalid token') ||
    errorLower.includes('authentication') ||
    errorLower.includes('unauthorized') ||
    (errorLower.includes('permission') && errorLower.includes('denied') && !errorLower.includes('user'))
  ) {
    return 'AUTHORIZATION'
  }
  if (errorLower.includes('policy') || errorLower.includes('violation') || errorLower.includes('restricted')) {
    return 'INTEGRITY'
  }

  return 'OTHER'
}

/**
 * Categorize all failed results and create a summary
 */
export function categorizeErrors(
  results: Array<{
    phoneNumber: string
    success: boolean
    error?: string
    errorCode?: string
  }>
): ErrorSummary {
  const failedResults = results.filter(r => !r.success && r.error)

  if (failedResults.length === 0) {
    return {
      totalFailed: 0,
      categories: [],
      hasCriticalErrors: false,
      primaryIssue: null,
    }
  }

  // Group by category
  const categoryMap = new Map<ErrorCategory, CategorizedError>()

  for (const result of failedResults) {
    const category = categorizeError(result.error || '', result.errorCode)

    if (!categoryMap.has(category)) {
      categoryMap.set(category, {
        category,
        count: 0,
        errors: [],
      })
    }

    const entry = categoryMap.get(category)!
    entry.count++
    entry.errors.push({
      phoneNumber: result.phoneNumber,
      error: result.error || 'Unknown error',
      errorCode: result.errorCode,
    })
  }

  // Sort by count descending
  const categories = Array.from(categoryMap.values()).sort((a, b) => b.count - a.count)

  // Check for critical errors
  const criticalCategories: ErrorCategory[] = ['PAYMENT', 'TEMPLATE', 'AUTHORIZATION', 'INTEGRITY']
  const hasCriticalErrors = categories.some(c => criticalCategories.includes(c.category))

  // Primary issue is the most common error category
  const primaryIssue = categories.length > 0 ? categories[0].category : null

  return {
    totalFailed: failedResults.length,
    categories,
    hasCriticalErrors,
    primaryIssue,
  }
}

/**
 * Get success rate as percentage
 */
export function getSuccessRate(successCount: number, totalRecipients: number): number {
  if (totalRecipients === 0) return 0
  return Math.round((successCount / totalRecipients) * 100)
}

/**
 * Determine effective status based on success rate
 */
export function getEffectiveStatus(
  status: string,
  successCount: number,
  failedCount: number,
  totalRecipients: number
): 'SUCCESS' | 'PARTIAL' | 'MOSTLY_FAILED' | 'FAILED' | 'CANCELLED' | 'PENDING' | 'PROCESSING' {
  if (status === 'CANCELLED') return 'CANCELLED'
  if (status === 'PENDING') return 'PENDING'
  if (status === 'PROCESSING') return 'PROCESSING'

  const successRate = getSuccessRate(successCount, totalRecipients)

  if (failedCount === 0) return 'SUCCESS'
  if (successCount === 0) return 'FAILED'
  if (successRate >= 80) return 'PARTIAL' // Mostly success with some failures
  if (successRate >= 20) return 'PARTIAL' // Mixed results
  return 'MOSTLY_FAILED' // Less than 20% success
}
