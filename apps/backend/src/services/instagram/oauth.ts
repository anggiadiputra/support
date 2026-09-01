/**
 * Instagram OAuth Module
 * 
 * Contains OAuth helper functions for Instagram Business Login flow.
 * Extracted from InstagramService.ts for better modularity.
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */

import axios, { AxiosInstance } from 'axios';
import { randomBytes } from 'crypto';
import { TokenEncryptionService } from '../../utils/tokenEncryption.js';
import { logger, extractAxiosError } from '../../utils/logger.js';
import { AuthUrlResponse, TokenResponse, LongLivedTokenResponse } from './types.js';
import { IGErrorCode, InstagramError } from './errors.js';

// ============================================================================
// Types
// ============================================================================

/**
 * Dependencies required for OAuth operations
 */
export interface OAuthDependencies {
  client: AxiosInstance;
  tokenEncryption: TokenEncryptionService;
  appId: string;
  appSecret: string;
  redirectUri: string;
}

/**
 * Decrypted state data from OAuth callback
 */
export interface StateData {
  userId: string;
  nonce: string;
  timestamp: number;
}

// ============================================================================
// OAuth Functions
// ============================================================================

/**
 * Generate Instagram OAuth authorization URL
 * Uses Instagram Business Login with required scopes
 * 
 * @param deps - OAuth dependencies
 * @param userId - The user ID initiating the Instagram connection
 * @param redirectUri - Optional custom redirect URI (overrides deps.redirectUri)
 * @returns AuthUrlResponse with URL, state, and expiration
 */
