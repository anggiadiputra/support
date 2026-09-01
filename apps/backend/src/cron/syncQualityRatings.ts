import cron from 'node-cron';
import axios from 'axios';
import https from 'https';
import { logger } from '../utils/logger.js';
import { QualityRatingEnum } from '@prisma/client';
import { emailService } from '../services/email/index.js';
import { prisma } from '../utils/database.js';
import { decryptAccountToken } from '../utils/whatsapp-account-helper.js';

// Create HTTPS agent that forces IPv4 (fixes ETIMEDOUT on some servers)
const httpsAgent = new https.Agent({
  family: 4,
  rejectUnauthorized: true,
});

// Meta API returns GREEN/YELLOW/RED, Prisma enum expects HIGH/MEDIUM/LOW
const metaRatingToEnum: Record<string, QualityRatingEnum> = {
  GREEN: QualityRatingEnum.HIGH,
  YELLOW: QualityRatingEnum.MEDIUM,
  RED: QualityRatingEnum.LOW,
};

/**
 * Cron job to sync quality ratings from Meta
 * 
 * Runs every 6 hours to check phone number quality ratings
 * and send alerts if ratings drop.
 */
export function startQualityRatingSyncJob() {
  // Run every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    logger.info('Starting quality rating sync job');

    try {
      // Get all phone numbers linked to connected WhatsApp accounts
      const phoneNumbers = await prisma.phoneNumber.findMany({
        where: {
          whatsappAccount: {
            connectionStatus: 'connected',
            accessToken: { not: '' },
          },
        },
        include: {
          whatsappAccount: true,
          user: true,
        },
      });

      if (phoneNumbers.length === 0) {
        logger.info('No connected WABAs found for quality rating sync');
        return;
      }

      logger.info(`Syncing quality ratings for ${phoneNumbers.length} phone numbers`);

      const results = {
        success: 0,
        failed: 0,
        ratingsDropped: 0,
        errors: [] as Array<{ wabaId: string; error: string }>,
      };

      for (const phone of phoneNumbers) {
        try {
          // Skip if no linked WhatsApp account
          if (!phone.whatsappAccount) {
            continue;
          }

          // Decrypt access token from WhatsApp account
          const accessToken = decryptAccountToken(phone.whatsappAccount);

          // Fetch quality rating from Meta
          const response = await axios.get(
            `https://graph.facebook.com/v23.0/${phone.phoneNumberId}`,
            {
              params: {
                fields: 'quality_rating,code_verification_status',
                access_token: accessToken,
              },
              timeout: 30000,
              httpsAgent,
            }
          );

          const rawRating = response.data.quality_rating as string;
          const qualityRating = metaRatingToEnum[rawRating];
          if (!qualityRating) {
            logger.warn(`Unknown quality rating "${rawRating}" for phone ${phone.phoneNumberId}, skipping`);
            continue;
          }

          // Get previous rating
          const previousRating = await prisma.qualityRating.findFirst({
            where: {
              userId: phone.userId,
              phoneNumberId: phone.phoneNumberId,
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          // Store new rating
          await prisma.qualityRating.create({
            data: {
              phoneNumberId: phone.phoneNumberId,
              rating: qualityRating,
              status: 'Connected',
              userId: phone.userId,
            },
          });

          // Check if rating dropped
          if (previousRating && previousRating.rating !== qualityRating) {
            const ratingOrder = { HIGH: 3, MEDIUM: 2, LOW: 1 };
            const oldRatingValue = ratingOrder[previousRating.rating];
            const newRatingValue = ratingOrder[qualityRating];

            if (newRatingValue < oldRatingValue) {
              logger.warn(
                `Quality rating dropped for phone ${phone.phoneNumberId}: ${previousRating.rating} -> ${qualityRating}`
              );
              results.ratingsDropped++;

              // Send email notification
              await emailService.sendQualityRatingDrop(
                phone.phoneNumberId,
                previousRating.rating,
                qualityRating,
                phone.user.name || 'User',
                phone.user.email
              );
            }
          }

          // Update last sync timestamp on the WhatsApp account
          await prisma.whatsAppAccount.update({
            where: { id: phone.whatsappAccount.id },
            data: {
              lastSyncAt: new Date(),
            },
          });

          results.success++;
          logger.info(`Quality rating synced for phone ${phone.phoneNumberId}: ${qualityRating}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Failed to sync quality rating for phone ${phone.phoneNumberId}: ${errorMessage}`);
          results.failed++;
          if (phone.whatsappAccount?.wabaId) {
            results.errors.push({ wabaId: phone.whatsappAccount.wabaId, error: errorMessage });
          }
        }
      }

      logger.info(
        `Quality rating sync completed: ${results.success} succeeded, ${results.failed} failed, ${results.ratingsDropped} ratings dropped`
      );
    } catch (error) {
      logger.error('Quality rating sync job error:', error);
    }
  });

  logger.info('Quality rating sync cron job scheduled (every 6 hours)');
}
