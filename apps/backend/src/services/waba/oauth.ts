/**
 * WABA OAuth Module
 *
 * Handles WhatsApp Business Account embedded signup flow and OAuth token exchange.
 * Implements state encryption for CSRF protection with timestamp expiry.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { randomBytes } from 'crypto';
import dns from 'dns';
import { TokenEncryptionService } from '../../utils/tokenEncryption.js';
import { logger } from '../../utils/logger.js';
import { WABASettings, wabaSettings } from './settings.js';
import { WABAServiceError, WABAErrorCode } from './errors.js';
import type {
  SignupUrlResponse,
  TokenExchangeResult,
  StateData,
  MetaAPIError,
} from './types.js';

// Force IPv4 for DNS resolution (fixes ETIMEDOUT on some servers)
dns.setDefaultResultOrder('ipv4first');

// Create HTTPS agent that forces IPv4
const httpsAgent = new https.Agent({
  family: 4, // Force IPv4
  rejectUnauthorized: true,
});

// ============================================================================
// Constants
// ============================================================================

const STATE_EXPIRY_MS = 10 * 60 * 1000; // 10 minutes

// ============================================================================
// WABAOAuth Class
// ============================================================================

/**
 * WABAOAuth
 *
 * Handles OAuth flow for WhatsApp Business Account embedded signup.
 * Manages state encryption/decryption and token exchange.
 */
export class WABAOAuth {
  private client: AxiosInstance;
  private tokenEncryption: TokenEncryptionService;

  constructor(private settings: WABASettings) {
    this.client = axios.create({
      baseURL: `https://graph.facebook.com/${settings.getApiVersion()}`,
      timeout: 60000, // Increased to 60s for slow connections
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent, // Force IPv4 to avoid ETIMEDOUT on IPv6
    });

    this.tokenEncryption = new TokenEncryptionService();
  }

  /**
   * Generate embedded signup URL with encrypted state parameter
   *
   * Creates a Facebook OAuth URL for WABA embedded signup flow.
   * State parameter is encrypted for CSRF protection.
   *
   * @param userId - The user ID initiating the WABA connection
   * @param redirectUri - Optional custom redirect URI
   * @param enableCoexistence - Enable WhatsApp Business App onboarding (Coexistence)
   * @returns SignupUrlResponse with URL, state, and expiration
   *
   * Requirements: 2.1, 2.2
   */
  async generateSignupUrl(
    userId: string,
    redirectUri?: string,
    enableCoexistence?: boolean
  ): Promise<SignupUrlResponse> {
    // Ensure settings are loaded from database
    const config = await this.settings.ensureLoaded();

    try {
      // Generate nonce for CSRF protection
      const nonce = randomBytes(16).toString('hex');
      const timestamp = Date.now();

      // Create state object with userId
      // Business account will be auto-created after OAuth callback
      const stateData: StateData = {
        userId,
        nonce,
        timestamp,
      };

      // Encrypt state parameter
      const state = this.encryptState(stateData);

      // Build signup URL
      const redirect = redirectUri || config.redirectUri;
      const signupUrl = new URL('https://www.facebook.com/v23.0/dialog/oauth');

      signupUrl.searchParams.set('client_id', config.appId);
      signupUrl.searchParams.set('redirect_uri', redirect);
      signupUrl.searchParams.set('state', state);
      signupUrl.searchParams.set('config_id', config.configId);
      signupUrl.searchParams.set('response_type', 'code');
      signupUrl.searchParams.set(
        'scope',
        'whatsapp_business_management,whatsapp_business_messaging'
      );

      // Build extras object with coexistence support
      const extras: Record<string, any> = {
        setup: {
          // Pre-fill business info if available
        },
      };

      // Enable Coexistence (WhatsApp Business App onboarding)
      if (enableCoexistence) {
        extras.featureType = 'whatsapp_business_app_onboarding';
        extras.sessionInfoVersion = '3'; // Required for coexistence
      }

      signupUrl.searchParams.set('extras', JSON.stringify(extras));

      // State expires in 10 minutes
      const expiresAt = new Date(timestamp + STATE_EXPIRY_MS).toISOString();

      return {
        signupUrl: signupUrl.toString(),
        state,
        expiresAt,
        appId: config.appId,
        configId: config.configId,
      };
    } catch (error) {
      if (error instanceof WABAServiceError) {
        throw error;
      }
      throw new WABAServiceError(
        WABAErrorCode.INTERNAL_ERROR,
        `Failed to generate signup URL: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Exchange authorization code for access token
   * Uses native fetch with axios fallback for reliability
   *
   * @param code - Authorization code from Meta callback
   * @param state - Encrypted state parameter
   * @returns TokenExchangeResult with access token and user ID
   *
   * Requirements: 2.3, 2.4
   */
  async exchangeCodeForToken(
    code: string,
    state: string
  ): Promise<TokenExchangeResult> {
    // Ensure settings are loaded from database
    const config = await this.settings.ensureLoaded();

    // Decrypt and validate state parameter first (before any retries)
    const stateData = this.validateState(state);

    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Build URL with query params
        const url = new URL(
          `https://graph.facebook.com/${this.settings.getApiVersion()}/oauth/access_token`
        );
        url.searchParams.set('client_id', config.appId);
        url.searchParams.set('client_secret', config.appSecret);
        url.searchParams.set('code', code);
        logger.info('WABA token exchange attempt', { attempt, maxRetries });

        // Use native fetch (available in Node.js 18+)
        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
          signal: AbortSignal.timeout(60000), // 60s timeout
        });