export async function generateAuthUrl(
  deps: OAuthDependencies,
  userId: string,
  redirectUri?: string
): Promise<AuthUrlResponse> {
  try {
    // Generate nonce for CSRF protection
    const nonce = randomBytes(16).toString('hex');
    const timestamp = Date.now();

    // Create state object
    const stateData: StateData = {
      userId,
      nonce,
      timestamp,
    };

    // Encrypt state parameter
    const encryptedState = deps.tokenEncryption.encrypt(JSON.stringify(stateData));
    const state = Buffer.from(JSON.stringify(encryptedState)).toString('base64url');

    // Build OAuth URL for Instagram Business Login
    const redirect = redirectUri || deps.redirectUri;

    logger.debug('[InstagramService] generateAuthUrl', { redirectUri: redirect });

    const authUrl = new URL('https://www.instagram.com/oauth/authorize');

    authUrl.searchParams.set('client_id', deps.appId);
    authUrl.searchParams.set('redirect_uri', redirect);
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('response_type', 'code');
    // Required scopes for Instagram DM
    authUrl.searchParams.set('scope', 'instagram_business_basic,instagram_business_manage_messages');

    logger.debug('[InstagramService] Generated OAuth URL', { authUrl: authUrl.toString() });

    // State expires in 10 minutes
    const expiresAt = new Date(timestamp + 10 * 60 * 1000).toISOString();

    return {
      authUrl: authUrl.toString(),
      state,
      expiresAt,
    };
  } catch (error) {
    throw new InstagramError(
      IGErrorCode.INTERNAL_ERROR,
      `Failed to generate auth URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    );
  }
}

/**
 * Exchange authorization code for short-lived access token
 * Strips the trailing #_ from the code as per Instagram API requirements
 * 
 * @param deps - OAuth dependencies
 * @param code - Authorization code from Instagram callback
 * @param state - Encrypted state parameter
 * @returns TokenResponse with access token, user ID, and original userId from state
 */
export async function exchangeCodeForToken(
  deps: OAuthDependencies,
  code: string,
  state: string
): Promise<TokenResponse & { userId: string }> {
  try {
    // Decrypt and validate state parameter
    const stateData = decryptState(deps.tokenEncryption, state);

    // Validate state timestamp (must be within 10 minutes)
    const now = Date.now();
    const stateAge = now - stateData.timestamp;
    if (stateAge > 10 * 60 * 1000) {
      throw new InstagramError(
        IGErrorCode.STATE_EXPIRED,
        'State parameter expired',
        400,
        true,
        'Please try connecting again'
      );
    }

    // Strip trailing #_ from authorization code (Instagram API quirk)
    const cleanCode = code.replace(/#_$/, '');

    // Exchange code for short-lived token via POST to api.instagram.com
    const formData = new URLSearchParams();
    formData.append('client_id', deps.appId);
    formData.append('client_secret', deps.appSecret);
    formData.append('grant_type', 'authorization_code');
    formData.append('redirect_uri', deps.redirectUri);
    formData.append('code', cleanCode);

    logger.debug('[IG OAuth] Token exchange request', {
      client_id: deps.appId,
      redirect_uri: deps.redirectUri,
      code_length: cleanCode.length,
    });

    let response;
    try {
      response = await deps.client.post(
        'https://api.instagram.com/oauth/access_token',
        formData.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );
    } catch (axiosError: unknown) {
      // extractAxiosError drops config/request/response.headers (Bearer leak vector)
      // and the winston sanitizer further redacts any client_secret in the URL.
      logger.error('[IG OAuth] Token exchange error', {
        error: extractAxiosError(axiosError),
      });
      throw axiosError;
    }

    const { access_token, user_id, permissions } = response.data;

    // Handle permissions - could be string, array, or undefined
    let permissionsList: string[] = [];
    if (typeof permissions === 'string') {
      permissionsList = permissions.split(',');
    } else if (Array.isArray(permissions)) {
      permissionsList = permissions;
    }

    return {
      accessToken: access_token,
      userId: String(user_id), // Instagram-scoped user ID
      permissions: permissionsList,
    };
  } catch (error) {
    if (error instanceof InstagramError) {
      throw error;
    }

    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error || error.response?.data;
      throw new InstagramError(
        IGErrorCode.TOKEN_EXCHANGE_FAILED,
        `Token exchange failed: ${metaError?.error_message || metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Please try connecting again',
        metaError ? {
          code: metaError.code || 0,
          message: metaError.error_message || metaError.message || '',
          type: metaError.error_type || metaError.type || 'OAuthException',
        } : undefined
      );
    }

    throw new InstagramError(
      IGErrorCode.TOKEN_EXCHANGE_FAILED,
      `Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    );
  }
}

/**
 * Exchange short-lived token for long-lived token (60 days validity)
 * 
 * @param deps - OAuth dependencies
 * @param shortLivedToken - Short-lived access token from initial exchange
 * @returns LongLivedTokenResponse with new token and expiration
 */
export async function exchangeForLongLivedToken(
  deps: OAuthDependencies,
  shortLivedToken: string
): Promise<LongLivedTokenResponse> {
  try {
    const response = await deps.client.get('https://graph.instagram.com/access_token', {
      params: {
        grant_type: 'ig_exchange_token',
        client_secret: deps.appSecret,
        access_token: shortLivedToken,
      },
    });

    const { access_token, token_type, expires_in } = response.data;

    return {
      accessToken: access_token,
      tokenType: token_type || 'Bearer',
      expiresIn: expires_in || 5184000, // Default 60 days in seconds
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error;
      throw new InstagramError(
        IGErrorCode.TOKEN_EXCHANGE_FAILED,
        `Long-lived token exchange failed: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Please try connecting again',
        metaError ? {
          code: metaError.code,
          message: metaError.message,
          type: metaError.type,
          subcode: metaError.error_subcode,
        } : undefined
      );
    }

    throw new InstagramError(
      IGErrorCode.TOKEN_EXCHANGE_FAILED,
      `Long-lived token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    );
  }
}

/**
 * Decrypt and validate state parameter from OAuth callback
 * 
 * @param tokenEncryption - Token encryption service instance
 * @param state - Base64url encoded encrypted state
 * @returns Decrypted state data with userId, nonce, and timestamp
 */
export function decryptState(
  tokenEncryption: TokenEncryptionService,
  state: string
): StateData {
  try {
    const encryptedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
    return JSON.parse(tokenEncryption.decrypt(encryptedState));
  } catch (error) {
    throw new InstagramError(
      IGErrorCode.STATE_INVALID,
      'Invalid state parameter',
      400,
      true,
      'Please try connecting again'
    );
  }
}
