import cron from 'node-cron';
import { wabaService } from '../services/waba/index.js';
import { emailService } from '../services/email/index.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/database.js';
import { getWhatsAppAccountByWabaId } from '../utils/whatsapp-account-helper.js';

/**
 * Cron job to refresh WABA access tokens
 * 
 * Runs daily at 2 AM to check for tokens expiring within 7 days
 * and refreshes them automatically.
 */
export function startWABATokenRefreshJob() {
  // Run daily at 2 AM
  cron.schedule('0 2 * * *', async () => {
    logger.info('Starting WABA token refresh job');

    try {
      // Get all accounts with tokens expiring soon
      const wabaIds = await wabaService.getAccountsWithExpiringTokens();

      if (wabaIds.length === 0) {
        logger.info('No tokens need refreshing');
        return;
      }

      logger.info(`Found ${wabaIds.length} tokens to refresh`);

      // Refresh tokens in batches of 10 to avoid rate limits
      const batchSize = 10;
      const results = {
        success: 0,
        failed: 0,
        errors: [] as Array<{ wabaId: string; error: string }>,
      };

      for (let i = 0; i < wabaIds.length; i += batchSize) {
        const batch = wabaIds.slice(i, i + batchSize);

        await Promise.allSettled(
          batch.map(async (wabaId) => {
            try {
              const result = await wabaService.refreshAccessToken(wabaId);
              logger.info(`Token refreshed for WABA ${wabaId}, expires at ${result.expiresAt}`);
              results.success++;
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              logger.error(`Failed to refresh token for WABA ${wabaId}: ${errorMessage}`);
              results.failed++;
              results.errors.push({ wabaId, error: errorMessage });
            }
          })
        );

        // Wait 1 second between batches to avoid rate limits
        if (i + batchSize < wabaIds.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      logger.info(
        `WABA token refresh job completed: ${results.success} succeeded, ${results.failed} failed`
      );

      // Send email notifications for failed refreshes
      if (results.failed > 0) {
        logger.error('Failed token refreshes:', JSON.stringify(results.errors, null, 2));
        
        // Send email notification for each failed refresh
        for (const error of results.errors) {
          try {
            // Get WhatsApp account and user details
            const account = await getWhatsAppAccountByWabaId(error.wabaId);

            if (account) {
              await emailService.sendTokenRefreshFailure(
                error.wabaId,
                account.user.name || 'User',
                error.error,
                account.user.email
              );
            }
          } catch (emailError) {
            logger.error(`Failed to send email notification for WABA ${error.wabaId}:`, emailError);
          }
        }
      }
    } catch (error) {
      logger.error('WABA token refresh job error:', error);
    }
  });

  logger.info('WABA token refresh cron job scheduled (daily at 2 AM)');
}
