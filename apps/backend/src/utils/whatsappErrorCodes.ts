/**
 * WhatsApp Cloud API Error Codes
 *
 * Comprehensive error code mapping based on Meta's official documentation.
 * Provides structured error handling with i18n support for frontend display.
 */

/**
 * WhatsApp Error Categories
 */
export enum WhatsAppErrorCategory {
  AUTHORIZATION = 'AUTHORIZATION',
  INTEGRITY = 'INTEGRITY',
  TEMPLATE_CREATION = 'TEMPLATE_CREATION',
  TEMPLATE_SEND = 'TEMPLATE_SEND',
  THROTTLING = 'THROTTLING',
  REGISTRATION = 'REGISTRATION',
  OTHER = 'OTHER',
}

/**
 * WhatsApp Error Information
 */
export interface WhatsAppErrorInfo {
  code: number
  title: string
  messageKey: string // i18n key for frontend
  category: WhatsAppErrorCategory
  retryable: boolean
  recoveryKey?: string // i18n key for recovery action
  httpStatus: number
}

/**
 * WhatsApp Error Codes Mapping
 */
export const WHATSAPP_ERROR_CODES: Map<number, WhatsAppErrorInfo> = new Map([
  // ============================================
  // HIGH PRIORITY ERROR CODES (Requirements 2.x)
  // ============================================

  // 131000 - Something went wrong
  [
    131000,
    {
      code: 131000,
      title: 'Something went wrong',
      messageKey: 'whatsappErrors.131000.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.131000.recovery',
      httpStatus: 500,
    },
  ],

  // 131048 - Spam rate limit hit
  [
    131048,
    {
      code: 131048,
      title: 'Spam rate limit hit',
      messageKey: 'whatsappErrors.131048.message',
      category: WhatsAppErrorCategory.THROTTLING,
      retryable: false,
      recoveryKey: 'whatsappErrors.131048.recovery',
      httpStatus: 400,
    },
  ],

  // 131049 - Meta chose not to deliver
  [
    131049,
    {
      code: 131049,
      title: 'Meta chose not to deliver',
      messageKey: 'whatsappErrors.131049.message',
      category: WhatsAppErrorCategory.INTEGRITY,
      retryable: false,
      recoveryKey: 'whatsappErrors.131049.recovery',
      httpStatus: 400,
    },
  ],

  // 131050 - User stopped marketing messages
  [
    131050,
    {
      code: 131050,
      title: 'User stopped marketing messages',
      messageKey: 'whatsappErrors.131050.message',
      category: WhatsAppErrorCategory.INTEGRITY,
      retryable: false,
      recoveryKey: 'whatsappErrors.131050.recovery',
      httpStatus: 400,
    },
  ],

  // 368 - Temporarily blocked for policy violations
  [
    368,
    {
      code: 368,
      title: 'Temporarily blocked for policies violations',
      messageKey: 'whatsappErrors.368.message',
      category: WhatsAppErrorCategory.INTEGRITY,
      retryable: false,
      recoveryKey: 'whatsappErrors.368.recovery',
      httpStatus: 403,
    },
  ],

  // ============================================
  // MEDIUM PRIORITY ERROR CODES (Requirements 3.x)
  // ============================================

  // 0 - AuthException
  [
    0,
    {
      code: 0,
      title: 'AuthException',
      messageKey: 'whatsappErrors.0.message',
      category: WhatsAppErrorCategory.AUTHORIZATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.0.recovery',
      httpStatus: 401,
    },
  ],

  // 131005 - Access denied
  [
    131005,
    {
      code: 131005,
      title: 'Access denied',
      messageKey: 'whatsappErrors.131005.message',
      category: WhatsAppErrorCategory.AUTHORIZATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.131005.recovery',
      httpStatus: 403,
    },
  ],

  // 131016 - Service unavailable
  [
    131016,
    {
      code: 131016,
      title: 'Service unavailable',
      messageKey: 'whatsappErrors.131016.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.131016.recovery',
      httpStatus: 500,
    },
  ],

  // 131021 - Recipient cannot be sender
  [
    131021,
    {
      code: 131021,
      title: 'Recipient cannot be sender',
      messageKey: 'whatsappErrors.131021.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131021.recovery',
      httpStatus: 400,
    },
  ],

  // 131037 - Display name not approved
  [
    131037,
    {
      code: 131037,
      title: 'Display name not approved',
      messageKey: 'whatsappErrors.131037.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131037.recovery',
      httpStatus: 400,
    },
  ],

  // 131056 - Pair rate limit hit
  [
    131056,
    {
      code: 131056,
      title: 'Pair rate limit hit',
      messageKey: 'whatsappErrors.131056.message',
      category: WhatsAppErrorCategory.THROTTLING,
      retryable: true,
      recoveryKey: 'whatsappErrors.131056.recovery',
      httpStatus: 400,
    },
  ],

  // 131057 - Account in maintenance mode
  [
    131057,
    {
      code: 131057,
      title: 'Account in maintenance mode',
      messageKey: 'whatsappErrors.131057.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.131057.recovery',
      httpStatus: 500,
    },
  ],

  // 130497 - Country restriction
  [
    130497,
    {
      code: 130497,
      title: 'Country restriction',
      messageKey: 'whatsappErrors.130497.message',
      category: WhatsAppErrorCategory.INTEGRITY,
      retryable: false,
      recoveryKey: 'whatsappErrors.130497.recovery',
      httpStatus: 403,
    },
  ],


  // ============================================
  // TEMPLATE ERROR CODES (Requirements 4.x)
  // ============================================

  // 132016 - Template disabled
  [
    132016,
    {
      code: 132016,
      title: 'Template is Disabled',
      messageKey: 'whatsappErrors.132016.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132016.recovery',
      httpStatus: 400,
    },
  ],

  // 132068 - Flow blocked
  [
    132068,
    {
      code: 132068,
      title: 'Flow is blocked',
      messageKey: 'whatsappErrors.132068.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132068.recovery',
      httpStatus: 400,
    },
  ],

  // 132069 - Flow throttled
  [
    132069,
    {
      code: 132069,
      title: 'Flow is throttled',
      messageKey: 'whatsappErrors.132069.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: true,
      recoveryKey: 'whatsappErrors.132069.recovery',
      httpStatus: 400,
    },
  ],

  // 2388040 - Character limit exceeded
  [
    2388040,
    {
      code: 2388040,
      title: 'Character limit exceeded',
      messageKey: 'whatsappErrors.2388040.message',
      category: WhatsAppErrorCategory.TEMPLATE_CREATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.2388040.recovery',
      httpStatus: 400,
    },
  ],

  // 2388019 - Template limit exceeded
  [
    2388019,
    {
      code: 2388019,
      title: 'Message Template Limit Exceeded',
      messageKey: 'whatsappErrors.2388019.message',
      category: WhatsAppErrorCategory.TEMPLATE_CREATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.2388019.recovery',
      httpStatus: 400,
    },
  ],

  // 132000 - Template Param Count Mismatch
  [
    132000,
    {
      code: 132000,
      title: 'Template Param Count Mismatch',
      messageKey: 'whatsappErrors.132000.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132000.recovery',
      httpStatus: 400,
    },
  ],

  // 132001 - Template does not exist
  [
    132001,
    {
      code: 132001,
      title: 'Template does not exist',
      messageKey: 'whatsappErrors.132001.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132001.recovery',
      httpStatus: 404,
    },
  ],

  // 132005 - Template Hydrated Text Too Long
  [
    132005,
    {
      code: 132005,
      title: 'Template Hydrated Text Too Long',
      messageKey: 'whatsappErrors.132005.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132005.recovery',
      httpStatus: 400,
    },
  ],

  // 132007 - Template Format Character Policy Violated
  [
    132007,
    {
      code: 132007,
      title: 'Template Format Character Policy Violated',
      messageKey: 'whatsappErrors.132007.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132007.recovery',
      httpStatus: 400,
    },
  ],

  // 132012 - Template Parameter Format Mismatch
  [
    132012,
    {
      code: 132012,
      title: 'Template Parameter Format Mismatch',
      messageKey: 'whatsappErrors.132012.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132012.recovery',
      httpStatus: 400,
    },
  ],

  // 132015 - Template is Paused
  [
    132015,
    {
      code: 132015,
      title: 'Template is Paused',
      messageKey: 'whatsappErrors.132015.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.132015.recovery',
      httpStatus: 400,
    },
  ],


  // ============================================
  // REGISTRATION ERROR CODES (Requirements 5.x)
  // ============================================

  // 133005 - 2FA PIN mismatch
  [
    133005,
    {
      code: 133005,
      title: 'Two step verification PIN Mismatch',
      messageKey: 'whatsappErrors.133005.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.133005.recovery',
      httpStatus: 400,
    },
  ],

  // 133006 - Phone re-verification needed
  [
    133006,
    {
      code: 133006,
      title: 'Phone number re-verification needed',
      messageKey: 'whatsappErrors.133006.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.133006.recovery',
      httpStatus: 400,
    },
  ],

  // 133008 - Too many 2FA PIN guesses
  [
    133008,
    {
      code: 133008,
      title: 'Too Many two step verification PIN Guesses',
      messageKey: 'whatsappErrors.133008.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: true,
      recoveryKey: 'whatsappErrors.133008.recovery',
      httpStatus: 400,
    },
  ],

  // 133015 - Wait before registering
  [
    133015,
    {
      code: 133015,
      title: 'Wait before registering',
      messageKey: 'whatsappErrors.133015.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: true,
      recoveryKey: 'whatsappErrors.133015.recovery',
      httpStatus: 400,
    },
  ],

  // 133016 - Register rate limit
  [
    133016,
    {
      code: 133016,
      title: 'Account register deregister rate limit exceeded',
      messageKey: 'whatsappErrors.133016.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: true,
      recoveryKey: 'whatsappErrors.133016.recovery',
      httpStatus: 400,
    },
  ],

  // 133000 - Incomplete Deregistration
  [
    133000,
    {
      code: 133000,
      title: 'Incomplete Deregistration',
      messageKey: 'whatsappErrors.133000.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.133000.recovery',
      httpStatus: 500,
    },
  ],

  // 133004 - Server Temporarily Unavailable
  [
    133004,
    {
      code: 133004,
      title: 'Server Temporarily Unavailable',
      messageKey: 'whatsappErrors.133004.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: true,
      recoveryKey: 'whatsappErrors.133004.recovery',
      httpStatus: 503,
    },
  ],

  // 133009 - Two step verification PIN Guessed Too Fast
  [
    133009,
    {
      code: 133009,
      title: 'Two step verification PIN Guessed Too Fast',
      messageKey: 'whatsappErrors.133009.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: true,
      recoveryKey: 'whatsappErrors.133009.recovery',
      httpStatus: 400,
    },
  ],

  // 133010 - Phone number Not Registered
  [
    133010,
    {
      code: 133010,
      title: 'Phone number Not Registered',
      messageKey: 'whatsappErrors.133010.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.133010.recovery',
      httpStatus: 400,
    },
  ],


  // ============================================
  // THROTTLING ERROR CODES (Requirements 1.3)
  // ============================================

  // 4 - API Too Many Calls
  [
    4,
    {
      code: 4,
      title: 'API Too Many Calls',
      messageKey: 'whatsappErrors.4.message',
      category: WhatsAppErrorCategory.THROTTLING,
      retryable: true,
      recoveryKey: 'whatsappErrors.4.recovery',
      httpStatus: 400,
    },
  ],

  // 80007 - Rate limit issues
  [
    80007,
    {
      code: 80007,
      title: 'Rate limit issues',
      messageKey: 'whatsappErrors.80007.message',
      category: WhatsAppErrorCategory.THROTTLING,
      retryable: true,
      recoveryKey: 'whatsappErrors.80007.recovery',
      httpStatus: 400,
    },
  ],

  // 130429 - Rate limit hit
  [
    130429,
    {
      code: 130429,
      title: 'Rate limit hit',
      messageKey: 'whatsappErrors.130429.message',
      category: WhatsAppErrorCategory.THROTTLING,
      retryable: true,
      recoveryKey: 'whatsappErrors.130429.recovery',
      httpStatus: 400,
    },
  ],


  // ============================================
  // OTHER COMMON ERROR CODES (Requirements 1.1)
  // ============================================

  // 1 - API Unknown
  [
    1,
    {
      code: 1,
      title: 'API Unknown',
      messageKey: 'whatsappErrors.1.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.1.recovery',
      httpStatus: 400,
    },
  ],

  // 2 - API Service
  [
    2,
    {
      code: 2,
      title: 'API Service',
      messageKey: 'whatsappErrors.2.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.2.recovery',
      httpStatus: 503,
    },
  ],

  // 3 - API Method
  [
    3,
    {
      code: 3,
      title: 'API Method',
      messageKey: 'whatsappErrors.3.message',
      category: WhatsAppErrorCategory.AUTHORIZATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.3.recovery',
      httpStatus: 500,
    },
  ],

  // 10 - Permission Denied
  [
    10,
    {
      code: 10,
      title: 'Permission Denied',
      messageKey: 'whatsappErrors.10.message',
      category: WhatsAppErrorCategory.AUTHORIZATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.10.recovery',
      httpStatus: 403,
    },
  ],

  // 33 - Parameter value is not valid
  [
    33,
    {
      code: 33,
      title: 'Parameter value is not valid',
      messageKey: 'whatsappErrors.33.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.33.recovery',
      httpStatus: 400,
    },
  ],

  // 100 - Invalid parameter
  [
    100,
    {
      code: 100,
      title: 'Invalid parameter',
      messageKey: 'whatsappErrors.100.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.100.recovery',
      httpStatus: 400,
    },
  ],

  // 190 - Access token has expired
  [
    190,
    {
      code: 190,
      title: 'Access token has expired',
      messageKey: 'whatsappErrors.190.message',
      category: WhatsAppErrorCategory.AUTHORIZATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.190.recovery',
      httpStatus: 401,
    },
  ],

  // 131008 - Required parameter is missing
  [
    131008,
    {
      code: 131008,
      title: 'Required parameter is missing',
      messageKey: 'whatsappErrors.131008.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131008.recovery',
      httpStatus: 400,
    },
  ],

  // 131009 - Parameter value is not valid
  [
    131009,
    {
      code: 131009,
      title: 'Parameter value is not valid',
      messageKey: 'whatsappErrors.131009.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131009.recovery',
      httpStatus: 400,
    },
  ],

  // 131026 - Message Undeliverable
  [
    131026,
    {
      code: 131026,
      title: 'Message Undeliverable',
      messageKey: 'whatsappErrors.131026.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131026.recovery',
      httpStatus: 400,
    },
  ],

  // 131042 - Business eligibility payment issue
  [
    131042,
    {
      code: 131042,
      title: 'Business eligibility payment issue',
      messageKey: 'whatsappErrors.131042.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131042.recovery',
      httpStatus: 400,
    },
  ],

  // 131045 - Incorrect certificate
  [
    131045,
    {
      code: 131045,
      title: 'Incorrect certificate',
      messageKey: 'whatsappErrors.131045.message',
      category: WhatsAppErrorCategory.REGISTRATION,
      retryable: false,
      recoveryKey: 'whatsappErrors.131045.recovery',
      httpStatus: 500,
    },
  ],

  // 131047 - Re-engagement message
  [
    131047,
    {
      code: 131047,
      title: 'Re-engagement message',
      messageKey: 'whatsappErrors.131047.message',
      category: WhatsAppErrorCategory.TEMPLATE_SEND,
      retryable: false,
      recoveryKey: 'whatsappErrors.131047.recovery',
      httpStatus: 400,
    },
  ],

  // 131051 - Unsupported message type
  [
    131051,
    {
      code: 131051,
      title: 'Unsupported message type',
      messageKey: 'whatsappErrors.131051.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.131051.recovery',
      httpStatus: 400,
    },
  ],

  // 131052 - Media download error
  [
    131052,
    {
      code: 131052,
      title: 'Media download error',
      messageKey: 'whatsappErrors.131052.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.131052.recovery',
      httpStatus: 400,
    },
  ],

  // 131053 - Media upload error
  [
    131053,
    {
      code: 131053,
      title: 'Media upload error',
      messageKey: 'whatsappErrors.131053.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: true,
      recoveryKey: 'whatsappErrors.131053.recovery',
      httpStatus: 400,
    },
  ],

  // 135000 - Generic user error
  [
    135000,
    {
      code: 135000,
      title: 'Generic user error',
      messageKey: 'whatsappErrors.135000.message',
      category: WhatsAppErrorCategory.OTHER,
      retryable: false,
      recoveryKey: 'whatsappErrors.135000.recovery',
      httpStatus: 400,
    },
  ],

  // 131031 - Account has been locked
  [
    131031,
    {
      code: 131031,
      title: 'Account has been locked',
      messageKey: 'whatsappErrors.131031.message',
      category: WhatsAppErrorCategory.INTEGRITY,
      retryable: false,
      recoveryKey: 'whatsappErrors.131031.recovery',
      httpStatus: 403,
    },
  ],
])

