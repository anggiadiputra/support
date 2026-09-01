/**
 * WhatsApp Error Messages Service
 * Centralized service for handling WhatsApp error messages with i18n support
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ==========================================
// Types
// ==========================================

export type Locale = 'en' | 'id';

export interface WhatsAppErrorMessage {
  error_code: string;
  message: string;
  recovery_action: string;
  category: string;
  retryable: boolean;
  http_status: 400 | 401 | 403 | 404 | 429 | 500 | 503;
}

interface LocaleErrorData {
  message: string;
  recovery_action: string;
  category: string;
}

// ==========================================
// Error Metadata (non-translatable)
// ==========================================

/**
 * Static error metadata that doesn't change with locale
 * Maps error code to { error_code, retryable, http_status }
 * Source: docs/plans/error.md (Meta Cloud API documentation)
 */
const ERROR_METADATA: Record<string, { error_code: string; retryable: boolean; http_status: 400 | 401 | 403 | 404 | 429 | 500 | 503 }> = {
  // ==========================================
  // AUTHORIZATION ERRORS
  // ==========================================
  '0': { error_code: 'AuthException', retryable: false, http_status: 401 },
  '3': { error_code: 'ApiMethodError', retryable: false, http_status: 500 },
  '10': { error_code: 'PermissionDenied', retryable: false, http_status: 403 },
  '190': { error_code: 'TokenExpired', retryable: false, http_status: 401 },
  '200': { error_code: 'ApiPermission', retryable: false, http_status: 403 },
  '131005': { error_code: 'AccessDenied', retryable: false, http_status: 403 },

  // ==========================================
  // INTEGRITY / POLICY ERRORS
  // ==========================================
  '368': { error_code: 'AccountRestricted', retryable: false, http_status: 403 },
  '130497': { error_code: 'CountryRestriction', retryable: false, http_status: 403 },
  '131031': { error_code: 'AccountLocked', retryable: false, http_status: 403 },

  // ==========================================
  // RATE LIMITING / THROTTLING
  // ==========================================
  '4': { error_code: 'TooManyCalls', retryable: true, http_status: 429 },
  '80007': { error_code: 'RateLimitHit', retryable: true, http_status: 429 },
  '130429': { error_code: 'RateLimitHit', retryable: true, http_status: 429 },
  '131048': { error_code: 'SpamRateLimitHit', retryable: false, http_status: 429 },
  '131056': { error_code: 'PairRateLimitHit', retryable: true, http_status: 429 },
  '133016': { error_code: 'RegisterDeregisterRateLimit', retryable: true, http_status: 429 },

  // ==========================================
  // PAYMENT / BILLING
  // ==========================================
  '131042': { error_code: 'PaymentIssue', retryable: false, http_status: 400 },
  '134011': { error_code: 'PaymentToSNotAccepted', retryable: false, http_status: 400 },

  // ==========================================
  // TEMPLATE SEND ERRORS
  // ==========================================
  '132000': { error_code: 'TemplateParamMismatch', retryable: false, http_status: 400 },
  '132001': { error_code: 'TemplateNotFound', retryable: false, http_status: 404 },
  '132005': { error_code: 'TemplateTextTooLong', retryable: false, http_status: 400 },
  '132007': { error_code: 'TemplateFormatViolation', retryable: false, http_status: 400 },
  '132012': { error_code: 'TemplateParamFormatMismatch', retryable: false, http_status: 400 },
  '132015': { error_code: 'TemplatePaused', retryable: false, http_status: 400 },
  '132016': { error_code: 'TemplateDisabled', retryable: false, http_status: 400 },
  '132068': { error_code: 'FlowBlocked', retryable: false, http_status: 400 },
  '132069': { error_code: 'FlowThrottled', retryable: true, http_status: 429 },
  '131051': { error_code: 'UnsupportedMessageType', retryable: false, http_status: 400 },
  '131055': { error_code: 'OnlyMarketingTemplates', retryable: false, http_status: 400 },
  '134100': { error_code: 'OnlyMarketingMessages', retryable: false, http_status: 400 },
  '134101': { error_code: 'TemplateSyncing', retryable: true, http_status: 400 },
  '134102': { error_code: 'TemplateUnavailable', retryable: false, http_status: 500 },

  // ==========================================
  // TEMPLATE CREATION ERRORS
  // ==========================================
  '2388019': { error_code: 'TemplateLimitExceeded', retryable: false, http_status: 400 },
  '2388040': { error_code: 'TemplateCharLimitExceeded', retryable: false, http_status: 400 },
  '2388047': { error_code: 'TemplateHeaderFormatIncorrect', retryable: false, http_status: 400 },
  '2388072': { error_code: 'TemplateBodyFormatIncorrect', retryable: false, http_status: 400 },
  '2388073': { error_code: 'TemplateFooterFormatIncorrect', retryable: false, http_status: 400 },
  '2388293': { error_code: 'TemplateParamRatioExceeded', retryable: false, http_status: 400 },
  '2388299': { error_code: 'TemplateLeadingTrailingParams', retryable: false, http_status: 400 },

  // ==========================================
  // RECIPIENT ERRORS
  // ==========================================
  '131021': { error_code: 'RecipientCannotBeSender', retryable: false, http_status: 400 },
  '131026': { error_code: 'MessageUndeliverable', retryable: false, http_status: 400 },
  '131047': { error_code: 'WindowExpired', retryable: false, http_status: 400 },
  '131049': { error_code: 'MessageNotDelivered', retryable: false, http_status: 400 },
  '131050': { error_code: 'UserOptedOut', retryable: false, http_status: 400 },
  '131062': { error_code: 'BsuidNotSupportedForAuthTemplate', retryable: false, http_status: 400 },
  '130472': { error_code: 'UserInExperiment', retryable: false, http_status: 400 },
  '133010': { error_code: 'PhoneNotRegistered', retryable: false, http_status: 400 },

  // ==========================================
  // PARAMETER / VALIDATION ERRORS
  // ==========================================
  '33': { error_code: 'PhoneDeleted', retryable: false, http_status: 400 },
  '100': { error_code: 'InvalidParameter', retryable: false, http_status: 400 },
  '131008': { error_code: 'MissingParameter', retryable: false, http_status: 400 },
  '131009': { error_code: 'InvalidParameterValue', retryable: false, http_status: 400 },
  '135000': { error_code: 'GenericUserError', retryable: false, http_status: 400 },

  // ==========================================
  // MEDIA ERRORS
  // ==========================================
  '131052': { error_code: 'MediaDownloadError', retryable: true, http_status: 400 },
  '131053': { error_code: 'MediaUploadError', retryable: true, http_status: 400 },

  // ==========================================
  // SERVICE / SERVER ERRORS
  // ==========================================
  '1': { error_code: 'ApiUnknown', retryable: true, http_status: 400 },
  '2': { error_code: 'ServiceUnavailable', retryable: true, http_status: 503 },
  '131000': { error_code: 'GenericError', retryable: true, http_status: 500 },
  '131016': { error_code: 'ServiceUnavailable', retryable: true, http_status: 503 },
  '131057': { error_code: 'AccountMaintenance', retryable: true, http_status: 503 },
  '133004': { error_code: 'ServiceUnavailable', retryable: true, http_status: 503 },
  '2494100': { error_code: 'AccountMaintenance', retryable: true, http_status: 503 },

  // ==========================================
  // REGISTRATION / PHONE ERRORS
  // ==========================================
  '131037': { error_code: 'DisplayNameNotApproved', retryable: false, http_status: 400 },
  '131045': { error_code: 'IncorrectCertificate', retryable: false, http_status: 500 },
  '133000': { error_code: 'IncompleteDeregistration', retryable: false, http_status: 500 },
  '133005': { error_code: 'TwoStepPinMismatch', retryable: false, http_status: 400 },
  '133006': { error_code: 'PhoneReverificationNeeded', retryable: false, http_status: 400 },
  '133008': { error_code: 'TooManyPinGuesses', retryable: false, http_status: 400 },
  '133009': { error_code: 'PinGuessedTooFast', retryable: false, http_status: 400 },
  '133015': { error_code: 'WaitBeforeRegistering', retryable: true, http_status: 400 },

  // ==========================================
  // MIGRATION ERRORS
  // ==========================================
  '2388001': { error_code: 'MigrationOwnershipConfirm', retryable: false, http_status: 400 },
  '2388012': { error_code: 'PhoneAlreadyExists', retryable: false, http_status: 400 },
  '2388091': { error_code: 'PhoneNotEligibleMigration', retryable: false, http_status: 400 },
  '2388093': { error_code: 'PhoneNotEligibleMigration', retryable: false, http_status: 400 },
  '2388103': { error_code: 'MigrationError', retryable: false, http_status: 400 },

  // ==========================================
  // SYNCHRONIZATION ERRORS
  // ==========================================
  '2593107': { error_code: 'SyncRequestLimitExceeded', retryable: false, http_status: 400 },
  '2593108': { error_code: 'SyncRequestOutsideWindow', retryable: false, http_status: 400 },

  // ==========================================
  // INSIGHT ERRORS
  // ==========================================
  '200005': { error_code: 'TemplateInsightsUnavailable', retryable: false, http_status: 400 },
  '200006': { error_code: 'CannotDisableInsights', retryable: false, http_status: 400 },
  '200007': { error_code: 'InsightsNotEnabled', retryable: false, http_status: 400 },

  // ==========================================
  // WABA ERRORS
  // ==========================================
  '2593079': { error_code: 'WabaMarkedForMigration', retryable: false, http_status: 400 },
  '2593085': { error_code: 'InvalidWabaForObo', retryable: false, http_status: 400 },
  '1752041': { error_code: 'DuplicateOnboardingRequest', retryable: false, http_status: 400 },

  // ==========================================
  // SUBCODE-SPECIFIC ERRORS
  // ==========================================
  '100_33': { error_code: 'PhoneNumberDisconnected', retryable: false, http_status: 400 },
};

