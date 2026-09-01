/**
 * DuitkuProvider
 * 
 * Payment provider implementation for Duitku payment gateway.
 * Wraps the existing duitku-service.ts to conform to the PaymentProvider interface.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.1, 8.2, 8.4
 */

import { logger } from '../../../utils/logger.js';
import { duitkuService } from '../../duitku-service.js';
import type {
  PaymentProvider,
  PaymentMethod,
  CreatePaymentParams,
  CreatePaymentResult,
  CheckStatusResult,
  CallbackValidationResult,
  ProviderHealthResult,
} from '../types.js';

/**
 * DuitkuProvider
 * 
 * Implements the PaymentProvider interface for Duitku payment gateway.
 * This provider wraps the existing DuitkuService to maintain backward compatibility
 * while conforming to the new multi-gateway architecture.
 * 
 * Requirements: 3.1, 3.2
 */
export class DuitkuProvider implements PaymentProvider {
  /**
   * Unique identifier for this provider
   * Used for routing and database storage
   */
  readonly providerId = 'duitku';

  /**
   * Human-readable display name for UI
   */
  readonly displayName = 'Duitku';

  /**
   * Get list of payment methods supported by Duitku
   * Currently only QRIS is supported
   * 
   * Requirements: 3.1
   */
  getPaymentMethods(): PaymentMethod[] {
    return ['QRIS'];
  }

  /**
   * Check if Duitku is properly configured and enabled
   * Delegates to the existing duitkuService.isConfigured()
   * 
   * Requirements: 3.2, 3.4
   */
  async isConfigured(): Promise<boolean> {
    return duitkuService.isConfigured();
  }

  /**
   * Create a new payment transaction via Duitku
   * Wraps duitkuService.createQRPayment()
   * 
   * Requirements: 3.2, 3.3
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    logger.debug('DuitkuProvider.createPayment called', {
      orderId: params.orderId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
    });

    // Duitku currently only supports QRIS
    if (params.paymentMethod !== 'QRIS') {
      return {
        success: false,
        error: `Payment method ${params.paymentMethod} is not supported by Duitku`,
        errorCode: 'UNSUPPORTED_METHOD',
      };
    }

    const result = await duitkuService.createQRPayment({
      orderId: params.orderId,
      amount: params.amount,
      customerEmail: params.customerEmail,
      customerName: params.customerName,
      productDetails: params.productDetails,
      returnUrl: params.returnUrl,
      expiryMinutes: params.expiryMinutes,
    });

    return {
      success: result.success,
      referenceNo: result.referenceNo,
      paymentUrl: result.paymentUrl,
      qrString: result.qrString,
      qrUrl: result.qrUrl,
      expiresAt: result.expiresAt,
      error: result.error,
      errorCode: result.errorCode,
    };
  }

  /**
   * Check the status of an existing payment
   * Wraps duitkuService.checkTransaction()
   * 
   * Requirements: 3.2, 3.3
   */
  async checkStatus(orderId: string, _referenceNo?: string): Promise<CheckStatusResult> {
    logger.debug('DuitkuProvider.checkStatus called', { orderId });

    const result = await duitkuService.checkTransaction(orderId);

    return {
      success: result.success,
      status: result.status,
      amount: result.amount,
      paidAt: result.paidAt,
      error: result.error,
    };
  }

  /**
   * Validate and parse a webhook callback from Duitku
   * Wraps duitkuService.validateCallbackSignature() and parseCallback()
   * 
   * Requirements: 3.2, 3.3, 3.4
   */
  async validateCallback(
    payload: unknown,
    headers: Record<string, string>
  ): Promise<CallbackValidationResult> {
    logger.debug('DuitkuProvider.validateCallback called', {
      hasPayload: !!payload,
      headerKeys: Object.keys(headers),
    });

    try {
      // First, ensure config is loaded for signature validation
      await duitkuService.getConfig();

      // Parse the callback payload
      const parsedPayload = duitkuService.parseCallback(payload);
      
      if (!parsedPayload) {
        return {
          valid: false,
          error: 'Failed to parse callback payload',
        };
      }

      // Extract signature and timestamp from headers (for SNAP format)
      const signature = headers['x-signature'] || headers['X-Signature'];
      const timestamp = headers['x-timestamp'] || headers['X-Timestamp'];

      // Validate the callback signature
      const validationResult = duitkuService.validateCallbackSignature(
        parsedPayload,
        signature,
        timestamp
      );

      if (!validationResult.valid) {
        return {
          valid: false,
          error: validationResult.error || 'Invalid callback signature',
        };
      }

      // Map Duitku result code to PaymentStatus
      const statusMap: Record<string, 'PENDING' | 'SUCCESS' | 'FAILED' | 'EXPIRED'> = {
        '00': 'SUCCESS',
        '01': 'PENDING',
        '02': 'FAILED',
      };

      const status = statusMap[parsedPayload.resultCode] || 'PENDING';

      return {
        valid: true,
        orderId: parsedPayload.merchantOrderId,
        status,
        amount: parsedPayload.amount ? parseInt(parsedPayload.amount, 10) : undefined,
      };
    } catch (error) {
      logger.error('DuitkuProvider.validateCallback error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Callback validation failed',
      };
    }
  }

  /**
   * Perform a health check on the Duitku provider
   * Checks if the provider is properly configured
   * 
   * Requirements: 8.1, 8.2, 8.4
   */
  async healthCheck(): Promise<ProviderHealthResult> {
    const lastChecked = new Date();

    try {
      const config = await duitkuService.getConfig();

      // Check if provider is enabled
      if (!config.enabled) {
        return {
          status: 'unhealthy',
          message: 'Duitku is disabled in settings',
          lastChecked,
        };
      }

      // Check if required credentials are configured
      if (!config.merchantCode || !config.apiKey) {
        return {
          status: 'unhealthy',
          message: 'Duitku credentials are not configured',
          lastChecked,
        };
      }

      // All checks passed
      return {
        status: 'healthy',
        message: `Duitku is configured (${config.environment} environment)`,
        lastChecked,
      };
    } catch (error) {
      logger.error('DuitkuProvider.healthCheck error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastChecked,
      };
    }
  }
}

// Export singleton instance
export const duitkuProvider = new DuitkuProvider();
