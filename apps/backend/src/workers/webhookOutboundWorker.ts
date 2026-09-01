import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { Agent } from 'undici';
import { createHmac } from 'crypto';
import { prisma } from '../utils/database.js';
import { tokenEncryption } from '../utils/tokenEncryption.js';
import { QUEUE_NAMES } from '../utils/queue.js';
import { emailService } from '../services/email/index.js';
import type { WebhookOutboundJobData, WebhookPayload } from '../services/webhook-service.js';

// Create agent that forces IPv4 (fixes ETIMEDOUT/fetch failed on some servers)
const ipv4Agent = new Agent({
  connect: {
    family: 4, // Force IPv4
  },
});

// Redis connection for worker
const redisConnection = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  family: 4,
});

// Retry delays in seconds: 1min, 5min, 30min, 2hr (Requirement 3.3)
const RETRY_DELAYS_SECONDS = [60, 300, 1800, 7200];

// Webhook request timeout: 30 seconds (Requirement 3.5)
const WEBHOOK_TIMEOUT_MS = 30000;

// Max consecutive failures before auto-disable (Requirement 3.4)
const MAX_CONSECUTIVE_FAILURES = 10;

// Webhook header prefix - configurable for white-label (default: KirimChat)
// Example: X-KirimChat-Signature, X-KirimChat-Event, etc.
const WEBHOOK_HEADER_PREFIX = process.env.WEBHOOK_HEADER_PREFIX || 'KirimChat';

/**
 * Calculate HMAC-SHA256 signature for webhook payload
 * Uses the webhook secret to sign the payload (Requirement 3.2)
 * 
 * @param payload - The JSON payload string
 * @param secret - The webhook secret
 * @returns The HMAC-SHA256 signature as hex string
 */
function calculateSignature(payload: string, secret: string): string {
  return createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
}




/**
 * Create or update delivery log entry
 * 
 * @param data - Delivery log data
 */
async function createDeliveryLog(data: {
  webhookEndpointId: string;
  eventId: string;
  eventType: string;
  payload: WebhookPayload;
  status: 'pending' | 'success' | 'failed' | 'retrying';
  attemptNumber: number;
  responseStatus?: number;
  responseBody?: string;
  latencyMs?: number;
  errorMessage?: string;
  nextRetryAt?: Date;
}): Promise<void> {
  const requestHeaders = {
    'Content-Type': 'application/json',
    [`X-${WEBHOOK_HEADER_PREFIX}-Signature`]: '[calculated]',
    [`X-${WEBHOOK_HEADER_PREFIX}-Event`]: data.eventType,
  };

  // Encrypt sensitive data before storing (SECURITY)
  const encryptedPayload = tokenEncryption.encrypt(JSON.stringify(data.payload));
  const encryptedResponse = data.responseBody
    ? tokenEncryption.encrypt(typeof data.responseBody === 'string'
        ? data.responseBody
        : JSON.stringify(data.responseBody))
    : null;

  await prisma.webhookDeliveryLog.upsert({
    where: { eventId: data.eventId },
    create: {
      webhookEndpointId: data.webhookEndpointId,
      eventId: data.eventId,
      eventType: data.eventType,
      requestPayload: {
        ciphertext: encryptedPayload.ciphertext,
        iv: encryptedPayload.iv,
        authTag: encryptedPayload.authTag,
      } as any,
      requestHeaders: requestHeaders as any,
      responseStatus: data.responseStatus,
      responseBody: encryptedResponse ? JSON.stringify({
        ciphertext: encryptedResponse.ciphertext,
        iv: encryptedResponse.iv,
        authTag: encryptedResponse.authTag,
      }) : null,
      latencyMs: data.latencyMs,
      attemptNumber: data.attemptNumber,
      status: data.status,
      errorMessage: data.errorMessage,
      nextRetryAt: data.nextRetryAt,
    },
    update: {
      responseStatus: data.responseStatus,
      responseBody: encryptedResponse ? JSON.stringify({
        ciphertext: encryptedResponse.ciphertext,
        iv: encryptedResponse.iv,
        authTag: encryptedResponse.authTag,
      }) : null,
      latencyMs: data.latencyMs,
      attemptNumber: data.attemptNumber,
      status: data.status,
      errorMessage: data.errorMessage,
      nextRetryAt: data.nextRetryAt,
    },
  });
}

/**
 * Increment failure count and check if endpoint should be disabled
 * 
 * @param endpointId - The webhook endpoint ID
 * @returns true if endpoint was disabled
 */
