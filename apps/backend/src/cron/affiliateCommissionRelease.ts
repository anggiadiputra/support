/**
 * Affiliate Commission Release Cron Job
 *
 * Runs daily at 00:05 UTC to release pending commissions
 * that have passed their holding period.
 */

import cron from 'node-cron';
import { affiliateService } from '../services/affiliate-service.js';
import { logger } from '../utils/logger.js';

/**
 * Process and release pending affiliate commissions
 */
export async function processAffiliateCommissions(): Promise<{
  processed: number;
  failed: number;
}> {
  try {
    logger.info('Starting affiliate commission release job...');

    const result = await affiliateService.processReleaseableCommissions();

    logger.info('✅ Affiliate commission release job completed', {
      processed: result.processed,
      failed: result.failed,
    });

    return result;
  } catch (error) {
    logger.error('❌ Affiliate commission release job failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return { processed: 0, failed: 0 };
  }
}

/**
 * Start the affiliate commission release cron job
 * Runs daily at 00:05 UTC
 */
export function startAffiliateCommissionReleaseJob() {
  // Run at 00:05 UTC daily
  cron.schedule('5 0 * * *', async () => {
    await processAffiliateCommissions();
  });

  logger.info('📅 Affiliate commission release cron job started (runs daily at 00:05 UTC)');
}
