// ============================================================================
// WABA Coexistence Module
// ============================================================================

import axios, { AxiosInstance } from 'axios';
import https from 'https';
import { WABAServiceError, WABAErrorCode } from './errors.js';
import { wabaSettings, WABASettings } from './settings.js';
import { metaApiQueue, criticalQueue } from '../../utils/requestQueue.js';
import { parseMetaError, getRetryDelay } from '../../utils/wabaErrors.js';
import { logger, extractAxiosError } from '../../utils/logger.js';
import { prisma } from '../../utils/database.js';
import type { CoexistenceStatus, SyncStatus, SyncDetail, MetaAPIError, QueueOptions } from './types.js';

// Create HTTPS agent that forces IPv4
const httpsAgent = new https.Agent({
  family: 4, // Force IPv4
  rejectUnauthorized: true,
});

// ============================================================================
// WABACoexistence Class
// ============================================================================

/**
 * WABACoexistence
 *
 * Handles WhatsApp Business App integration (Coexistence) including:
 * - Check coexistence status (is_on_biz_app, platform_type)
 * - Trigger contact synchronization
 * - Trigger message history synchronization
 * - Track sync progress and status
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
 */
export class WABACoexistence {
  private client: AxiosInstance;

  constructor(private settings: WABASettings) {
    this.client = axios.create({
      baseURL: `https://graph.facebook.com`,
      timeout: 60000, // Increased to 60s for slow connections
      headers: {
        'Content-Type': 'application/json',
      },
      httpsAgent, // Force IPv4 to avoid ETIMEDOUT on IPv6
    });
  }

  // ==========================================================================
  // Coexistence Status
  // ==========================================================================

  /**
   * Check if phone number is using Coexistence (WhatsApp Business App + Cloud API)
   *
   * Requirements: 6.2
   *
   * @param phoneNumberId - Phone number ID
   * @param accessToken - Access token
   * @returns Coexistence status details
   */
  async checkStatus(phoneNumberId: string, accessToken: string): Promise<CoexistenceStatus> {
    // Ensure settings are loaded
    await this.settings.ensureLoaded();
    const apiVersion = this.settings.getApiVersion();

    try {
      const response = await this.queuedApiCall(
        async () => {
          const result = await this.client.get(`/${apiVersion}/${phoneNumberId}`, {
            params: {
              fields: 'is_on_biz_app,platform_type',
              access_token: accessToken,
            },
          });
          return result.data;
        },
        {
          critical: false,
          priority: 50,
          operationName: 'Check coexistence status',
        }
      );

      return {
        isOnBizApp: response.is_on_biz_app || false,
        platformType: response.platform_type || 'CLOUD_API',
      };
    } catch (error) {
      if (error instanceof WABAServiceError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const metaError = error.response?.data?.error as MetaAPIError;
        throw new WABAServiceError(
          WABAErrorCode.COEXISTENCE_ERROR,
          `Failed to check coexistence status: ${metaError?.message || error.message}`,
          {
            phoneNumberId,
            code: metaError?.code,
            type: metaError?.type,
          }
        );
      }

      throw new WABAServiceError(
        WABAErrorCode.COEXISTENCE_ERROR,
        `Failed to check coexistence status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { phoneNumberId }
      );
    }
  }

  // ==========================================================================
  // Contact Synchronization
  // ==========================================================================

  /**
   * Trigger contact synchronization from WhatsApp Business App
   *
   * Requirements: 6.3
   *
   * @param phoneNumberId - Phone number ID
   * @param accessToken - Access token
   * @returns Request ID for tracking
   */
  async syncContacts(phoneNumberId: string, accessToken: string): Promise<string> {
    // Ensure settings are loaded
    await this.settings.ensureLoaded();
    const apiVersion = this.settings.getApiVersion();

    try {
      const response = await this.queuedApiCall(
        async () => {
          const result = await this.client.post(
            `/${apiVersion}/${phoneNumberId}/smb_app_data`,
            {
              messaging_product: 'whatsapp',
              sync_type: 'smb_app_state_sync',
            },
            {
              params: {
                access_token: accessToken,
              },
            }
          );
          return result.data;
        },
        {
          critical: true,
          priority: 90,
          operationName: 'Sync contacts',
        }
      );

      logger.info('Contact sync initiated', { phoneNumberId, requestId: response.request_id });
      return response.request_id;
    } catch (error) {
      if (error instanceof WABAServiceError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const metaError = error.response?.data?.error as MetaAPIError;
        throw new WABAServiceError(
          WABAErrorCode.SYNC_FAILED,
          `Failed to sync contacts: ${metaError?.message || error.message}`,
          {
            phoneNumberId,
            code: metaError?.code,
            type: metaError?.type,
          }
        );
      }

      throw new WABAServiceError(
        WABAErrorCode.SYNC_FAILED,
        `Failed to sync contacts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { phoneNumberId }
      );
    }
  }

