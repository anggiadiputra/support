import type { VariableType, TemplateVariable } from '@prisma/client';
import { WhatsAppErrorService } from './whatsapp-error-service.js';

/**
 * Validation result for a single variable
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  field?: string;
}

/**
 * Validation result with variable context
 */
export interface VariableValidationResult extends ValidationResult {
  variableId: string;
  variableName: string;
}

/**
 * Complete validation response
 */
export interface ValidationResponse {
  valid: boolean;
  errors: VariableValidationResult[];
}

/**
 * Error codes for template validation
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export const TEMPLATE_VALIDATOR_ERRORS = {
  INVALID_URL: 'Invalid URL format. URL must start with http:// or https://',
  INVALID_CURRENCY: 'Invalid currency format. Expected format: "IDR 100000" or "100000"',
  INVALID_DATE: 'Invalid date format. Expected format: YYYY-MM-DD or DD/MM/YYYY',
  TEXT_TOO_LONG: 'Text exceeds maximum length',
  MISSING_REQUIRED: 'This field is required',
  VARIABLE_COUNT_MISMATCH: 'Number of variables does not match template requirements',
  INVALID_MEDIA_URL: 'Invalid media URL. Must be a valid HTTPS URL or media ID',
  EMPTY_VALUE: 'Value cannot be empty',
} as const;

/**
 * Validation constraints
 */
const VALIDATION_CONSTRAINTS = {
  TEXT_MAX_LENGTH: 1024,
  URL_MAX_LENGTH: 2000,
  CURRENCY_MAX_AMOUNT: 999999999999, // Max amount in smallest unit
};

/**
 * TemplateValidatorService
 * 
 * Handles validation of template variable values before sending.
 * Validates URL, currency, date formats and text length.
 * 
 * Requirements: 2.4, 2.5, 4.1, 7.1, 7.2, 7.3, 7.4, 10.3, 10.4, 10.5
 */
export class TemplateValidatorService {
  // ============================================
  // Individual Value Validators (Requirements: 2.4, 7.1, 10.3, 10.4, 10.5)
  // ============================================

  /**
   * Validate a single variable value based on its type
   * 
   * @param value - The value to validate
   * @param type - The variable type
   * @returns Validation result
   * Requirements: 2.4, 7.1
   */
  validateVariableValue(value: string, type: VariableType): ValidationResult {
    // Check for empty value first
    if (!value || value.trim() === '') {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.EMPTY_VALUE };
    }

