/**
 * Payment Provider Types and Interfaces
 * 
 * Defines the standardized interface for payment providers in the multi-gateway system.
 * All payment providers (Duitku, Xendit, etc.) must implement the PaymentProvider interface.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */

// =============================================================================
// Type Definitions
// =============================================================================

/**
 * Supported payment methods across all providers
 */
export type PaymentMethod = 
  | 'QRIS' 
  | 'VA_BCA' 
  | 'VA_BNI' 
  | 'VA_MANDIRI' 
  | 'VA_PERMATA' 
  | 'EWALLET';

/**
 * Standardized payment status across all providers
 */
export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED';

/**
 * Provider health status for monitoring
 */
export type ProviderHealth = 'healthy' | 'degraded' | 'unhealthy';

// =============================================================================
// Parameter Interfaces
// =============================================================================

/**
 * Parameters for creating a new payment
 */
export interface CreatePaymentParams {
  /** Unique order identifier */
  orderId: string;
  /** Payment amount in smallest currency unit (e.g., cents, rupiah) */
  amount: number;
  /** Customer's email address */
  customerEmail: string;
  /** Customer's display name */
  customerName: string;
  /** Description of the product/service being purchased */
  productDetails: string;
  /** URL to redirect after payment completion */
  returnUrl: string;
  /** Payment method to use */
  paymentMethod: PaymentMethod;
  /** Payment expiry time in minutes (optional, provider default if not specified) */
  expiryMinutes?: number;
}

// =============================================================================
// Result Interfaces
// =============================================================================

/**
 * Result of creating a payment
 */
export interface CreatePaymentResult {
  /** Whether the payment was created successfully */
  success: boolean;
  /** Provider's reference number for the transaction */
  referenceNo?: string;
  /** URL to redirect user for payment (if applicable) */
  paymentUrl?: string;
  /** QR code string for QRIS payments */
  qrString?: string;
  /** URL to QR code image */
  qrUrl?: string;
  /** Virtual account number for VA payments */
  vaNumber?: string;
  /** When the payment expires */
  expiresAt?: Date;
  /** Error message if creation failed */
  error?: string;
  /** Provider-specific error code */
  errorCode?: string;
}

/**
 * Result of checking payment status
 */
export interface CheckStatusResult {
  /** Whether the status check was successful */
  success: boolean;
  /** Current payment status */
  status: PaymentStatus;
  /** Payment amount (if available) */
  amount?: number;
  /** When the payment was completed (if successful) */
  paidAt?: Date;
  /** Error message if status check failed */
  error?: string;
}

/**
 * Result of validating a webhook callback
 */
export interface CallbackValidationResult {
  /** Whether the callback signature is valid */
  valid: boolean;
  /** Order ID extracted from the callback */
  orderId?: string;
  /** Payment status from the callback */
  status?: PaymentStatus;
  /** Payment amount from the callback */
  amount?: number;
  /** Error message if validation failed */
  error?: string;
}

/**
 * Result of provider health check
 */
export interface ProviderHealthResult {
  /** Current health status */
  status: ProviderHealth;
  /** Optional message describing the health status */
  message?: string;
  /** When the health check was performed */
  lastChecked: Date;
}

// =============================================================================
// Provider Interface
// =============================================================================

/**
 * PaymentProvider Interface
 * 
 * All payment gateway providers must implement this interface.
 * This ensures consistent behavior across different payment gateways.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.5
 */
export interface PaymentProvider {
  /**
   * Unique identifier for this provider (e.g., 'duitku', 'xendit')
   * Used for routing and database storage
   */
  readonly providerId: string;

  /**
   * Human-readable display name for UI
   */
  readonly displayName: string;

  /**
   * Get list of payment methods supported by this provider
   * Requirements: 1.5
   */
  getPaymentMethods(): PaymentMethod[];

  /**
   * Check if the provider is properly configured and enabled
   * Requirements: 1.3
   */
  isConfigured(): Promise<boolean>;

  /**
   * Create a new payment transaction
   * Requirements: 1.1
   */
  createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult>;

  /**
   * Check the status of an existing payment
   * Requirements: 1.1
   * @param orderId - The order ID (external_id)
   * @param referenceNo - Optional provider reference number (e.g., Xendit VA id) for direct lookup
   */
  checkStatus(orderId: string, referenceNo?: string): Promise<CheckStatusResult>;

  /**
   * Validate and parse a webhook callback from the provider
   * Requirements: 1.1
   */
  validateCallback(
    payload: unknown, 
    headers: Record<string, string>
  ): Promise<CallbackValidationResult>;

  /**
   * Perform a health check on the provider
   */
  healthCheck(): Promise<ProviderHealthResult>;
}