  // ==========================================================================
  // Message History Synchronization
  // ==========================================================================

  /**
   * Trigger message history synchronization from WhatsApp Business App
   *
   * Requirements: 6.4
   *
   * @param phoneNumberId - Phone number ID
   * @param accessToken - Access token
   * @returns Request ID for tracking
   */
  async syncHistory(phoneNumberId: string, accessToken: string): Promise<string> {
    // Ensure settings are loaded
    await this.settings.ensureLoaded();
    const apiVersion = this.settings.getApiVersion();

    try {
      const response = await this.queuedApiCall(
        async () => {
          const result = await this.client.post(
            `/${apiVersion}/${phoneNumberId}/smb_app_data`,
            {
              messaging_product: 'whatsapp',
              sync_type: 'history',
            },
            {
              params: {
                access_token: accessToken,
              },
            }
          );
          return result.data;
        },
        {
          critical: true,
          priority: 90,
          operationName: 'Sync message history',
        }
      );

      logger.info('History sync initiated', { phoneNumberId, requestId: response.request_id });
      return response.request_id;
    } catch (error) {
      if (error instanceof WABAServiceError) {
        throw error;
      }

      if (axios.isAxiosError(error)) {
        const metaError = error.response?.data?.error as MetaAPIError;
        throw new WABAServiceError(
          WABAErrorCode.SYNC_FAILED,
          `Failed to sync history: ${metaError?.message || error.message}`,
          {
            phoneNumberId,
            code: metaError?.code,
            type: metaError?.type,
          }
        );
      }

      throw new WABAServiceError(
        WABAErrorCode.SYNC_FAILED,
        `Failed to sync history: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { phoneNumberId }
      );
    }
  }

  // ==========================================================================
  // Sync Status Tracking
  // ==========================================================================

  /**
   * Get coexistence sync status for a user
   *
   * Requirements: 6.5
   *
   * @param userId - User ID
   * @returns Sync status details for contacts and history
   */
  async getSyncStatus(userId: string): Promise<SyncStatus> {
    try {
      const account = await prisma.whatsAppAccount.findFirst({
        where: { userId },
        select: {
          coexistenceSyncProgress: true,
          coexistenceSyncStatus: true,
          contactSyncCompletedAt: true,
          historySyncCompletedAt: true,
          historySharingConsent: true,
          coexistenceSyncLogs: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
        },
      });

      if (!account) {
        throw new WABAServiceError(WABAErrorCode.USER_NOT_FOUND, 'WhatsApp account not found', { userId });
      }

      // Find latest contact and history sync logs
      const contactSync = account.coexistenceSyncLogs.find((log) => log.syncType === 'contacts');
      const historySync = account.coexistenceSyncLogs.find((log) => log.syncType === 'history');

      const contacts: SyncDetail = {
        status: contactSync?.status || 'not_started',
        progress: contactSync?.progress || 0,
        completedAt: account.contactSyncCompletedAt,
        error: contactSync?.errorMessage || undefined,
      };

      const history: SyncDetail = {
        status: historySync?.status || 'not_started',
        progress: historySync?.progress || 0,
        phase: historySync?.phase?.toString() || undefined,
        completedAt: account.historySyncCompletedAt,
        consentGiven: account.historySharingConsent || false,
        error: historySync?.errorMessage || undefined,
      };

      return {
        contacts,
        history,
        overallProgress: account.coexistenceSyncProgress || 0,
      };
    } catch (error) {
      if (error instanceof WABAServiceError) {
        throw error;
      }

      logger.error('Failed to get sync status', { userId, error: extractAxiosError(error) });
      throw new WABAServiceError(
        WABAErrorCode.COEXISTENCE_ERROR,
        `Failed to get sync status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { userId }
      );
    }
  }

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Execute a Meta API call with queue management and retry logic
   *
   * @param fn - Function to execute
   * @param options - Queue options
   * @returns Result of the function
   */
  private async queuedApiCall<T>(fn: () => Promise<T>, options: QueueOptions = {}): Promise<T> {
    const queue = options.critical ? criticalQueue : metaApiQueue;
    const operationName = options.operationName || 'Meta API call';

    return queue.enqueue(() => this.retryWithBackoff(fn, 3, operationName), {
      priority: options.priority,
      maxRetries: 3,
    });
  }

