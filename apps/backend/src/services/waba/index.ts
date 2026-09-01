// ============================================================================
// WABA Service - Barrel Export and Backward Compatible Facade
// ============================================================================
//
// This module provides:
// 1. Re-exports of all types and errors
// 2. Individual module singletons for direct access
// 3. WABAService facade class for backward compatibility
//
// Requirements: 9.1, 9.2, 9.3
// ============================================================================

// ============================================================================
// Re-export all types
// ============================================================================

export type {
  // OAuth Types
  SignupUrlResponse,
  TokenResponse,
  TokenExchangeResult,
  TokenRefreshResult,
  StateData,
  // WABA Resource Types
  WABAResources,
  PhoneNumberDetails,
  WABADetails,
  // Configuration Types
  WABAConfig,
  // Webhook Types
  WebhookConfig,
  WebhookEventType,
  WebhookEvent,
  // Coexistence Types
  CoexistenceStatus,
  SyncStatus,
  SyncDetail,
  // Error Types
  MetaAPIError,
  // Internal Types
  EncryptedToken,
  QueueOptions,
} from './types.js';

// ============================================================================
// Re-export all errors
// ============================================================================

export { WABAErrorCode, WABAServiceError } from './errors.js';

// ============================================================================
// Export individual module classes and singletons
// ============================================================================

export { WABASettings, wabaSettings } from './settings.js';
export { WABAOAuth, wabaOAuth } from './oauth.js';
export { WABATokenManager, wabaTokenManager } from './token-manager.js';
export { WABAResourceDiscovery, wabaResources } from './resources.js';
export { WABAWebhook, wabaWebhook } from './webhook.js';
export { WABACoexistence, wabaCoexistence } from './coexistence.js';
export { WABAHealthService, wabaHealthService } from './health-service.js';
export type { AccountStatusDTO, WABAHealthResult } from './health-service.js';


// ============================================================================
// Import singletons for facade
// ============================================================================

import { wabaSettings } from './settings.js';
import { wabaOAuth } from './oauth.js';
import { wabaTokenManager } from './token-manager.js';
import { wabaResources } from './resources.js';
import { wabaWebhook } from './webhook.js';
import { wabaCoexistence } from './coexistence.js';

import type {
  SignupUrlResponse,
  TokenExchangeResult,
  TokenRefreshResult,
  WABAResources,
  WebhookConfig,
  WebhookEventType,
  WebhookEvent,
  CoexistenceStatus,
  SyncStatus,
} from './types.js';

// ============================================================================
// WABAService Facade Class (Backward Compatibility)
// ============================================================================

/**
 * WABAService
 *
 * Facade class that delegates to individual modules for backward compatibility.
 * This allows existing code that imports WABAService to continue working
 * without modification.
 *
 * For new code, prefer importing individual modules directly:
 * - wabaOAuth for OAuth operations
 * - wabaTokenManager for token operations
 * - wabaResources for resource discovery
 * - wabaWebhook for webhook operations
 * - wabaCoexistence for coexistence operations
 * - wabaSettings for configuration
 *
 * Requirements: 9.1, 9.2, 9.3
 */
export class WABAService {
  // ==========================================================================
  // OAuth Operations (delegates to wabaOAuth)
  // ==========================================================================

  /**
   * Generate embedded signup URL with encrypted state parameter
   */
  async generateSignupUrl(
    userId: string,
    redirectUri?: string,
    enableCoexistence?: boolean
  ): Promise<SignupUrlResponse> {
    return wabaOAuth.generateSignupUrl(userId, redirectUri, enableCoexistence);
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<TokenExchangeResult> {
    return wabaOAuth.exchangeCodeForToken(code, state);
  }

  // ==========================================================================
  // Resource Discovery (delegates to wabaResources)
  // ==========================================================================

  /**
   * Discover WABA resources (WABA details and phone numbers)
   */
  async discoverWABAResources(accessToken: string, excludeWabaIds?: string[], providedWabaId?: string): Promise<WABAResources> {
    return wabaResources.discoverWABAResources(accessToken, excludeWabaIds, providedWabaId);
  }

  // ==========================================================================
  // Token Management (delegates to wabaTokenManager)
  // ==========================================================================

  /**
   * Refresh access token for a WABA
   */
  async refreshAccessToken(wabaId: string): Promise<TokenRefreshResult> {
    return wabaTokenManager.refreshAccessToken(wabaId);
  }

  /**
   * Check if token is expiring soon (within 7 days)
   */
  async isTokenExpiringSoon(userId: string): Promise<boolean> {
    return wabaTokenManager.isTokenExpiringSoon(userId);
  }

  /**
   * Get all WABA IDs with tokens expiring soon
   */
  async getAccountsWithExpiringTokens(): Promise<string[]> {
    return wabaTokenManager.getAccountsWithExpiringTokens();
  }

  // ==========================================================================
  // Webhook Operations (delegates to wabaWebhook)
  // ==========================================================================

  /**
   * Configure webhooks for WABA
   */
  async configureWebhooks(
    wabaId: string,
    accessToken: string,
    events?: WebhookEventType[],
    includeCoexistence?: boolean
  ): Promise<WebhookConfig> {
    return wabaWebhook.configureWebhooks(wabaId, accessToken, events, includeCoexistence);
  }

  /**
   * Verify webhook signature using X-Hub-Signature-256
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    return wabaWebhook.verifySignature(payload, signature);
  }

  /**
   * Handle incoming webhook event
   */
  async handleWebhookEvent(event: WebhookEvent): Promise<void> {
    return wabaWebhook.handleEvent(event);
  }

  // ==========================================================================
  // Coexistence Operations (delegates to wabaCoexistence)
  // ==========================================================================

  /**
   * Check if phone number is using Coexistence
   */
  async checkCoexistenceStatus(
    phoneNumberId: string,
    accessToken: string
  ): Promise<CoexistenceStatus> {
    return wabaCoexistence.checkStatus(phoneNumberId, accessToken);
  }

  /**
   * Trigger contact synchronization from WhatsApp Business App
   */
  async syncContacts(
    phoneNumberId: string,
    accessToken: string
  ): Promise<string> {
    return wabaCoexistence.syncContacts(phoneNumberId, accessToken);
  }

  /**
   * Trigger message history synchronization from WhatsApp Business App
   */
  async syncHistory(
    phoneNumberId: string,
    accessToken: string
  ): Promise<string> {
    return wabaCoexistence.syncHistory(phoneNumberId, accessToken);
  }

  /**
   * Get coexistence sync status for a user
   */
  async getSyncStatus(userId: string): Promise<SyncStatus> {
    return wabaCoexistence.getSyncStatus(userId);
  }

  // ==========================================================================
  // Settings Operations (delegates to wabaSettings)
  // ==========================================================================

  /**
   * Get current app ID
   */
  getAppId(): string {
    return wabaSettings.getAppId();
  }

  /**
   * Get current app secret
   */
  getAppSecret(): string {
    return wabaSettings.getAppSecret();
  }

  /**
   * Invalidate settings cache
   */
  invalidateCache(): void {
    return wabaSettings.invalidateCache();
  }
}

// ============================================================================
// Export singleton instance for backward compatibility
// ============================================================================

export const wabaService = new WABAService();
