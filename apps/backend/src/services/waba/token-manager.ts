// ============================================================================
// WABA Token Management Module
// ============================================================================

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { prisma } from '../../utils/database.js';
import { TokenEncryptionService } from '../../utils/tokenEncryption.js';
import { WABAServiceError, WABAErrorCode } from './errors.js';
import { wabaSettings, WABASettings } from './settings.js';
import { metaApiQueue, criticalQueue } from '../../utils/requestQueue.js';
import { parseMetaError, getRetryDelay } from '../../utils/wabaErrors.js';
import { emailService } from '../email/index.js';
import { logger } from '../../utils/logger.js';
import {
  getWhatsAppAccountByWabaId,
  decryptAccountToken,
} from '../../utils/whatsapp-account-helper.js';
import type { TokenRefreshResult, MetaAPIError, EncryptedToken } from './types.js';

// Create HTTPS agent that forces IPv4
const httpsAgent = new https.Agent({
  family: 4, // Force IPv4
  rejectUnauthorized: true,
});

// ============================================================================
// WABATokenManager Class
// ============================================================================

/**
 * WABATokenManager
 * 
 * Handles token lifecycle management for WABA including:
 * - Token refresh with retry logic
 * - Token expiration checking
 * - Token encryption/decryption
 * - Token revocation handling with WABA disconnect
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export class WABATokenManager {
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

  // ==========================================================================
  // Token Refresh
  // ==========================================================================

  /**
   * Refresh access token for a WABA
   * Exchanges current token for a new long-lived token
   * 
   * Requirements: 3.1, 3.2
   * 
   * @param wabaId - WhatsApp Business Account ID
   * @returns New token response with expiration
   */
  async refreshAccessToken(wabaId: string): Promise<TokenRefreshResult> {
    // Ensure settings are loaded
    await this.settings.ensureLoaded();

    try {
      // Get WhatsApp account with encrypted token
      const account = await getWhatsAppAccountByWabaId(wabaId);

      if (!account) {
        throw new WABAServiceError(
          WABAErrorCode.USER_NOT_FOUND,
          `WhatsApp account not found for WABA ID: ${wabaId}`
        );
      }

      if (!account.accessToken || !account.accessTokenIV || !account.accessTokenTag) {
        throw new WABAServiceError(
          WABAErrorCode.TOKEN_NOT_FOUND,
          'No access token found for this WABA'
        );
      }

      // Decrypt current token
      const currentToken = decryptAccountToken(account);

      // Exchange current token for new long-lived token (critical operation)
      const tokenData = await this.queuedApiCall(
        async () => {
          const response = await this.client.get('/oauth/access_token', {
            params: {
              grant_type: 'fb_exchange_token',
              client_id: this.settings.getAppId(),
              client_secret: this.settings.getAppSecret(),
              fb_exchange_token: currentToken,
            },
          });
          return response.data;
        },
        {
          critical: true,
          priority: 100,
          operationName: 'Token refresh',
        }
      );

      const newAccessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in || 5184000; // Default 60 days

      // Encrypt new token
      const encryptedToken = this.encryptToken(newAccessToken);

      // Calculate expiration date
      const expiresAt = new Date(Date.now() + expiresIn * 1000);

      // Update database with new token
      await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encryptedToken.ciphertext,
          accessTokenIV: encryptedToken.iv,
          accessTokenTag: encryptedToken.authTag,
          tokenExpiresAt: expiresAt,
          tokenLastRefresh: new Date(),
        },
      });

      // Log token refresh
      await prisma.wABAConnectionLog.create({
        data: {
          userId: account.userId,
          action: 'token_refreshed',
          details: {
            expiresAt: expiresAt.toISOString(),
            expiresIn,
          },
        },
      });

      logger.info('WABA token refreshed successfully', { wabaId, expiresAt });

      return {
        accessToken: newAccessToken,
        tokenType: 'Bearer',
        expiresIn,
        expiresAt,
      };
    } catch (error) {
      // Log error and handle token revocation
      await this.handleRefreshError(wabaId, error);

      if (error instanceof WABAServiceError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const metaError = error.response?.data?.error as MetaAPIError;
        throw new WABAServiceError(
          WABAErrorCode.TOKEN_REFRESH_FAILED,
          `Token refresh failed: ${metaError?.message || error.message}`,
          { wabaId, metaError }
        );
      }

      throw new WABAServiceError(
        WABAErrorCode.TOKEN_REFRESH_FAILED,
        `Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { wabaId }
      );
    }
  }

  /**
   * Handle token refresh error
   * Logs error and handles token revocation by disconnecting WABA
   * 
   * Requirements: 3.5
   */
  private async handleRefreshError(wabaId: string, error: unknown): Promise<void> {
    const account = await getWhatsAppAccountByWabaId(wabaId);

    if (!account) {
      return;
    }

    // Log the error
    await prisma.wABAConnectionLog.create({
      data: {
        userId: account.userId,
        action: 'token_refresh_failed',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        details: {
          wabaId,
          timestamp: new Date().toISOString(),
        },
      },
    }).catch(() => {}); // Ignore logging errors

    // Check if token is revoked and disconnect WABA
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error as MetaAPIError;

      // Token is invalid, expired, or revoked (code 190, subcode 463 or 467)
      if (metaError?.code === 190 || metaError?.error_subcode === 463 || metaError?.error_subcode === 467) {
        logger.warn('WABA token revoked, disconnecting account', { wabaId, metaError });

        // Mark WhatsApp account as disconnected
        await prisma.whatsAppAccount.update({
          where: { id: account.id },
          data: {
            connectionStatus: 'disconnected',
          },
        });

        // Send email notification
        try {
          await emailService.sendWABADisconnected(
            wabaId,
            account.user.name || 'User',
            'Access token was revoked or expired',
            account.user.email
          );
        } catch (emailError) {
          logger.error('Failed to send WABA disconnected email', { error: emailError });
        }
      }
    }
  }

  // ==========================================================================
  // Token Expiration Checking
  // ==========================================================================

  /**
   * Check if any WhatsApp account for a user has a token expiring soon (within 7 days)
   *
   * Requirements: 3.4
   *
   * @param userId - User ID
   * @returns True if any account's token is expiring within 7 days
   */
  async isTokenExpiringSoon(userId: string): Promise<boolean> {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const expiringAccount = await prisma.whatsAppAccount.findFirst({
      where: {
        userId,
        connectionStatus: 'connected',
        tokenExpiresAt: {
          lte: sevenDaysFromNow,
        },
      },
      select: { id: true },
    });

    return expiringAccount !== null;
  }

  /**
   * Get all WABA IDs with tokens expiring soon (within 7 days)
   * Only returns accounts that are connected
   * 
   * Requirements: 3.4
   * 
   * @returns Array of WABA IDs
   */
  async getAccountsWithExpiringTokens(): Promise<string[]> {
    const sevenDaysFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const accounts = await prisma.whatsAppAccount.findMany({
      where: {
        tokenExpiresAt: {
          lte: sevenDaysFromNow,
        },
        connectionStatus: 'connected',
      },
      select: {
        wabaId: true,
      },
    });

    return accounts.map(a => a.wabaId);
  }

  // ==========================================================================
  // Token Encryption/Decryption
  // ==========================================================================

  /**
   * Encrypt an access token for storage
   * 
   * Requirements: 3.3
   * 
   * @param token - Plain text access token
   * @returns Encrypted token components
   */
  encryptToken(token: string): EncryptedToken {
    return this.tokenEncryption.encrypt(token);
  }

  /**
   * Decrypt an access token from storage
   * 
   * Requirements: 3.3
   * 
   * @param encrypted - Encrypted token object
   * @returns Decrypted access token
   */
  decryptToken(encrypted: EncryptedToken): string {
    return this.tokenEncryption.decrypt(encrypted);
  }

  /**
   * Get decrypted token for a user by WABA ID
   * 
   * @param wabaId - WhatsApp Business Account ID
   * @returns Decrypted access token
   */
  async getDecryptedTokenByWabaId(wabaId: string): Promise<string> {
    const account = await getWhatsAppAccountByWabaId(wabaId);

    if (!account) {
      throw new WABAServiceError(
        WABAErrorCode.USER_NOT_FOUND,
        `WhatsApp account not found for WABA ID: ${wabaId}`
      );
    }

    if (!account.accessToken || !account.accessTokenIV || !account.accessTokenTag) {
      throw new WABAServiceError(
        WABAErrorCode.TOKEN_NOT_FOUND,
        'No access token found for this WABA'
      );
    }

    return decryptAccountToken(account);
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Execute a Meta API call with queue management and retry logic
   */
  private async queuedApiCall<T>(
    fn: () => Promise<T>,
    options: {
      priority?: number;
      critical?: boolean;
      operationName?: string;
    } = {}
  ): Promise<T> {
    const queue = options.critical ? criticalQueue : metaApiQueue;
    const operationName = options.operationName || 'Meta API call';

    return queue.enqueue(
      () => this.retryWithBackoff(fn, 3, operationName),
      {
        priority: options.priority,
        maxRetries: 3,
      }
    );
  }

  /**
   * Retry a function with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    operationName: string = 'Meta API call'
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const metaError = error.response?.data?.error as MetaAPIError;

          // Don't retry on client errors (except rate limits)
          if (status && status >= 400 && status < 500 && status !== 429) {
            throw parseMetaError(error);
          }

          // Rate limit error - wait longer with exponential backoff
          if (status === 429 || metaError?.code === 4 || metaError?.code === 17 || metaError?.code === 32) {
            const delay = getRetryDelay(attempt, 2000);
            logger.warn(`${operationName}: Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }

          // Server error - retry with backoff
          if (status && status >= 500) {
            const delay = getRetryDelay(attempt, 1000);
            logger.warn(`${operationName}: Server error ${status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
        }

        // Network error - retry
        if (error instanceof Error && (
          error.message.includes('ECONNREFUSED') ||
          error.message.includes('ETIMEDOUT') ||
          error.message.includes('ENOTFOUND') ||
          error.message.includes('ECONNRESET')
        )) {
          const delay = getRetryDelay(attempt, 1000);
          logger.warn(`${operationName}: Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Unknown error - don't retry
        throw error;
      }
    }

    // Max retries exceeded
    if (axios.isAxiosError(lastError)) {
      throw parseMetaError(lastError);
    }

    throw lastError || new WABAServiceError(
      WABAErrorCode.INTERNAL_ERROR,
      'Max retries exceeded',
      { statusCode: 500, retryable: false }
    );
  }
}

// Export singleton instance
export const wabaTokenManager = new WABATokenManager(wabaSettings);