async function incrementFailureAndCheckDisable(endpointId: string): Promise<boolean> {
  const endpoint = await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: {
      failureCount: { increment: 1 },
      lastFailedAt: new Date(),
    },
    include: {
      user: {
        select: {
          email: true,
          name: true,
        },
      },
    },
  });

  // Check if we've reached the threshold for auto-disable (Requirement 3.4)
  if (endpoint.failureCount >= MAX_CONSECUTIVE_FAILURES && endpoint.isActive) {
    await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: {
        isActive: false,
        disabledAt: new Date(),
        disableReason: `Auto-disabled after ${MAX_CONSECUTIVE_FAILURES} consecutive delivery failures`,
      },
    });

    // Send email notification to user
    await emailService.sendWebhookEndpointDisabled(
      endpoint.name,
      endpoint.url,
      endpoint.user.name || 'User',
      endpoint.user.email
    );

    console.log(`⚠️ Webhook endpoint ${endpointId} auto-disabled after ${MAX_CONSECUTIVE_FAILURES} failures`);
    return true;
  }

  return false;
}

/**
 * Reset failure count on successful delivery
 * 
 * @param endpointId - The webhook endpoint ID
 */
async function resetFailureCount(endpointId: string): Promise<void> {
  await prisma.webhookEndpoint.update({
    where: { id: endpointId },
    data: {
      failureCount: 0,
    },
  });
}


/**
 * Process webhook delivery job
 * 
 * @param job - The BullMQ job containing webhook delivery data
 */
async function processWebhookDelivery(job: Job<WebhookOutboundJobData>): Promise<void> {
  const { webhookEndpointId, eventId, eventType, payload, maxAttempts, idempotencyKey } = job.data;
  
  // Use BullMQ's attemptsMade + 1 for current attempt number (0-indexed)
  const currentAttempt = job.attemptsMade + 1;

  console.log(`📤 Processing webhook delivery: ${eventId} (attempt ${currentAttempt}/${maxAttempts})`);

  // Get endpoint details
  const endpoint = await prisma.webhookEndpoint.findUnique({
    where: { id: webhookEndpointId },
    select: {
      id: true,
      url: true,
      isActive: true,
      secret: true,
      secretIV: true,
      secretTag: true,
    },
  });

  if (!endpoint) {
    // Endpoint was deleted - skip delivery without creating log
    // (can't create delivery log due to foreign key constraint)
    console.warn(`⏭️ Skipping webhook delivery - endpoint ${webhookEndpointId} was deleted`);
    return;
  }

  // Skip if endpoint is disabled
  if (!endpoint.isActive) {
    console.log(`⏭️ Skipping webhook delivery - endpoint ${webhookEndpointId} is disabled`);
    await createDeliveryLog({
      webhookEndpointId,
      eventId,
      eventType,
      payload,
      status: 'failed',
      attemptNumber: currentAttempt,
      errorMessage: 'Webhook endpoint is disabled',
    });
    return;
  }

  // Decrypt the webhook secret
  const secret = tokenEncryption.decrypt({
    ciphertext: endpoint.secret,
    iv: endpoint.secretIV,
    authTag: endpoint.secretTag,
    algorithm: 'aes-256-gcm',
  });

  // Prepare payload and calculate signature (Requirement 3.2)
  const payloadString = JSON.stringify(payload);
  const signature = calculateSignature(payloadString, secret);

  const startTime = Date.now();
  let responseStatus: number | undefined;
  let responseBody: string | undefined;
  let errorMessage: string | undefined;

  try {
    // Send HTTP POST with 30 second timeout (Requirement 3.5)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [`X-${WEBHOOK_HEADER_PREFIX}-Signature`]: signature,
        [`X-${WEBHOOK_HEADER_PREFIX}-Event`]: eventType,
        [`X-${WEBHOOK_HEADER_PREFIX}-Delivery`]: eventId,
        // Idempotency key for n8n to deduplicate events
        // Format: {message_id}_{event_type}_{timestamp_minute}
        ...(idempotencyKey && { [`X-${WEBHOOK_HEADER_PREFIX}-Idempotency-Key`]: idempotencyKey }),
      },
      body: payloadString,
      signal: controller.signal,
      // @ts-expect-error - dispatcher is valid for Node.js fetch with undici
      dispatcher: ipv4Agent,
    });

    clearTimeout(timeoutId);

    const latencyMs = Date.now() - startTime;
    responseStatus = response.status;

    // Try to get response body (limit to 1KB)
    try {
      const text = await response.text();
      responseBody = text.substring(0, 1024);
    } catch {
      responseBody = undefined;
    }

    // Check if successful (2xx status)
    if (response.ok) {
      console.log(`✅ Webhook delivered successfully: ${eventId} (${latencyMs}ms)`);
      
      // Log successful delivery (Requirement 3.6)
      await createDeliveryLog({
        webhookEndpointId,
        eventId,
        eventType,
        payload,
        status: 'success',
        attemptNumber: currentAttempt,
        responseStatus,
        responseBody,
        latencyMs,
      });

      // Reset failure count on success
      await resetFailureCount(webhookEndpointId);
      return;
    }

    // Non-2xx response - treat as failure
    errorMessage = `Server returned status ${responseStatus}`;
    console.warn(`⚠️ Webhook delivery failed: ${eventId} - ${errorMessage}`);

  } catch (error) {
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        errorMessage = `Request timed out after ${WEBHOOK_TIMEOUT_MS / 1000} seconds`;
      } else {
        errorMessage = error.message;
      }
    } else {
      errorMessage = 'Unknown error occurred';
    }

    console.error(`❌ Webhook delivery error: ${eventId} - ${errorMessage}`);
  }

  // Handle failure - check if we should retry (Requirement 3.3)
  const latencyMs = Date.now() - startTime;
  const shouldRetry = currentAttempt < maxAttempts;

  if (shouldRetry) {
    // Calculate next retry delay based on current attempt
    // Retry delays: 1min, 5min, 30min, 2hr (Requirement 3.3)
    const retryDelayIndex = Math.min(currentAttempt - 1, RETRY_DELAYS_SECONDS.length - 1);
    const retryDelaySeconds = RETRY_DELAYS_SECONDS[retryDelayIndex];
    const nextRetryAt = new Date(Date.now() + retryDelaySeconds * 1000);

    // Log retry status with next retry time
    await createDeliveryLog({
      webhookEndpointId,
      eventId,
      eventType,
      payload,
      status: 'retrying',
      attemptNumber: currentAttempt,
      responseStatus,
      responseBody,
      latencyMs,
      errorMessage,
      nextRetryAt,
    });

    // Increment failure count on endpoint
    await incrementFailureAndCheckDisable(webhookEndpointId);

    // Throw error to trigger BullMQ retry
    // BullMQ will use the backoffStrategy to determine delay
    throw new Error(errorMessage);
  } else {
    // Max retries reached - mark as permanently failed
    await createDeliveryLog({
      webhookEndpointId,
      eventId,
      eventType,
      payload,
      status: 'failed',
      attemptNumber: currentAttempt,
      responseStatus,
      responseBody,
      latencyMs,
      errorMessage,
    });

    // Increment failure count and potentially disable endpoint
    await incrementFailureAndCheckDisable(webhookEndpointId);

    console.error(`❌ Webhook delivery permanently failed after ${maxAttempts} attempts: ${eventId}`);
  }
}