// ==========================================
// Locale Messages Map (lazy-loaded)
// ==========================================

let localeMessagesCache: Record<Locale, Record<string, LocaleErrorData>> | null = null;

function loadLocaleMessages(): Record<Locale, Record<string, LocaleErrorData>> {
  if (localeMessagesCache) {
    return localeMessagesCache;
  }

  const enPath = join(__dirname, 'locales', 'en.json');
  const idPath = join(__dirname, 'locales', 'id.json');

  localeMessagesCache = {
    en: JSON.parse(readFileSync(enPath, 'utf-8')),
    id: JSON.parse(readFileSync(idPath, 'utf-8')),
  };

  return localeMessagesCache;
}

// ==========================================
// Helper Functions
// ==========================================

/**
 * Parse Accept-Language header and return the best matching locale
 * @param acceptLanguage - The Accept-Language header value
 * @returns The best matching locale (defaults to 'id')
 */
export function getLocaleFromHeader(acceptLanguage: string | undefined): Locale {
  if (!acceptLanguage) {
    return 'id'; // Default to Indonesian
  }

  // Parse Accept-Language header (e.g., "en-US,en;q=0.9,id;q=0.8")
  const languages = acceptLanguage
    .split(',')
    .map((lang) => {
      const [code, qValue] = lang.trim().split(';q=');
      return {
        code: code.split('-')[0].toLowerCase(), // Get primary language tag
        q: qValue ? parseFloat(qValue) : 1.0,
      };
    })
    .sort((a, b) => b.q - a.q);

  // Find first matching locale
  for (const lang of languages) {
    if (lang.code === 'en') return 'en';
    if (lang.code === 'id') return 'id';
  }

  return 'id'; // Default to Indonesian
}

