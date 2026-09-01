import cron from 'node-cron';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { emailService } from '../services/email/index.js';
import { notificationService } from '../services/notification-service.js';

/**
 * Find API keys expiring within 30 days and send email notifications
 * Requirement 1.5: API keys have configurable expiration
 */
export async function notifyExpiringApiKeys(): Promise<number> {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Find active (non-revoked) API keys expiring within 30 days
  const expiringKeys = await prisma.apiKey.findMany({
    where: {
      expiresAt: {
        gte: now,
        lte: thirtyDaysFromNow
      },
      revokedAt: null
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    }
  });

  let notificationsSent = 0;

  for (const key of expiringKeys) {
    try {
      const daysUntilExpiry = Math.ceil(
        (key.expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Only notify at specific intervals: 30, 14, 7, 3, 1 days
      const notifyDays = [30, 14, 7, 3, 1];
      if (!notifyDays.includes(daysUntilExpiry)) {
        continue;
      }

      await emailService.sendApiKeyExpiring(
        key.name,
        key.keyPrefix,
        key.expiresAt,
        daysUntilExpiry,
        key.user.name || 'User',
        key.user.email
      );

      // Create in-app notification alongside email
      await notificationService.createApiKeyExpiryWarning(
        key.user.id,
        key.name,
        daysUntilExpiry
      );

      notificationsSent++;

      logger.info(`Sent API key expiration notification`, {
        keyId: key.id,
        keyName: key.name,
        userId: key.userId,
        daysUntilExpiry
      });
    } catch (error) {
      logger.error(`Failed to send API key expiration notification`, {
        keyId: key.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return notificationsSent;
}

/**
 * Cron job to notify users about expiring API keys
 * Runs daily at 9:00 AM (business hours)
 */
export function startApiKeyExpirationNotifyJob() {
  // Run daily at 9:00 AM
  cron.schedule('0 9 * * *', async () => {
    try {
      const count = await notifyExpiringApiKeys();
      if (count > 0) {
        logger.info(`✅ Sent ${count} API key expiration notifications`);
      }
    } catch (error) {
      logger.error('❌ Error sending API key expiration notifications:', error);
    }
  });

  logger.info('🔑 API key expiration notification cron job started (runs daily at 9:00 AM)');
}
