/**
 * PaymentGatewayManager
 * 
 * Central manager for all payment provider operations.
 * Maintains a registry of providers and handles routing of payments and webhooks.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 8.1
 */

import { logger } from '../../utils/logger.js';
import { adminSettingsService } from '../admin/settings-service.js';
import { 
  ProviderNotFoundError, 
  NoActiveProviderError 
} from './errors.js';
import type { 
  PaymentProvider, 
  CallbackValidationResult, 
  ProviderHealthResult 
} from './types.js';

/**
 * PaymentGatewayManager
 * 
 * Manages payment provider registration, routing, and health monitoring.
 * Implements a singleton pattern for consistent provider registry across the application.
 * 
 * Requirements: 2.1, 2.4, 2.5
 */
export class PaymentGatewayManager {
  /** Registry of all registered payment providers */
  private providers: Map<string, PaymentProvider> = new Map();
  
  /** Default provider ID (can be overridden by admin settings) */
  private defaultProviderId: string | null = null;

  // ===========================================================================
  // Provider Registration (Requirements: 2.1, 2.4, 2.5)
  // ===========================================================================

  /**
   * Register a payment provider
   * 
   * @param provider - The payment provider to register
   * @throws Error if a provider with the same ID is already registered
   * 
   * Requirements: 2.1 - Maintain registry of all available payment providers
   */
  registerProvider(provider: PaymentProvider): void {
    if (this.providers.has(provider.providerId)) {
      throw new Error(
        `Provider with ID '${provider.providerId}' is already registered`
      );
    }

    this.providers.set(provider.providerId, provider);
    
    logger.info('Payment provider registered', {
      providerId: provider.providerId,
      displayName: provider.displayName,
      methods: provider.getPaymentMethods(),
    });

    // Set as default if it's the first provider
    if (this.defaultProviderId === null) {
      this.defaultProviderId = provider.providerId;
    }
  }

  /**
   * Get a provider by ID
   * 
   * @param providerId - The provider ID to look up
   * @returns The provider if found, undefined otherwise
   * 
   * Requirements: 2.5 - Provide method to get provider by ID
   */
  getProvider(providerId: string): PaymentProvider | undefined {
    return this.providers.get(providerId);
  }

