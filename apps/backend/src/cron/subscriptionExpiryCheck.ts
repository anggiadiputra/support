/**
 * Subscription Expiry Check Cron Job
 * 
 * Runs daily to:
 * 1. Query subscriptions expiring in 7 days and send reminder emails
 * 2. Query subscriptions expiring in 1 day and send final reminder emails
 * 3. Query expired subscriptions and downgrade to FREE tier
 * 
 * Requirements: 11.1, 11.2, 11.3, 11.4, 11.5
 */

import cron from 'node-cron';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { emailService } from '../services/email/index.js';
import { auditLog } from '../utils/auditLog.js';
import { notificationService } from '../services/notification-service.js';

/**
 * Get subscriptions expiring within a specific number of days
 */
async function getExpiringSubscriptions(daysFromNow: number) {
  const now = new Date();
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysFromNow);
  
  // Set to start and end of the target day
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  return prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      tier: { not: 'FREE' },
      endDate: {
        gte: startOfDay,
        lte: endOfDay,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Get expired subscriptions that need to be downgraded
 */
async function getExpiredSubscriptions() {
  const now = new Date();

  return prisma.subscription.findMany({
    where: {
      status: 'ACTIVE',
      tier: { not: 'FREE' },
      endDate: {
        lt: now,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
        },
      },
    },
  });
}

/**
 * Send expiry reminder email and create notification
 */
async function sendExpiryReminder(
  subscription: {
    id: string;
    tier: string;
    endDate: Date | null;
    user: { id: string; email: string; name: string };
  },
  daysUntilExpiry: number
): Promise<boolean> {
  try {
    if (!subscription.endDate) return false;

    const result = await emailService.sendSubscriptionExpiryReminderEmail({
      to: subscription.user.email,
      userName: subscription.user.name || 'Pelanggan',
      tierName: subscription.tier,
      expiryDate: subscription.endDate,
      daysUntilExpiry,
    });

    // Create in-app notification alongside email
    await notificationService.createSubscriptionExpiryWarning(
      subscription.user.id,
      daysUntilExpiry
    );

    if (result.success) {
      logger.info('Subscription expiry reminder sent', {
        userId: subscription.user.id,
        tier: subscription.tier,
        daysUntilExpiry,
      });
      return true;
    } else {
      logger.warn('Failed to send subscription expiry reminder', {
        userId: subscription.user.id,
        error: result.error,
      });
      return false;
    }
  } catch (error) {
    logger.error('Error sending subscription expiry reminder', {
      userId: subscription.user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Downgrade expired subscription to FREE tier
 * Requirements: 11.4, 11.5
 */
async function downgradeExpiredSubscription(
  subscription: {
    id: string;
    tier: string;
    endDate: Date | null;
    user: { id: string; email: string; name: string };
  }
): Promise<boolean> {
  try {
    const previousTier = subscription.tier;

    // Update subscription status to EXPIRED and tier to FREE
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'EXPIRED',
        tier: 'FREE',
      },
    });

    // Also update user's subscriptionTier field
    await prisma.user.update({
      where: { id: subscription.user.id },
      data: { subscriptionTier: 'FREE' },
    });

    // Create audit log
    await auditLog(
      'subscription_expired',
      'subscription',
      subscription.id,
      {
        previousTier,
        newTier: 'FREE',
        expiredAt: subscription.endDate?.toISOString(),
      },
      subscription.user.id
    );

    // Send expiry notification email
    try {
      await emailService.sendSubscriptionExpiredEmail({
        to: subscription.user.email,
        userName: subscription.user.name || 'Pelanggan',
        tierName: previousTier,
        expiredDate: subscription.endDate || new Date(),
      });
    } catch (emailError) {
      logger.warn('Failed to send subscription expired email', {
        userId: subscription.user.id,
        error: emailError instanceof Error ? emailError.message : 'Unknown error',
      });
    }

    logger.info('Subscription downgraded due to expiry', {
      subscriptionId: subscription.id,
      userId: subscription.user.id,
      previousTier,
    });

    return true;
  } catch (error) {
    logger.error('Failed to downgrade expired subscription', {
      subscriptionId: subscription.id,
      userId: subscription.user.id,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Main function to check subscription expiry
 * Requirements: 11.1, 11.2, 11.3, 11.4
 */
export async function checkSubscriptionExpiry(): Promise<{
  reminders7Day: number;
  reminders1Day: number;
  downgraded: number;
}> {
  const results = {
    reminders7Day: 0,
    reminders1Day: 0,
    downgraded: 0,
  };

  try {
    // 1. Send 7-day reminder emails (Requirement 11.2)
    const expiring7Days = await getExpiringSubscriptions(7);
    for (const subscription of expiring7Days) {
      const sent = await sendExpiryReminder(subscription, 7);
      if (sent) results.reminders7Day++;
    }

    // 2. Send 1-day reminder emails (Requirement 11.3)
    const expiring1Day = await getExpiringSubscriptions(1);
    for (const subscription of expiring1Day) {
      const sent = await sendExpiryReminder(subscription, 1);
      if (sent) results.reminders1Day++;
    }

    // 3. Downgrade expired subscriptions (Requirement 11.4)
    const expired = await getExpiredSubscriptions();
    for (const subscription of expired) {
      const downgraded = await downgradeExpiredSubscription(subscription);
      if (downgraded) results.downgraded++;
    }

    return results;
  } catch (error) {
    logger.error('Error in subscription expiry check', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return results;
  }
}

/**
 * Start the subscription expiry check cron job
 * Runs daily at 8:00 AM
 * Requirement: 11.1
 */
export function startSubscriptionExpiryCheckJob() {
  // Run daily at 8:00 AM
  cron.schedule('0 8 * * *', async () => {
    try {
      logger.info('Starting subscription expiry check...');
      const results = await checkSubscriptionExpiry();
      
      logger.info('✅ Subscription expiry check completed', {
        reminders7Day: results.reminders7Day,
        reminders1Day: results.reminders1Day,
        downgraded: results.downgraded,
      });
    } catch (error) {
      logger.error('❌ Error in subscription expiry check cron job:', error);
    }
  });

  logger.info('📅 Subscription expiry check cron job started (runs daily at 8:00 AM)');
}