  /**
   * Retry a function with exponential backoff
   *
   * @param fn - Function to retry
   * @param maxRetries - Maximum number of retries
   * @param operationName - Name of the operation for logging
   * @returns Result of the function
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    operationName: string = 'Meta API call'
  ): Promise<T> {
    let lastError: Error | null = null;
    const attemptLog: Array<{ attempt: number; error?: string; delay?: number }> = [];

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await fn();

        // Log successful attempt if there were previous failures
        if (attemptLog.length > 0) {
          logger.info(`${operationName} succeeded on attempt ${attempt + 1} after ${attemptLog.length} failures`);
        }

        return result;
      } catch (error) {
        lastError = error as Error;

        // Check if error is retryable
        if (axios.isAxiosError(error)) {
          const status = error.response?.status;
          const metaError = error.response?.data?.error as MetaAPIError;

          // Don't retry on client errors (except rate limits)
          if (status && status >= 400 && status < 500 && status !== 429) {
            logger.error(`${operationName} failed with non-retryable error:`, {
              status,
              code: metaError?.code,
              message: metaError?.message,
              type: metaError?.type,
            });

            throw parseMetaError(error);
          }

          // Rate limit error - wait longer with exponential backoff
          if (status === 429 || metaError?.code === 4 || metaError?.code === 17 || metaError?.code === 32) {
            const delay = getRetryDelay(attempt, 2000);
            attemptLog.push({ attempt: attempt + 1, error: 'Rate limit', delay });

            logger.warn(
              `${operationName}: Rate limit hit, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }

          // Server error - retry with backoff
          if (status && status >= 500) {
            const delay = getRetryDelay(attempt, 1000);
            attemptLog.push({ attempt: attempt + 1, error: `Server error ${status}`, delay });

            logger.warn(
              `${operationName}: Server error ${status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
            );
            await new Promise((resolve) => setTimeout(resolve, delay));
            continue;
          }
        }

        // Network error - retry
        if (
          error instanceof Error &&
          (error.message.includes('ECONNREFUSED') ||
            error.message.includes('ETIMEDOUT') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('ECONNRESET'))
        ) {
          const delay = getRetryDelay(attempt, 1000);
          attemptLog.push({ attempt: attempt + 1, error: 'Network error', delay });

          logger.warn(
            `${operationName}: Network error, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // Unknown error - don't retry
        logger.error(`${operationName} failed with unknown error`, {
          error: extractAxiosError(error),
        });
        throw error;
      }
    }

    // Max retries exceeded
    logger.error(`${operationName} failed after ${maxRetries} attempts`, { attemptLog });

    if (axios.isAxiosError(lastError)) {
      throw parseMetaError(lastError);
    }

    throw (
      lastError ||
      new WABAServiceError(WABAErrorCode.INTERNAL_ERROR, 'Max retries exceeded', {
        operationName,
        attempts: maxRetries,
      })
    );
  }
}

// Export singleton instance
export const wabaCoexistence = new WABACoexistence(wabaSettings);