        const responseData = await response.json();

        if (responseData.error) {
          const metaError = responseData.error as MetaAPIError;
          logger.error('WABA Meta API error during token exchange', {
            attempt,
            maxRetries,
            metaError,
          });

          throw new WABAServiceError(
            WABAErrorCode.TOKEN_EXCHANGE_FAILED,
            `Token exchange failed: ${metaError?.message || 'Unknown error'}`,
            {
              code: metaError?.code,
              type: metaError?.type,
              fbtrace_id: metaError?.fbtrace_id,
            }
          );
        }

        logger.info('WABA token exchange successful', { attempt });

        return {
          accessToken: responseData.access_token,
          tokenType: responseData.token_type || 'Bearer',
          expiresIn: responseData.expires_in,
          userId: stateData.userId,
        };
      } catch (error) {
        lastError = error as Error;

        if (error instanceof WABAServiceError) {
          throw error;
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Pass error through logger sanitizer (redacts client_secret in query
        // strings, strips axios config/request/response trees with Bearer leaks).
        logger.error('WABA token exchange error', {
          attempt,
          maxRetries,
          errorName: error instanceof Error ? error.name : 'Unknown',
          errorMessage,
        });

        // Retry on errors
        if (attempt < maxRetries) {
          const delay = attempt * 1000;
          logger.info('WABA token exchange retry scheduled', { delayMs: delay, attempt });
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw new WABAServiceError(
      WABAErrorCode.TOKEN_EXCHANGE_FAILED,
      `Token exchange failed after ${maxRetries} attempts: ${lastError?.message || 'Unknown error'}`
    );
  }

  /**
   * Encrypt state data for OAuth flow
   *
   * @param data - State data to encrypt
   * @returns Base64url encoded encrypted state
   */
  encryptState(data: StateData): string {
    const encryptedState = this.tokenEncryption.encrypt(JSON.stringify(data));
    return Buffer.from(JSON.stringify(encryptedState)).toString('base64url');
  }

  /**
   * Decrypt state parameter from OAuth callback
   *
   * @param state - Base64url encoded encrypted state
   * @returns Decrypted state data
   */
  decryptState(state: string): StateData {
    try {
      const encryptedState = JSON.parse(
        Buffer.from(state, 'base64url').toString('utf-8')
      );
      return JSON.parse(this.tokenEncryption.decrypt(encryptedState));
    } catch (error) {
      throw new WABAServiceError(
        WABAErrorCode.INVALID_STATE,
        'Invalid state parameter - decryption failed'
      );
    }
  }

  /**
   * Validate state parameter with timestamp expiry check
   *
   * Decrypts the state and validates that it hasn't expired.
   * State expires after 10 minutes.
   *
   * @param state - Base64url encoded encrypted state
   * @returns Validated state data
   *
   * Requirements: 2.4
   */
  validateState(state: string): StateData {
    // Decrypt state
    const stateData = this.decryptState(state);

    // Validate timestamp (must be within 10 minutes)
    const now = Date.now();
    const stateAge = now - stateData.timestamp;

    if (stateAge > STATE_EXPIRY_MS) {
      throw new WABAServiceError(
        WABAErrorCode.STATE_EXPIRED,
        'State parameter expired - please try again',
        { stateAge, maxAge: STATE_EXPIRY_MS }
      );
    }

    return stateData;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const wabaOAuth = new WABAOAuth(wabaSettings);