/**
 * Custom backoff strategy for webhook retries
 * Returns delay in milliseconds based on attempt number
 * Retry delays: 1min, 5min, 30min, 2hr (Requirement 3.3)
 */
function getBackoffDelay(attemptsMade: number): number {
  const delayIndex = Math.min(attemptsMade - 1, RETRY_DELAYS_SECONDS.length - 1);
  return RETRY_DELAYS_SECONDS[delayIndex] * 1000;
}

// Create webhook outbound worker
export const webhookOutboundWorker = new Worker<WebhookOutboundJobData>(
  QUEUE_NAMES.WEBHOOK_OUTBOUND,
  processWebhookDelivery,
  {
    connection: redisConnection,
    concurrency: 20, // Process up to 20 webhook deliveries concurrently
    limiter: {
      max: 200, // Max 200 jobs
      duration: 1000, // Per second
    },
    settings: {
      backoffStrategy: getBackoffDelay,
    },
  }
);

// Worker event handlers
webhookOutboundWorker.on('completed', (job) => {
  console.log(`✅ Webhook outbound worker completed job ${job.id}`);
});

webhookOutboundWorker.on('failed', (job, err) => {
  if (job) {
    const { maxAttempts } = job.data;
    const currentAttempt = job.attemptsMade;
    if (currentAttempt < maxAttempts) {
      const nextDelay = RETRY_DELAYS_SECONDS[Math.min(currentAttempt - 1, RETRY_DELAYS_SECONDS.length - 1)];
      console.log(`🔄 Webhook delivery will retry: ${job.id} (attempt ${currentAttempt}/${maxAttempts}, next retry in ${nextDelay}s)`);
    } else {
      console.error(`❌ Webhook outbound worker failed job ${job.id}:`, err.message);
    }
  } else {
    console.error('❌ Webhook outbound worker failed job (unknown):', err.message);
  }
});

webhookOutboundWorker.on('error', (err) => {
  console.error('❌ Webhook outbound worker error:', err);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('📦 Closing webhook outbound worker...');
  await webhookOutboundWorker.close();
  await redisConnection.quit();
  console.log('✅ Webhook outbound worker closed');
});

console.log('🚀 Webhook outbound worker started');

export { processWebhookDelivery, calculateSignature, getBackoffDelay };
