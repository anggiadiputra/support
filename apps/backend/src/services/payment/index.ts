/**
 * Payment Module Index
 * 
 * Central export point for the multi-payment gateway system.
 * Auto-registers all payment providers on import.
 * 
 * Requirements: 1.4, 2.1
 */

import { logger } from '../../utils/logger.js';

// Import for local use in registerProviders()
import { paymentGatewayManager } from './gateway-manager.js';
import { duitkuProvider } from './providers/duitku-provider.js';
import { xenditProvider } from './providers/xendit-provider.js';

// =============================================================================
// Export Types
// =============================================================================

export type {
  PaymentMethod,
  PaymentStatus,
  ProviderHealth,
  CreatePaymentParams,
  CreatePaymentResult,
  CheckStatusResult,
  CallbackValidationResult,
  ProviderHealthResult,
  PaymentProvider,
} from './types.js';

// =============================================================================
// Export Errors
// =============================================================================

export {
  PaymentProviderError,
  ProviderNotConfiguredError,
  ProviderNotFoundError,
  WebhookValidationError,
  PaymentCreationError,
  PaymentStatusCheckError,
  ProviderTimeoutError,
  NoActiveProviderError,
} from './errors.js';

// =============================================================================
// Export Gateway Manager
// =============================================================================

export { 
  PaymentGatewayManager, 
  paymentGatewayManager 
} from './gateway-manager.js';

// =============================================================================
// Export Provider Classes
// =============================================================================

export { DuitkuProvider, duitkuProvider } from './providers/duitku-provider.js';
export { XenditProvider, xenditProvider, XENDIT_ERROR_MAP } from './providers/xendit-provider.js';
export type { XenditSettings } from './providers/xendit-provider.js';

// =============================================================================
// Auto-Register Providers
// =============================================================================

/**
 * Register all available payment providers with the gateway manager.
 * This function is called automatically on module import.
 * 
 * Requirements: 1.4 - Automatically detect and register new providers
 * Requirements: 2.1 - Maintain registry of all available payment providers
 */
function registerProviders(): void {
  // Use the already-imported ES module exports
  // (paymentGatewayManager, duitkuProvider, xenditProvider are imported above)

  // Register Duitku provider
  if (!paymentGatewayManager.isProviderRegistered('duitku')) {
    try {
      paymentGatewayManager.registerProvider(duitkuProvider);
      logger.info('Duitku payment provider registered');
    } catch (error) {
      logger.error('Failed to register Duitku provider', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Register Xendit provider
  if (!paymentGatewayManager.isProviderRegistered('xendit')) {
    try {
      paymentGatewayManager.registerProvider(xenditProvider);
      logger.info('Xendit payment provider registered');
    } catch (error) {
      logger.error('Failed to register Xendit provider', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

// Auto-register providers on module load
registerProviders();
