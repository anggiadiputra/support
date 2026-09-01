/**
 * Payment Provider Error Classes
 * 
 * Standardized error classes for payment provider operations.
 * These errors provide consistent error handling across all payment gateways.
 * 
 * Requirements: 2.6
 */

// =============================================================================
// Base Error Class
// =============================================================================

/**
 * Base error class for all payment provider errors
 * 
 * Provides a consistent structure for payment-related errors including:
 * - Provider identification
 * - Error code for programmatic handling
 * - Original error preservation for debugging
 */
export class PaymentProviderError extends Error {
  /**
   * @param providerId - The ID of the provider that generated the error
   * @param code - A machine-readable error code
   * @param message - Human-readable error message
   * @param originalError - The original error that caused this error (if any)
   */
  constructor(
    public readonly providerId: string,
    public readonly code: string,
    message: string,
    public readonly originalError?: Error
  ) {
    super(message);
    this.name = 'PaymentProviderError';
    
    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, PaymentProviderError);
    }
  }

  /**
   * Convert error to a JSON-serializable object for logging
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      providerId: this.providerId,
      code: this.code,
      message: this.message,
      originalError: this.originalError?.message,
    };
  }
}

// =============================================================================
// Specific Error Classes
// =============================================================================

/**
 * Error thrown when a provider is not properly configured
 * 
 * This typically means:
 * - Missing API keys or credentials
 * - Provider is disabled in admin settings
 * - Required configuration fields are empty
 */
export class ProviderNotConfiguredError extends PaymentProviderError {
  constructor(providerId: string) {
    super(
      providerId,
      'PROVIDER_NOT_CONFIGURED',
      `Provider ${providerId} is not configured`
    );
    this.name = 'ProviderNotConfiguredError';
  }
}

/**
 * Error thrown when a requested provider is not found in the registry
 * 
 * This typically means:
 * - The provider ID is invalid or misspelled
 * - The provider has not been registered with the gateway manager
 */
export class ProviderNotFoundError extends PaymentProviderError {
  constructor(providerId: string) {
    super(
      providerId,
      'PROVIDER_NOT_FOUND',
      `Provider ${providerId} not found`
    );
    this.name = 'ProviderNotFoundError';
  }
}

/**
 * Error thrown when webhook callback validation fails
 * 
 * This typically means:
 * - Invalid signature in the callback
 * - Missing required fields in the callback payload
 * - Callback format doesn't match expected format
 */
export class WebhookValidationError extends PaymentProviderError {
  constructor(providerId: string, reason: string) {
    super(
      providerId,
      'WEBHOOK_VALIDATION_FAILED',
      `Webhook validation failed: ${reason}`
    );
    this.name = 'WebhookValidationError';
  }
}

/**
 * Error thrown when a payment creation fails
 * 
 * This wraps provider-specific errors into a standard format
 */
export class PaymentCreationError extends PaymentProviderError {
  constructor(providerId: string, reason: string, originalError?: Error) {
    super(
      providerId,
      'PAYMENT_CREATION_FAILED',
      `Payment creation failed: ${reason}`,
      originalError
    );
    this.name = 'PaymentCreationError';
  }
}

/**
 * Error thrown when a payment status check fails
 */
export class PaymentStatusCheckError extends PaymentProviderError {
  constructor(providerId: string, orderId: string, reason: string, originalError?: Error) {
    super(
      providerId,
      'STATUS_CHECK_FAILED',
      `Status check failed for order ${orderId}: ${reason}`,
      originalError
    );
    this.name = 'PaymentStatusCheckError';
  }
}

/**
 * Error thrown when provider API times out
 */
export class ProviderTimeoutError extends PaymentProviderError {
  constructor(providerId: string, operation: string) {
    super(
      providerId,
      'PROVIDER_TIMEOUT',
      `Provider ${providerId} timed out during ${operation}`
    );
    this.name = 'ProviderTimeoutError';
  }
}

/**
 * Error thrown when no active providers are available
 */
export class NoActiveProviderError extends PaymentProviderError {
  constructor() {
    super(
      'none',
      'NO_ACTIVE_PROVIDER',
      'No active payment provider available'
    );
    this.name = 'NoActiveProviderError';
  }
}
