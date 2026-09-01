import cron from 'node-cron';
import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger.js';
import { emailService } from '../services/email/index.js';
import { prisma } from '../utils/database.js';
import { decryptAccountToken } from '../utils/whatsapp-account-helper.js';

// Create HTTPS agent that forces IPv4 (fixes ETIMEDOUT on some servers)
const httpsAgent = new https.Agent({
  family: 4,
  rejectUnauthorized: true,
});

/**
 * Webhook health check failure tracking
 * Tracks consecutive failures per WABA to avoid spam
 */
const failureTracker = new Map<string, number>();

/**
 * Maximum consecutive failures before alerting administrators
 */
const MAX_FAILURES_BEFORE_ALERT = 3;

/**
 * Webhook fields to subscribe to
 */
const WEBHOOK_FIELDS = ['messages', 'message_status', 'message_template_status_update'];

/**
 * Cron job to verify webhook subscriptions are active
 * 
 * Runs hourly to check if webhooks are still subscribed and
 * resubscribes if needed. Alerts administrators on repeated failures.
 */
export function startWebhookHealthCheckJob() {
  // Run every hour at minute 0
  cron.schedule('0 * * * *', async () => {
    logger.info('Starting webhook health check job');

    try {
      // Get all connected WhatsApp accounts
      const accounts = await prisma.whatsAppAccount.findMany({
        where: {
          connectionStatus: 'connected',
          accessToken: { not: '' },
        },
        include: {
          user: true,
        },
      });

      if (accounts.length === 0) {
        logger.info('No connected WABAs found for webhook health check');
        return;
      }

      logger.info(`Checking webhook health for ${accounts.length} WhatsApp accounts`);

      const results = {
        healthy: 0,
        resubscribed: 0,
        failed: 0,
        errors: [] as Array<{ wabaId: string; error: string; attemptCount: number }>,
      };

      for (const account of accounts) {
        try {
          // Decrypt access token from WhatsApp account
          const accessToken = decryptAccountToken(account);

          // Check if webhook subscription is active
          const subscriptionResponse = await axios.get(
            `https://graph.facebook.com/v23.0/${account.wabaId}/subscribed_apps`,
            {
              params: {
                access_token: accessToken,
              },
              timeout: 30000,
              httpsAgent,
            }
          );

          const subscriptions = subscriptionResponse.data.data || [];
          const isSubscribed = subscriptions.some((sub: any) =>
            sub.whatsapp_business_api_data?.subscribed_fields?.length > 0
          );

          if (isSubscribed) {
            // Webhook is healthy
            results.healthy++;

            // Reset failure counter
            if (failureTracker.has(account.wabaId)) {
              failureTracker.delete(account.wabaId);
            }

            logger.info(`Webhook subscription healthy for WABA ${account.wabaId}`);
          } else {
            // Webhook subscription is missing, try to resubscribe
            logger.warn(`Webhook subscription missing for WABA ${account.wabaId}, attempting to resubscribe`);

            try {
              // Resubscribe to webhooks
              await axios.post(
                `https://graph.facebook.com/v23.0/${account.wabaId}/subscribed_apps`,
                {},
                {
                  params: {
                    access_token: accessToken,
                  },
                  timeout: 30000,
                  httpsAgent,
                }
              );

              results.resubscribed++;

              // Reset failure counter
              if (failureTracker.has(account.wabaId)) {
                failureTracker.delete(account.wabaId);
              }

              // Update webhook subscription timestamp on the WhatsApp account
              await prisma.whatsAppAccount.update({
                where: { id: account.id },
                data: {
                  webhookSubscribedAt: new Date(),
                },
              });

              logger.info(`Successfully resubscribed webhooks for WABA ${account.wabaId}`);
            } catch (resubscribeError) {
              const errorMessage = resubscribeError instanceof Error
                ? resubscribeError.message
                : 'Unknown error';

              // Increment failure counter
              const currentFailures = (failureTracker.get(account.wabaId) || 0) + 1;
              failureTracker.set(account.wabaId, currentFailures);

              results.failed++;
              results.errors.push({
                wabaId: account.wabaId,
                error: errorMessage,
                attemptCount: currentFailures,
              });

              logger.error(
                `Failed to resubscribe webhooks for WABA ${account.wabaId} (attempt ${currentFailures}): ${errorMessage}`
              );

              // Alert administrators after MAX_FAILURES_BEFORE_ALERT consecutive failures
              if (currentFailures >= MAX_FAILURES_BEFORE_ALERT) {
                await emailService.sendWebhookSubscriptionFailure(
                  account.wabaId,
                  account.user.name || 'Unknown User',
                  errorMessage,
                  currentFailures
                );

                logger.info(
                  `Sent webhook subscription failure alert for WABA ${account.wabaId} after ${currentFailures} attempts`
                );
              }
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';

          // Increment failure counter
          const currentFailures = (failureTracker.get(account.wabaId) || 0) + 1;
          failureTracker.set(account.wabaId, currentFailures);

          results.failed++;
          results.errors.push({
            wabaId: account.wabaId,
            error: errorMessage,
            attemptCount: currentFailures,
          });

          logger.error(
            `Webhook health check failed for WABA account ${account.id}: ${errorMessage}`
          );

          // Alert administrators after MAX_FAILURES_BEFORE_ALERT consecutive failures
          if (currentFailures >= MAX_FAILURES_BEFORE_ALERT) {
            await emailService.sendWebhookSubscriptionFailure(
              account.wabaId,
              account.user.name || 'Unknown User',
              errorMessage,
              currentFailures
            );
          }
        }

        // Wait 500ms between accounts to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info(
        `Webhook health check completed: ${results.healthy} healthy, ${results.resubscribed} resubscribed, ${results.failed} failed`
      );

      if (results.errors.length > 0) {
        logger.error('Webhook health check errors:', JSON.stringify(results.errors, null, 2));
      }
    } catch (error) {
      logger.error('Webhook health check job error:', error);
    }
  });

  logger.info('Webhook health check cron job scheduled (hourly)');
}