/**
 * Get WhatsApp error message for a specific error code and locale
 * @param code - The WhatsApp error code
 * @param locale - The locale to use
 * @param subcode - Optional subcode for more specific errors
 * @returns The error message object or null if not found
 */
export function getWhatsAppErrorMessage(
  code: number,
  locale: Locale,
  subcode?: number
): WhatsAppErrorMessage | null {
  // Check for subcode-specific error first
  const subcodeKey = subcode !== undefined ? `${code}_${subcode}` : null;
  const codeKey = String(code);

  // Try subcode-specific first, then fall back to main code
  const lookupKey = subcodeKey && ERROR_METADATA[subcodeKey] ? subcodeKey : codeKey;

  const metadata = ERROR_METADATA[lookupKey];
  if (!metadata) {
    return null;
  }

  const localeMessages = loadLocaleMessages();
  const messages = localeMessages[locale];
  const localeData = messages[lookupKey];

  if (!localeData) {
    return null;
  }

  return {
    error_code: metadata.error_code,
    message: localeData.message,
    recovery_action: localeData.recovery_action,
    category: localeData.category,
    retryable: metadata.retryable,
    http_status: metadata.http_status,
  };
}

/**
 * Format WhatsApp API error response with locale support
 * @param code - The WhatsApp error code
 * @param locale - The locale to use
 * @param subcode - Optional subcode for more specific errors
 * @returns Formatted error response object
 */
export function formatWhatsAppApiError(
  code: number,
  locale: Locale,
  subcode?: number
): { error: WhatsAppErrorMessage } | null {
  const errorMessage = getWhatsAppErrorMessage(code, locale, subcode);

  if (!errorMessage) {
    return null;
  }

  return {
    error: errorMessage,
  };
}

/**
 * Get all available error codes
 * @returns Array of all supported error codes
 */
export function getAllErrorCodes(): string[] {
  return Object.keys(ERROR_METADATA);
}

/**
 * Check if an error code is supported
 * @param code - The error code to check
 * @param subcode - Optional subcode
 * @returns True if the error code is supported
 */
export function isKnownErrorCode(code: number, subcode?: number): boolean {
  const subcodeKey = subcode !== undefined ? `${code}_${subcode}` : null;
  const codeKey = String(code);

  return !!(subcodeKey && ERROR_METADATA[subcodeKey]) || !!ERROR_METADATA[codeKey];
}

/**
 * Get error metadata without locale-specific content
 * Useful for determining retryable status without fetching full message
 * @param code - The error code
 * @param subcode - Optional subcode
 * @returns Error metadata or null
 */
export function getErrorMetadata(
  code: number,
  subcode?: number
): { error_code: string; retryable: boolean; http_status: 400 | 401 | 403 | 404 | 429 | 500 | 503 } | null {
  const subcodeKey = subcode !== undefined ? `${code}_${subcode}` : null;
  const codeKey = String(code);
  const lookupKey = subcodeKey && ERROR_METADATA[subcodeKey] ? subcodeKey : codeKey;

  return ERROR_METADATA[lookupKey] ?? null;
}