  /**
   * Get all registered providers
   * 
   * @returns Array of all registered providers
   * 
   * Requirements: 2.4 - Provide method to get all active providers
   */
  getAllProviders(): PaymentProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Get all configured (enabled) providers
   * 
   * @returns Array of providers that are properly configured
   * 
   * Requirements: 2.4 - Provide method to get all active providers
   */
  async getConfiguredProviders(): Promise<PaymentProvider[]> {
    const configuredProviders: PaymentProvider[] = [];

    for (const provider of this.providers.values()) {
      try {
        const isConfigured = await provider.isConfigured();
        if (isConfigured) {
          configuredProviders.push(provider);
        }
      } catch (error) {
        logger.warn('Error checking provider configuration', {
          providerId: provider.providerId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return configuredProviders;
  }

  // ===========================================================================
  // Default Provider Management (Requirements: 2.2, 2.3, 2.6)
  // ===========================================================================

  /**
   * Get the default provider based on admin settings
   * 
   * Falls back to:
   * 1. Admin settings default provider
   * 2. First configured provider
   * 3. undefined if no providers are configured
   * 
   * Requirements: 2.2 - Route to appropriate provider based on configuration
   */
  async getDefaultProvider(): Promise<PaymentProvider | undefined> {
    try {
      // Try to get default provider from admin settings
      const defaultProviderId = await this.getDefaultProviderIdFromSettings();
      
      if (defaultProviderId) {
        const provider = this.providers.get(defaultProviderId);
        if (provider) {
          const isConfigured = await provider.isConfigured();
          if (isConfigured) {
            return provider;
          }
          logger.warn('Default provider from settings is not configured', {
            providerId: defaultProviderId,
          });
        }
      }

      // Fallback to first configured provider
      const configuredProviders = await this.getConfiguredProviders();
      if (configuredProviders.length > 0) {
        return configuredProviders[0];
      }

      return undefined;
    } catch (error) {
      logger.error('Error getting default provider', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Last resort: return the in-memory default if set
      if (this.defaultProviderId) {
        return this.providers.get(this.defaultProviderId);
      }
      
      return undefined;
    }
  }

  /**
   * Set the default provider ID (in-memory)
   * 
   * Note: For persistent default, use admin settings
   * 
   * @param providerId - The provider ID to set as default
   * @throws ProviderNotFoundError if provider is not registered
   */
  setDefaultProvider(providerId: string): void {
    if (!this.providers.has(providerId)) {
      throw new ProviderNotFoundError(providerId);
    }
    
    this.defaultProviderId = providerId;
    
    logger.info('Default payment provider set', { providerId });
  }

  /**
   * Get default provider ID from admin settings
   * 
   * @returns The default provider ID from settings, or null if not set
   */
  private async getDefaultProviderIdFromSettings(): Promise<string | null> {
    try {
      // Check for payment_gateway category with default_provider key
      const defaultProvider = await adminSettingsService.getRawValue(
        'duitku', // Currently using duitku category, will be updated when payment_gateway category is added
        'default_provider'
      );
      
      return defaultProvider || this.defaultProviderId;
    } catch {
      // Settings not available, use in-memory default
      return this.defaultProviderId;
    }
  }

  // ===========================================================================
  // Webhook Routing (Requirements: 2.3, 2.6)
  // ===========================================================================

  /**
   * Route a webhook callback to the correct provider
   * 
   * @param providerId - The provider ID to route to
   * @param payload - The webhook payload
   * @param headers - The request headers
   * @returns The callback validation result
   * @throws ProviderNotFoundError if provider is not registered
   * 
   * Requirements: 2.3 - Route to correct provider based on transaction's providerId
   * Requirements: 2.6 - Return appropriate error if no provider configured
   */
  async routeWebhook(
    providerId: string,
    payload: unknown,
    headers: Record<string, string>
  ): Promise<CallbackValidationResult> {
    const provider = this.providers.get(providerId);
    
    if (!provider) {
      logger.error('Webhook routing failed: provider not found', { providerId });
      throw new ProviderNotFoundError(providerId);
    }

    logger.debug('Routing webhook to provider', {
      providerId,
      hasPayload: !!payload,
      headerKeys: Object.keys(headers),
    });

    return provider.validateCallback(payload, headers);
  }

  // ===========================================================================
  // Health Monitoring (Requirements: 8.1)
  // ===========================================================================

  /**
   * Perform health check on all registered providers
   * 
   * @returns Map of provider IDs to their health status
   * 
   * Requirements: 8.1 - Provide health check endpoint for each provider
   */
  async healthCheckAll(): Promise<Map<string, ProviderHealthResult>> {
    const results = new Map<string, ProviderHealthResult>();

    for (const [providerId, provider] of this.providers) {
      try {
        const healthResult = await provider.healthCheck();
        results.set(providerId, healthResult);
        
        if (healthResult.status !== 'healthy') {
          logger.warn('Provider health check returned non-healthy status', {
            providerId,
            status: healthResult.status,
            message: healthResult.message,
          });
        }
      } catch (error) {
        const errorResult: ProviderHealthResult = {
          status: 'unhealthy',
          message: error instanceof Error ? error.message : 'Health check failed',
          lastChecked: new Date(),
        };
        results.set(providerId, errorResult);
        
        logger.error('Provider health check failed', {
          providerId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return results;
  }

  /**
   * Perform health check on a specific provider
   * 
   * @param providerId - The provider ID to check
   * @returns The health check result
   * @throws ProviderNotFoundError if provider is not registered
   */
  async healthCheck(providerId: string): Promise<ProviderHealthResult> {
    const provider = this.providers.get(providerId);
    
    if (!provider) {
      throw new ProviderNotFoundError(providerId);
    }

    return provider.healthCheck();
  }

  // ===========================================================================
  // Utility Methods
  // ===========================================================================

  /**
   * Check if any providers are registered
   */
  hasProviders(): boolean {
    return this.providers.size > 0;
  }

  /**
   * Get the count of registered providers
   */
  getProviderCount(): number {
    return this.providers.size;
  }

  /**
   * Check if a specific provider is registered
   */
  isProviderRegistered(providerId: string): boolean {
    return this.providers.has(providerId);
  }

  /**
   * Get provider IDs
   */
  getProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Clear all providers (useful for testing)
   */
  clearProviders(): void {
    this.providers.clear();
    this.defaultProviderId = null;
    logger.debug('All payment providers cleared');
  }

  /**
   * Get a configured provider or throw an error
   * 
   * @param providerId - Optional provider ID, uses default if not specified
   * @returns The configured provider
   * @throws NoActiveProviderError if no provider is available
   * @throws ProviderNotFoundError if specified provider is not found
   */
  async getConfiguredProviderOrThrow(providerId?: string): Promise<PaymentProvider> {
    if (providerId) {
      const provider = this.providers.get(providerId);
      if (!provider) {
        throw new ProviderNotFoundError(providerId);
      }
      return provider;
    }

    const defaultProvider = await this.getDefaultProvider();
    if (!defaultProvider) {
      throw new NoActiveProviderError();
    }

    return defaultProvider;
  }
}

// Export singleton instance
export const paymentGatewayManager = new PaymentGatewayManager();
