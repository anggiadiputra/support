/**
 * Error Messages Service
 * Centralized error message handling with i18n support
 */

export {
  // Types
  type Locale,
  type WhatsAppErrorMessage,
  // Functions
  getLocaleFromHeader,
  getWhatsAppErrorMessage,
  formatWhatsAppApiError,
  getAllErrorCodes,
  isKnownErrorCode,
  getErrorMetadata,
} from './whatsapp-errors.js';
