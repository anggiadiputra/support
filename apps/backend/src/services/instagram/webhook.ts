/**
 * Instagram Webhook Module
 * 
 * Contains webhook verification and subscription functions for Instagram.
 * Extracted from InstagramService.ts for better modularity.
 */

import axios, { AxiosInstance } from 'axios';
import { createHmac, timingSafeEqual } from 'crypto';
import { IGErrorCode, InstagramError } from './errors.js';
import { logger, extractAxiosError } from '../../utils/logger.js';

// ============================================================================
// Dependencies Interface
// ============================================================================

export interface WebhookDependencies {
  client: AxiosInstance;
  appSecret: string;
  webhookVerifyToken: string;
}

// ============================================================================
// Webhook Verification Functions
// ============================================================================

/**
 * Verify webhook signature using HMAC-SHA256
 * Uses constant-time comparison to prevent timing attacks
 * 
 * @param appSecret - Instagram App Secret
 * @param payload - Raw webhook payload (string)
 * @param signature - X-Hub-Signature-256 header value
 * @returns True if signature is valid
 */
export function verifyWebhookSignature(
  appSecret: string,
  payload: string,
  signature: string
): boolean {
  try {
    if (!signature || !signature.startsWith('sha256=')) {
      return false;
    }

    // Extract signature hash
    const signatureHash = signature.substring(7);

    // Calculate expected signature using Instagram App Secret
    const expectedSignature = createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    return secureCompare(signatureHash, expectedSignature);
  } catch (error) {
    logger.error('Webhook signature verification error', {
      error: extractAxiosError(error),
    });
    return false;
  }
}


/**
 * Verify webhook challenge for initial webhook setup
 * 
 * @param webhookVerifyToken - The verify token configured in Meta dashboard
 * @param mode - hub.mode parameter from Meta
 * @param token - hub.verify_token parameter from Meta
 * @param challenge - hub.challenge parameter from Meta
 * @returns Challenge string if valid, null otherwise
 */
export function verifyWebhookChallenge(
  webhookVerifyToken: string,
  mode: string,
  token: string,
  challenge: string
): string | null {
  if (mode === 'subscribe' && token === webhookVerifyToken) {
    return challenge;
  }

  return null;
}

// ============================================================================
// Webhook Subscription Functions
// ============================================================================

/**
 * Enable webhook subscriptions for an Instagram professional account
 * This is REQUIRED after OAuth to receive webhook notifications
 * 
 * Per Meta documentation:
 * POST /<INSTAGRAM_ACCOUNT_ID>/subscribed_apps?subscribed_fields=messages&access_token=<TOKEN>
 * 
 * @param client - Axios instance for HTTP requests
 * @param accessToken - Instagram access token
 * @param igId - Instagram Professional Account ID
 * @param fields - Webhook fields to subscribe to (default: messages)
 * @returns True if subscription was successful
 */
export async function enableWebhookSubscriptions(
  client: AxiosInstance,
  accessToken: string,
  igId: string,
  fields: string[] = ['messages']
): Promise<boolean> {
  try {
    console.log(`[InstagramService] Enabling webhook subscriptions for IG ID: ${igId}`);
    console.log(`[InstagramService] Subscribing to fields: ${fields.join(',')}`);

    const response = await client.post(
      `https://graph.instagram.com/${igId}/subscribed_apps`,
      null,
      {
        params: {
          subscribed_fields: fields.join(','),
          access_token: accessToken,
        },
      }
    );

    const success = response.data?.success === true;
    console.log(`[InstagramService] Webhook subscription result: ${success}`);

    return success;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error;
      console.error('[InstagramService] Failed to enable webhook subscriptions:', {
        code: metaError?.code,
        message: metaError?.message,
        type: metaError?.type,
        subcode: metaError?.error_subcode,
      });

      throw new InstagramError(
        IGErrorCode.INTERNAL_ERROR,
        `Failed to enable webhook subscriptions: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        true,
        'Webhook subscription failed. Messages may not be received.',
        metaError ? {
          code: metaError.code,
          message: metaError.message,
          type: metaError.type,
          subcode: metaError.error_subcode,
        } : undefined
      );
    }

    logger.error('[InstagramService] Failed to enable webhook subscriptions', {
      error: extractAxiosError(error),
    });
    throw new InstagramError(
      IGErrorCode.INTERNAL_ERROR,
      `Failed to enable webhook subscriptions: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      true
    );
  }
}

/**
 * Get current webhook subscriptions for an Instagram account
 * 
 * @param client - Axios instance for HTTP requests
 * @param accessToken - Instagram access token
 * @param igId - Instagram Professional Account ID
 * @returns List of subscribed fields or null if error
 */
export async function getWebhookSubscriptions(
  client: AxiosInstance,
  accessToken: string,
  igId: string
): Promise<string[] | null> {
  try {
    const response = await client.get(
      `https://graph.instagram.com/${igId}/subscribed_apps`,
      {
        params: {
          access_token: accessToken,
        },
      }
    );

    // Response format: { data: [{ subscribed_fields: ['messages'] }] }
    const data = response.data?.data;
    if (Array.isArray(data) && data.length > 0) {
      return data[0]?.subscribed_fields || [];
    }

    return [];
  } catch (error) {
    logger.error('[InstagramService] Failed to get webhook subscriptions', {
      error: extractAxiosError(error),
    });
    return null;
  }
}

// ============================================================================
// Internal Helpers
// ============================================================================

/**
 * Constant-time string comparison to prevent timing attacks
 * 
 * @param a - First string (hex encoded)
 * @param b - Second string (hex encoded)
 * @returns True if strings are equal
 */
function secureCompare(a: string, b: string): boolean {
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