    switch (type) {
      case 'URL':
        return this.validateUrlValue(value);
      case 'CURRENCY':
        return this.validateCurrencyValue(value);
      case 'DATE':
        return this.validateDateValue(value);
      case 'IMAGE':
      case 'VIDEO':
      case 'DOCUMENT':
        return this.validateMediaValue(value);
      case 'TEXT':
      default:
        return this.validateTextValue(value);
    }
  }

  /**
   * Validate URL format
   * Requirements: 7.1, 10.3
   * 
   * @param url - URL string to validate
   * @returns Validation result
   */
  validateUrl(url: string): boolean {
    return this.validateUrlValue(url).valid;
  }

  /**
   * Internal URL validation with detailed result
   */
  private validateUrlValue(url: string): ValidationResult {
    if (!url || url.trim() === '') {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.EMPTY_VALUE };
    }

    // Check length
    if (url.length > VALIDATION_CONSTRAINTS.URL_MAX_LENGTH) {
      return { 
        valid: false, 
        error: `${TEMPLATE_VALIDATOR_ERRORS.TEXT_TOO_LONG} (max ${VALIDATION_CONSTRAINTS.URL_MAX_LENGTH} characters)` 
      };
    }

    // URL regex pattern - must start with http:// or https://
    const urlPattern = /^https?:\/\/(?:[\w-]+\.)+[\w-]+(?:\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?$/i;
    
    // Also allow localhost for development
    const localhostPattern = /^https?:\/\/localhost(?::\d+)?(?:\/[\w\-.~:/?#[\]@!$&'()*+,;=%]*)?$/i;

    if (urlPattern.test(url) || localhostPattern.test(url)) {
      return { valid: true };
    }

    // Try URL constructor as fallback
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return { valid: true };
      }
    } catch {
      // URL parsing failed
    }

    return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_URL };
  }

  /**
   * Validate currency format
   * Requirements: 10.4
   * 
   * Expected formats:
   * - "100000" (number only)
   * - "IDR 100000" (currency code + number)
   * - "100,000" (with thousand separator)
   * - "IDR 100,000.00" (full format)
   * 
   * @param value - Currency string to validate
   * @returns boolean
   */
  validateCurrency(value: string): boolean {
    return this.validateCurrencyValue(value).valid;
  }

  /**
   * Internal currency validation with detailed result
   */
  private validateCurrencyValue(value: string): ValidationResult {
    if (!value || value.trim() === '') {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.EMPTY_VALUE };
    }

    const trimmed = value.trim();

    // Pattern 1: Just a number (with optional decimals and thousand separators)
    // Examples: "100000", "100,000", "100000.00", "100,000.00"
    const numberOnlyPattern = /^[\d,]+(?:\.\d{1,2})?$/;

    // Pattern 2: Currency code + number
    // Examples: "IDR 100000", "USD 100.00", "EUR 1,000.00"
    const currencyWithCodePattern = /^[A-Z]{3}\s+[\d,]+(?:\.\d{1,2})?$/;

    if (numberOnlyPattern.test(trimmed) || currencyWithCodePattern.test(trimmed)) {
      // Extract numeric value and check range
      const numericStr = trimmed.replace(/[A-Z\s,]/g, '');
      const numericValue = parseFloat(numericStr);
      
      if (isNaN(numericValue) || numericValue < 0) {
        return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_CURRENCY };
      }

      if (numericValue > VALIDATION_CONSTRAINTS.CURRENCY_MAX_AMOUNT) {
        return { valid: false, error: 'Currency amount exceeds maximum allowed value' };
      }

      return { valid: true };
    }

    return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_CURRENCY };
  }

  /**
   * Validate date format
   * Requirements: 10.5
   * 
   * Supported formats:
   * - YYYY-MM-DD (ISO format)
   * - DD/MM/YYYY (Indonesian format)
   * - DD-MM-YYYY
   * - MM/DD/YYYY (US format)
   * 
   * @param value - Date string to validate
   * @returns boolean
   */
  validateDate(value: string): boolean {
    return this.validateDateValue(value).valid;
  }

  /**
   * Internal date validation with detailed result
   */
  private validateDateValue(value: string): ValidationResult {
    if (!value || value.trim() === '') {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.EMPTY_VALUE };
    }

    const trimmed = value.trim();

    // ISO format: YYYY-MM-DD
    const isoPattern = /^\d{4}-\d{2}-\d{2}$/;
    
    // DD/MM/YYYY or DD-MM-YYYY
    const ddmmyyyyPattern = /^\d{2}[/-]\d{2}[/-]\d{4}$/;

    // Check pattern match
    if (!isoPattern.test(trimmed) && !ddmmyyyyPattern.test(trimmed)) {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_DATE };
    }

    // Parse and validate the actual date
    let year: number, month: number, day: number;

    if (isoPattern.test(trimmed)) {
      // YYYY-MM-DD
      [year, month, day] = trimmed.split('-').map(Number);
    } else {
      // DD/MM/YYYY or DD-MM-YYYY
      const parts = trimmed.split(/[/-]/);
      day = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
      year = parseInt(parts[2], 10);
    }

    // Validate ranges
    if (month < 1 || month > 12) {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_DATE };
    }

    if (day < 1 || day > 31) {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_DATE };
    }

    // Validate the date is real (handles leap years, month lengths)
    const date = new Date(year, month - 1, day);
    if (
      date.getFullYear() !== year ||
      date.getMonth() !== month - 1 ||
      date.getDate() !== day
    ) {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_DATE };
    }

    // Validate year is reasonable (1900-2100)
    if (year < 1900 || year > 2100) {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_DATE };
    }

    return { valid: true };
  }

  /**
   * Validate text length
   * 
   * @param value - Text to validate
   * @param maxLength - Maximum allowed length (default: 1024)
   * @returns Validation result
   */
  validateTextLength(value: string, maxLength = VALIDATION_CONSTRAINTS.TEXT_MAX_LENGTH): ValidationResult {
    if (!value || value.trim() === '') {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.EMPTY_VALUE };
    }

    if (value.length > maxLength) {
      return { 
        valid: false, 
        error: `${TEMPLATE_VALIDATOR_ERRORS.TEXT_TOO_LONG} (max ${maxLength} characters, got ${value.length})` 
      };
    }

    return { valid: true };
  }

  /**
   * Internal text validation
   */
  private validateTextValue(value: string): ValidationResult {
    return this.validateTextLength(value);
  }

  /**
   * Validate media value (URL or media ID)
   * Media can be either a WhatsApp media_id or a publicly accessible HTTPS URL
   */
  private validateMediaValue(value: string): ValidationResult {
    if (!value || value.trim() === '') {
      return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.EMPTY_VALUE };
    }

    const trimmed = value.trim();

    // If it starts with http, validate as URL
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      // For media, only HTTPS is allowed
      if (trimmed.startsWith('http://')) {
        return { valid: false, error: 'Media URL must use HTTPS' };
      }
      return this.validateUrlValue(trimmed);
    }

    // Otherwise, treat as media_id (alphanumeric string)
    // WhatsApp media IDs are typically numeric or alphanumeric
    const mediaIdPattern = /^[\w-]+$/;
    if (mediaIdPattern.test(trimmed)) {
      return { valid: true };
    }

    return { valid: false, error: TEMPLATE_VALIDATOR_ERRORS.INVALID_MEDIA_URL };
  }

  // ============================================
  // Complete Validation Flow (Requirements: 2.5, 4.1, 7.2, 7.3, 7.4)
  // ============================================

  /**
   * Validate all variable values before sending
   * 
   * @param variableValues - Map of variableId to value
   * @param variables - Array of TemplateVariable definitions
   * @returns Complete validation response with all errors
   * Requirements: 2.5, 4.1, 7.2, 7.3, 7.4
   */
  validateAllVariables(
    variableValues: Record<string, string>,
    variables: TemplateVariable[]
  ): ValidationResponse {
    const errors: VariableValidationResult[] = [];

    for (const variable of variables) {
      const value = variableValues[variable.id];
      
      // Check if required variable is missing
      if (!value || value.trim() === '') {
        errors.push({
          valid: false,
          error: TEMPLATE_VALIDATOR_ERRORS.MISSING_REQUIRED,
          variableId: variable.id,
          variableName: variable.name,
          field: variable.name,
        });
        continue;
      }

      // Validate value based on type
      const result = this.validateVariableValue(value, variable.type);
      
      if (!result.valid) {
        errors.push({
          valid: false,
          error: result.error,
          variableId: variable.id,
          variableName: variable.name,
          field: variable.name,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate that all required variables are filled
   * 
   * @param variableValues - Map of variableId to value
   * @param requiredVariableIds - Array of required variable IDs
   * @returns Validation result
   * Requirements: 2.5
   */
  validateRequiredVariables(
    variableValues: Record<string, string>,
    requiredVariableIds: string[]
  ): ValidationResult {
    const missingVariables: string[] = [];

    for (const variableId of requiredVariableIds) {
      const value = variableValues[variableId];
      if (!value || value.trim() === '') {
        missingVariables.push(variableId);
      }
    }

    if (missingVariables.length > 0) {
      return {
        valid: false,
        error: `Missing required variables: ${missingVariables.length} variable(s) not filled`,
      };
    }

    return { valid: true };
  }

  /**
   * Validate variable count matches template requirements
   * 
   * @param providedCount - Number of variables provided
   * @param requiredCount - Number of variables required by template
   * @returns Validation result
   * Requirements: 7.2
   */
  validateVariableCount(providedCount: number, requiredCount: number): ValidationResult {
    if (providedCount !== requiredCount) {
      return {
        valid: false,
        error: `${TEMPLATE_VALIDATOR_ERRORS.VARIABLE_COUNT_MISMATCH}. Expected ${requiredCount}, got ${providedCount}`,
      };
    }

    return { valid: true };
  }

  /**
   * Get human-readable error message for WhatsApp API error
   * Uses WhatsAppErrorService for consistent error handling (Requirement 7.1)
   * 
   * @param errorCode - WhatsApp API error code
   * @param errorMessage - Original error message
   * @returns User-friendly error message
   * Requirements: 7.1, 7.3
   */
  getReadableErrorMessage(errorCode: string | number, errorMessage: string): string {
    const code = typeof errorCode === 'string' ? parseInt(errorCode, 10) : errorCode;
    
    // Use WhatsAppErrorService for consistent error handling
    if (!isNaN(code)) {
      const errorInfo = WhatsAppErrorService.getErrorInfo(code);
      // Return the i18n message key - frontend will translate it
      return errorInfo.messageKey;
    }
    
    // Fallback for non-numeric error codes
    return `WhatsApp error: ${errorMessage}`;
  }
}

// Export singleton instance
export const templateValidatorService = new TemplateValidatorService();