/**
 * Get error info by code
 * Returns generic error info if code is not found
 */
export function getWhatsAppErrorInfo(code: number): WhatsAppErrorInfo {
  const errorInfo = WHATSAPP_ERROR_CODES.get(code)

  if (errorInfo) {
    return errorInfo
  }

  // Return generic error for unknown codes
  return {
    code,
    title: 'Unknown Error',
    messageKey: 'whatsappErrors.unknown.message',
    category: WhatsAppErrorCategory.OTHER,
    retryable: code >= 500 || code === 0,
    recoveryKey: 'whatsappErrors.unknown.recovery',
    httpStatus: 500,
  }
}

/**
 * Check if an error code is retryable
 */
export function isWhatsAppErrorRetryable(code: number): boolean {
  const errorInfo = getWhatsAppErrorInfo(code)
  return errorInfo.retryable
}

/**
 * Get error category by code
 */
export function getWhatsAppErrorCategory(code: number): WhatsAppErrorCategory {
  const errorInfo = getWhatsAppErrorInfo(code)
  return errorInfo.category
}

/**
 * Get all error codes for a specific category
 */
export function getErrorCodesByCategory(
  category: WhatsAppErrorCategory
): number[] {
  const codes: number[] = []
  WHATSAPP_ERROR_CODES.forEach((info, code) => {
    if (info.category === category) {
      codes.push(code)
    }
  })
  return codes
}
