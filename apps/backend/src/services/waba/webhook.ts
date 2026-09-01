// ============================================================================
// WABA Webhook Module
// ============================================================================

import axios from 'axios';
import https from 'https';
import { createHmac, timingSafeEqual } from 'crypto';
import { logger, extractAxiosError } from '../../utils/logger.js';
import { WABAServiceError, WABAErrorCode } from './errors.js';
import { wabaSettings, WABASettings } from './settings.js';
import type { WebhookConfig, WebhookEventType, WebhookEvent, MetaAPIError } from './types.js';

// Create HTTPS agent that forces IPv4 (fixes ETIMEDOUT on some servers)
const httpsAgent = new https.Agent({
  family: 4,
  rejectUnauthorized: true,
});

/**
 * WABAWebhook
 * 
 * Handles webhook configuration, signature verification, and event routing
 * for WhatsApp Business Account webhooks.
 * Uses axios with IPv4 force for reliable connections.
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4
 */
export class WABAWebhook {
  constructor(private settings: WABASettings) {}

  /**
   * Configure webhooks for WABA
   * Subscribes the app to receive webhook notifications for the specified events.
   * 
   * Requirements: 4.3
   * 
   * @param wabaId - WhatsApp Business Account ID
   * @param accessToken - Meta access token
   * @param events - Array of webhook events to subscribe to
   * @param includeCoexistence - Include coexistence webhook fields
   * @returns Webhook configuration details
   */
  async configureWebhooks(
    wabaId: string,
    accessToken: string,
    events: WebhookEventType[] = ['messages', 'message_status', 'message_template_status_update'],
    includeCoexistence: boolean = true
  ): Promise<WebhookConfig> {
    // Ensure settings are loaded
    await this.settings.ensureLoaded();
    const apiVersion = this.settings.getApiVersion();

    const webhookBaseUrl = this.settings.getWebhookBaseUrl();
    const webhookUrl = webhookBaseUrl 
      ? `${webhookBaseUrl}/api/v1/webhooks`
      : '';

    if (!webhookUrl) {
      throw new WABAServiceError(
        WABAErrorCode.WEBHOOK_URL_NOT_CONFIGURED,
        'WEBHOOK_BASE_URL is not configured'
      );
    }

    // Add coexistence webhook fields if enabled
    const allEvents = [...events];
    if (includeCoexistence) {
      const coexistenceEvents: WebhookEventType[] = [
        'history',
        'smb_app_state_sync',
        'smb_message_echoes',
        'account_update'
      ];
      // Only add if not already in events
      for (const event of coexistenceEvents) {
        if (!allEvents.includes(event)) {
          allEvents.push(event);
        }
      }
    }

    try {
      console.log('Configuring webhooks for WABA:', wabaId);

      // Subscribe to webhook fields using axios
      const response = await axios.post(
        `https://graph.facebook.com/${apiVersion}/${wabaId}/subscribed_apps`,
        {},
        {
          params: {
            access_token: accessToken,
          },
          timeout: 60000,
          httpsAgent,
        }
      );

      if (response.data.error) {
        throw new WABAServiceError(
          WABAErrorCode.WEBHOOK_CONFIG_FAILED,
          `Webhook configuration failed: ${response.data.error.message}`,
          { wabaId, metaError: response.data.error }
        );
      }

      logger.info('Webhook subscription configured', { wabaId, events: allEvents });
      console.log('Webhooks configured successfully');

      return {
        success: true,
        subscriptions: allEvents,
        webhookUrl,
      };
    } catch (error) {
      if (error instanceof WABAServiceError) {
        throw error;
      }
      throw new WABAServiceError(
        WABAErrorCode.WEBHOOK_CONFIG_FAILED,
        `Webhook configuration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { wabaId }
      );
    }
  }

  /**
   * Verify webhook signature using X-Hub-Signature-256
   * Uses constant-time comparison to prevent timing attacks.
   * 
   * Requirements: 4.2
   * 
   * @param payload - Raw webhook payload (string)
   * @param signature - X-Hub-Signature-256 header value
   * @returns True if signature is valid
   */
  verifySignature(payload: string, signature: string): boolean {
    try {
      if (!signature || !signature.startsWith('sha256=')) {
        logger.warn('Invalid webhook signature format');
        return false;
      }

      const appSecret = this.settings.getAppSecret();
      if (!appSecret) {
        logger.error('App secret not configured for webhook verification');
        return false;
      }

      // Extract signature hash
      const signatureHash = signature.substring(7);

      // Calculate expected signature
      const expectedSignature = createHmac('sha256', appSecret)
        .update(payload)
        .digest('hex');

      // Constant-time comparison to prevent timing attacks
      return this.secureCompare(signatureHash, expectedSignature);
    } catch (error) {
      logger.error('Webhook signature verification error', { error });
      return false;
    }
  }

  /**
   * Verify webhook challenge for initial webhook setup
   * 
   * @param mode - hub.mode parameter from Meta
   * @param token - hub.verify_token parameter from Meta
   * @param challenge - hub.challenge parameter from Meta
   * @param expectedToken - The verify token configured in Meta dashboard
   * @returns Challenge string if valid, null otherwise
   */
  verifyChallenge(
    mode: string,
    token: string,
    challenge: string,
    expectedToken: string
  ): string | null {
    if (mode === 'subscribe' && token === expectedToken) {
      logger.info('Webhook challenge verified successfully');
      return challenge;
    }

    logger.warn('Webhook challenge verification failed', { mode, tokenMatch: token === expectedToken });
    return null;
  }

  /**
   * Handle incoming webhook event
   * Routes events to appropriate handlers based on field type.
   * 
   * Requirements: 4.4
   * 
   * @param event - Webhook event payload
   */
  async handleEvent(event: WebhookEvent): Promise<void> {
    try {
      if (event.object !== 'whatsapp_business_account') {
        logger.warn('Unsupported webhook object type', { object: event.object });
        throw new WABAServiceError(
          WABAErrorCode.INTERNAL_ERROR,
          `Unsupported webhook object type: ${event.object}`
        );
      }

      for (const entry of event.entry) {
        const wabaId = entry.id;
        
        for (const change of entry.changes) {
          const field = change.field;
          const value = change.value;

          logger.debug('Processing webhook event', { wabaId, field });

          switch (field) {
            case 'messages':
              await this.handleMessageEvent(wabaId, value);
              break;
            case 'message_status':
              await this.handleMessageStatusEvent(wabaId, value);
              break;
            case 'message_template_status_update':
              await this.handleTemplateStatusEvent(wabaId, value);
              break;
            case 'history':
              await this.handleHistoryEvent(wabaId, value);
              break;
            case 'smb_app_state_sync':
              await this.handleContactsSyncEvent(wabaId, value);
              break;
            case 'smb_message_echoes':
              await this.handleMessageEchoesEvent(wabaId, value);
              break;
            case 'account_update':
              await this.handleAccountUpdateEvent(wabaId, value);
              break;
            default:
              logger.debug('Unhandled webhook field', { field, wabaId });
          }
        }
      }
    } catch (error) {
      logger.error('Webhook event handling error', { error: extractAxiosError(error) });
      throw error;
    }
  }

  // ===========================================================================
  // Event Handlers (delegated to webhook routes for actual processing)
  // ===========================================================================

  /**
   * Handle incoming message webhook event
   */
  private async handleMessageEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('Message event received', { wabaId, messageCount: value?.messages?.length || 0 });
    // Actual processing is done in webhook routes
  }

  /**
   * Handle message status update webhook event
   */
  private async handleMessageStatusEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('Message status event received', { wabaId, statusCount: value?.statuses?.length || 0 });
    // Actual processing is done in webhook routes
  }

  /**
   * Handle template status update webhook event
   */
  private async handleTemplateStatusEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('Template status event received', { wabaId, event: value?.event });
    // Actual processing is done in webhook routes
  }

  /**
   * Handle history sync webhook event (coexistence)
   */
  private async handleHistoryEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('History sync event received', { wabaId });
    // Actual processing is done in webhook routes
  }

  /**
   * Handle contacts sync webhook event (coexistence)
   */
  private async handleContactsSyncEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('Contacts sync event received', { wabaId });
    // Actual processing is done in webhook routes
  }

  /**
   * Handle message echoes webhook event (coexistence)
   */
  private async handleMessageEchoesEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('Message echoes event received', { wabaId });
    // Actual processing is done in webhook routes
  }

  /**
   * Handle account update webhook event
   */
  private async handleAccountUpdateEvent(wabaId: string, value: any): Promise<void> {
    logger.debug('Account update event received', { wabaId });
    // Actual processing is done in webhook routes
  }

  // ===========================================================================
  // Internal Helpers
  // ===========================================================================

  /**
   * Constant-time string comparison to prevent timing attacks
   * Uses Node.js crypto.timingSafeEqual for secure comparison.
   * 
   * @param a - First string (hex encoded)
   * @param b - Second string (hex encoded)
   * @returns True if strings are equal
   */
  private secureCompare(a: string, b: string): boolean {
    try {
      const bufA = Buffer.from(a, 'hex');
      const bufB = Buffer.from(b, 'hex');

      if (bufA.length !== bufB.length) {
        return false;
      }

      return timingSafeEqual(bufA, bufB);
    } catch {
      return false;
    }
  }

}

// Export singleton instance
export const wabaWebhook = new WABAWebhook(wabaSettings);
