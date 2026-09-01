import { randomBytes, randomUUID } from 'crypto';
import { Agent } from 'undici';
import { prisma } from '../utils/database.js';
import { tokenEncryption } from '../utils/tokenEncryption.js';
import { webhookOutboundQueue, redisConnection } from '../utils/queue.js';
import { CtwaService } from './ctwa-service.js';

// Create agent that forces IPv4 (fixes ETIMEDOUT/fetch failed on some servers)
const ipv4Agent = new Agent({
  connect: {
    family: 4, // Force IPv4
  },
});

// Deduplication key prefix and TTL
const DEDUP_KEY_PREFIX = 'webhook:dedup:';
const DEDUP_TTL_SECONDS = 86400; // 24 hours - prevents re-emit for same message

// Webhook header prefix - configurable for white-label (default: KirimChat)
// Example: X-KirimChat-Signature, X-KirimChat-Event, etc.
const WEBHOOK_HEADER_PREFIX = process.env.WEBHOOK_HEADER_PREFIX || 'KirimChat';

/**
 * Webhook event types supported by the system
 */
export type WebhookEventType =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed';

/**
 * Channel types for webhook filtering
 */
export type WebhookChannel = 'whatsapp' | 'instagram' | 'messenger' | 'all';

/**
 * Input for creating a webhook endpoint
 */
export interface CreateWebhookEndpointInput {
  userId: string;
  name: string;
  url: string;
  events: WebhookEventType[];
  channels: WebhookChannel[];
  channelAccountIds?: string[]; // Optional, default [] means all accounts
}

/**
 * Input for updating a webhook endpoint
 */
export interface UpdateWebhookEndpointInput {
  name?: string;
  url?: string;
  events?: WebhookEventType[];
  channels?: WebhookChannel[];
  channelAccountIds?: string[];
  isActive?: boolean;
}

/**
 * Webhook endpoint response
 */
export interface WebhookEndpointResponse {
  id: string;
  name: string;
  url: string;
  events: string[];
  channels: string[];
  channelAccountIds: string[];
  isActive: boolean;
  failureCount: number;
  lastFailedAt: Date | null;
  disabledAt: Date | null;
  disableReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  secret?: string; // Only returned on creation
}

/**
 * Test endpoint result
 */
export interface TestEndpointResult {
  success: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
}

/**
 * Sanitized raw WhatsApp message (sensitive fields removed)
 */
export interface SanitizedWhatsAppRaw {
  id: string;
  from: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { caption?: string; mime_type?: string; sha256?: string };
  video?: { caption?: string; mime_type?: string; sha256?: string };
  audio?: { mime_type?: string; sha256?: string };
  document?: { caption?: string; filename?: string; mime_type?: string; sha256?: string };
  sticker?: { mime_type?: string; sha256?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: Array<{ name?: { formatted_name?: string }; phones?: Array<{ phone?: string }> }>;
  reaction?: { emoji?: string; message_id?: string };
  interactive?: { type?: string; button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  button?: { text?: string; payload?: string };
  context?: { from?: string; id?: string; referred_product?: unknown };
  referral?: unknown;
  errors?: Array<{ code?: number; title?: string; message?: string }>;
}

/**
 * Webhook payload structure (as per requirements 8.1, 8.2, 8.4)
 */
export interface WebhookPayload {
  event_type: WebhookEventType;
  event_id: string; // UUID for idempotency
  timestamp: string; // ISO 8601
  data: {
    message_id: string;
    customer_id: string;
    customer_phone?: string; // WhatsApp
    customer_username?: string; // Instagram
    direction: 'inbound' | 'outbound';
    message_type: string;
    content?: string;
    media_url?: string;
    channel: 'whatsapp' | 'instagram' | 'messenger';
    phone_number_id?: string; // WhatsApp phone number ID (internal)
    business_phone?: string; // Business phone number that received/sent the message
    raw?: SanitizedWhatsAppRaw; // Raw WhatsApp message (WhatsApp only, sensitive fields removed)
  };
}

/**
 * Webhook outbound job data for BullMQ
 */
export interface WebhookOutboundJobData {
  webhookEndpointId: string;
  eventId: string;
  eventType: WebhookEventType;
  payload: WebhookPayload;
  attempt: number;
  maxAttempts: number;
  idempotencyKey?: string; // Used by n8n to deduplicate events
}

// Maximum number of webhook endpoints per user
const MAX_ENDPOINTS_PER_USER = 3;

// Valid event types
const VALID_EVENT_TYPES: WebhookEventType[] = [
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
];

// Valid channels
const VALID_CHANNELS: WebhookChannel[] = ['whatsapp', 'instagram', 'messenger', 'all'];

// Test endpoint timeout (10 seconds as per requirements)
const TEST_ENDPOINT_TIMEOUT_MS = 10000;

/**
 * WebhookService
 * 
 * Handles webhook endpoint management including creation, updates, deletion,
 * and testing. Webhook secrets are encrypted using AES-256-GCM.
 */
export class WebhookService {
  /**
   * Generate a cryptographically secure webhook secret
   * Creates a 256-bit (32 bytes) random secret
   * 
   * @returns The webhook secret string (base64url encoded)
   */
  private generateSecret(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Validate URL format and ensure HTTPS for production
   * 
   * @param url - The URL to validate
   * @throws Error if URL is invalid
   */
  private validateUrl(url: string): void {
    try {
      const parsedUrl = new URL(url);

      // Require HTTPS in production
      if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
        throw new Error('Webhook URL must use HTTPS protocol in production');
      }

      // Allow HTTP only in development
      if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error('Webhook URL must use HTTP or HTTPS protocol');
      }
    } catch (error) {
      if (error instanceof TypeError) {
        throw new Error('Invalid URL format');
      }
      throw error;
    }
  }

  /**
   * Validate event types
   * 
   * @param events - Array of event types to validate
   * @throws Error if any event type is invalid
   */
  private validateEvents(events: WebhookEventType[]): void {
    if (!events || events.length === 0) {
      throw new Error('At least one event type must be specified');
    }

    for (const event of events) {
      if (!VALID_EVENT_TYPES.includes(event)) {
        throw new Error(`Invalid event type: ${event}`);
      }
    }
  }

  /**
   * Validate channels
   * 
   * @param channels - Array of channels to validate
   * @throws Error if any channel is invalid
   */
  private validateChannels(channels: WebhookChannel[]): void {
    if (!channels || channels.length === 0) {
      throw new Error('At least one channel must be specified');
    }

    for (const channel of channels) {
      if (!VALID_CHANNELS.includes(channel)) {
        throw new Error(`Invalid channel: ${channel}`);
      }
    }
  }

  /**
   * Create a new webhook endpoint
   * 
   * @param input - CreateWebhookEndpointInput
   * @returns WebhookEndpointResponse with the secret (only shown once)
   * @throws Error if user has reached maximum endpoint limit or validation fails
   */
  async createEndpoint(input: CreateWebhookEndpointInput): Promise<WebhookEndpointResponse> {
    const { userId, name, url, events, channels } = input;

    // Validate inputs
    this.validateUrl(url);
    this.validateEvents(events);
    this.validateChannels(channels);

    if (!name || name.trim().length === 0) {
      throw new Error('Webhook endpoint name is required');
    }

    // Check if user has reached the maximum limit
    const existingEndpointsCount = await prisma.webhookEndpoint.count({
      where: { userId },
    });

    if (existingEndpointsCount >= MAX_ENDPOINTS_PER_USER) {
      throw new Error(`Maximum limit of ${MAX_ENDPOINTS_PER_USER} webhook endpoints reached`);
    }

    // Generate and encrypt the webhook secret
    const plainSecret = this.generateSecret();
    const encryptedSecret = tokenEncryption.encrypt(plainSecret);

    // Create the webhook endpoint
    const endpoint = await prisma.webhookEndpoint.create({
      data: {
        userId,
        name: name.trim(),
        url,
        secret: encryptedSecret.ciphertext,
        secretIV: encryptedSecret.iv,
        secretTag: encryptedSecret.authTag,
        events,
        channels,
        channelAccountIds: input.channelAccountIds ?? [],
        isActive: true,
        failureCount: 0,
      },
    });

    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      channels: endpoint.channels,
      channelAccountIds: endpoint.channelAccountIds,
      isActive: endpoint.isActive,
      failureCount: endpoint.failureCount,
      lastFailedAt: endpoint.lastFailedAt,
      disabledAt: endpoint.disabledAt,
      disableReason: endpoint.disableReason,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
      secret: plainSecret, // Only returned on creation
    };
  }

  /**
   * Update an existing webhook endpoint
   * 
   * @param userId - The user ID (for authorization)
   * @param endpointId - The endpoint ID to update
   * @param input - UpdateWebhookEndpointInput
   * @returns Updated WebhookEndpointResponse
   * @throws Error if endpoint not found or validation fails
   */
  async updateEndpoint(
    userId: string,
    endpointId: string,
    input: UpdateWebhookEndpointInput
  ): Promise<WebhookEndpointResponse> {
    // Find the endpoint and verify ownership
    const existingEndpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        userId,
      },
    });

    if (!existingEndpoint) {
      throw new Error('Webhook endpoint not found');
    }

    // Validate inputs if provided
    if (input.url) {
      this.validateUrl(input.url);
    }

    if (input.events) {
      this.validateEvents(input.events);
    }

    if (input.channels) {
      this.validateChannels(input.channels);
    }

    if (input.name !== undefined && input.name.trim().length === 0) {
      throw new Error('Webhook endpoint name cannot be empty');
    }

    // Build update data
    const updateData: any = {};

    if (input.name !== undefined) {
      updateData.name = input.name.trim();
    }
    if (input.url !== undefined) {
      updateData.url = input.url;
    }
    if (input.events !== undefined) {
      updateData.events = input.events;
    }
    if (input.channels !== undefined) {
      updateData.channels = input.channels;
    }
    if (input.channelAccountIds !== undefined) {
      updateData.channelAccountIds = input.channelAccountIds;
    }
    if (input.isActive !== undefined) {
      updateData.isActive = input.isActive;
      // If re-enabling, reset failure count and clear disable info
      if (input.isActive) {
        updateData.failureCount = 0;
        updateData.disabledAt = null;
        updateData.disableReason = null;
      }
    }

    // Update the endpoint
    const endpoint = await prisma.webhookEndpoint.update({
      where: { id: endpointId },
      data: updateData,
    });

    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      channels: endpoint.channels,
      channelAccountIds: endpoint.channelAccountIds,
      isActive: endpoint.isActive,
      failureCount: endpoint.failureCount,
      lastFailedAt: endpoint.lastFailedAt,
      disabledAt: endpoint.disabledAt,
      disableReason: endpoint.disableReason,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    };
  }

  /**
   * Delete a webhook endpoint
   * 
   * @param userId - The user ID (for authorization)
   * @param endpointId - The endpoint ID to delete
   * @throws Error if endpoint not found
   */
  async deleteEndpoint(userId: string, endpointId: string): Promise<void> {
    // Find the endpoint and verify ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        userId,
      },
    });

    if (!endpoint) {
      throw new Error('Webhook endpoint not found');
    }

    // Delete the endpoint (cascade will delete delivery logs)
    await prisma.webhookEndpoint.delete({
      where: { id: endpointId },
    });
  }

  /**
   * List all webhook endpoints for a user
   * 
   * @param userId - The user ID
   * @returns Array of WebhookEndpointResponse
   */
  async listEndpoints(userId: string): Promise<WebhookEndpointResponse[]> {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return endpoints.map((endpoint) => ({
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      channels: endpoint.channels,
      channelAccountIds: endpoint.channelAccountIds,
      isActive: endpoint.isActive,
      failureCount: endpoint.failureCount,
      lastFailedAt: endpoint.lastFailedAt,
      disabledAt: endpoint.disabledAt,
      disableReason: endpoint.disableReason,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    }));
  }

  /**
   * Test a webhook endpoint by sending a test payload
   * 
   * @param userId - The user ID (for authorization)
   * @param endpointId - The endpoint ID to test
   * @returns TestEndpointResult with success status and details
   */
  async testEndpoint(userId: string, endpointId: string): Promise<TestEndpointResult> {
    // Find the endpoint and verify ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        userId,
      },
    });

    if (!endpoint) {
      throw new Error('Webhook endpoint not found');
    }

    // Decrypt the webhook secret
    const secret = tokenEncryption.decrypt({
      ciphertext: endpoint.secret,
      iv: endpoint.secretIV,
      authTag: endpoint.secretTag,
      algorithm: 'aes-256-gcm',
    });

    // Create test payload
    const testPayload = {
      event_type: 'test',
      event_id: `test_${Date.now()}`,
      timestamp: new Date().toISOString(),
      data: {
        message: `This is a test webhook from ${WEBHOOK_HEADER_PREFIX}`,
        endpoint_id: endpointId,
      },
    };

    // Calculate HMAC signature
    const { createHmac } = await import('crypto');
    const payloadString = JSON.stringify(testPayload);
    const signature = createHmac('sha256', secret)
      .update(payloadString)
      .digest('hex');

    const startTime = Date.now();

    try {
      // Send test request with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TEST_ENDPOINT_TIMEOUT_MS);

      const response = await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [`X-${WEBHOOK_HEADER_PREFIX}-Signature`]: signature,
          [`X-${WEBHOOK_HEADER_PREFIX}-Event`]: 'test',
        },
        body: payloadString,
        signal: controller.signal,
        // @ts-expect-error - dispatcher is valid for Node.js fetch with undici
        dispatcher: ipv4Agent,
      });

      clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;

      if (response.ok) {
        return {
          success: true,
          statusCode: response.status,
          latencyMs,
        };
      } else {
        return {
          success: false,
          statusCode: response.status,
          latencyMs,
          error: `Server returned status ${response.status}`,
        };
      }
    } catch (error) {
      const latencyMs = Date.now() - startTime;

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          return {
            success: false,
            latencyMs,
            error: 'Request timed out after 10 seconds',
          };
        }
        return {
          success: false,
          latencyMs,
          error: error.message,
        };
      }

      return {
        success: false,
        latencyMs,
        error: 'Unknown error occurred',
      };
    }
  }

  /**
   * Get delivery logs for a webhook endpoint
   * 
   * @param userId - The user ID (for authorization)
   * @param endpointId - The endpoint ID
   * @param limit - Maximum number of logs to return (default 50)
   * @returns Array of delivery logs
   */
  async getDeliveryLogs(
    userId: string,
    endpointId: string,
    limit: number = 50
  ): Promise<any[]> {
    // Verify endpoint ownership
    const endpoint = await prisma.webhookEndpoint.findFirst({
      where: {
        id: endpointId,
        userId,
      },
    });

    if (!endpoint) {
      throw new Error('Webhook endpoint not found');
    }

    const logs = await prisma.webhookDeliveryLog.findMany({
      where: { webhookEndpointId: endpointId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventId: true,
        eventType: true,
        responseStatus: true,
        latencyMs: true,
        attemptNumber: true,
        status: true,
        errorMessage: true,
        createdAt: true,
        nextRetryAt: true,
      },
    });

    return logs;
  }

  /**
   * Get the decrypted secret for a webhook endpoint (internal use)
   * 
   * @param endpointId - The endpoint ID
   * @returns The decrypted secret or null if not found
   */
  async getEndpointSecret(endpointId: string): Promise<string | null> {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
      select: {
        secret: true,
        secretIV: true,
        secretTag: true,
      },
    });

    if (!endpoint) {
      return null;
    }

    return tokenEncryption.decrypt({
      ciphertext: endpoint.secret,
      iv: endpoint.secretIV,
      authTag: endpoint.secretTag,
      algorithm: 'aes-256-gcm',
    });
  }

  /**
   * Get endpoint by ID (internal use for webhook delivery)
   * 
   * @param endpointId - The endpoint ID
   * @returns The endpoint or null if not found
   */
  async getEndpointById(endpointId: string): Promise<WebhookEndpointResponse | null> {
    const endpoint = await prisma.webhookEndpoint.findUnique({
      where: { id: endpointId },
    });

    if (!endpoint) {
      return null;
    }

    return {
      id: endpoint.id,
      name: endpoint.name,
      url: endpoint.url,
      events: endpoint.events,
      channels: endpoint.channels,
      channelAccountIds: endpoint.channelAccountIds,
      isActive: endpoint.isActive,
      failureCount: endpoint.failureCount,
      lastFailedAt: endpoint.lastFailedAt,
      disabledAt: endpoint.disabledAt,
      disableReason: endpoint.disableReason,
      createdAt: endpoint.createdAt,
      updatedAt: endpoint.updatedAt,
    };
  }

  /**
   * Sanitize raw WhatsApp message by removing sensitive fields
   * Removes: media IDs (can be used to download), internal WhatsApp IDs
   * Keeps: message structure, content, metadata useful for integrations
   */
  private sanitizeWhatsAppRaw(raw: any): SanitizedWhatsAppRaw | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const sanitized: SanitizedWhatsAppRaw = {
      id: raw.id,
      from: raw.from,
      timestamp: raw.timestamp,
      type: raw.type,
    };

    // Copy text content
    if (raw.text?.body) {
      sanitized.text = { body: raw.text.body };
    }

    // Copy media metadata (without media ID which can be used for unauthorized downloads)
    if (raw.image) {
      sanitized.image = {
        caption: raw.image.caption,
        mime_type: raw.image.mime_type,
        sha256: raw.image.sha256,
      };
    }
    if (raw.video) {
      sanitized.video = {
        caption: raw.video.caption,
        mime_type: raw.video.mime_type,
        sha256: raw.video.sha256,
      };
    }
    if (raw.audio) {
      sanitized.audio = {
        mime_type: raw.audio.mime_type,
        sha256: raw.audio.sha256,
      };
    }
    if (raw.document) {
      sanitized.document = {
        caption: raw.document.caption,
        filename: raw.document.filename,
        mime_type: raw.document.mime_type,
        sha256: raw.document.sha256,
      };
    }
    if (raw.sticker) {
      sanitized.sticker = {
        mime_type: raw.sticker.mime_type,
        sha256: raw.sticker.sha256,
      };
    }

    // Copy location data
    if (raw.location) {
      sanitized.location = {
        latitude: raw.location.latitude,
        longitude: raw.location.longitude,
        name: raw.location.name,
        address: raw.location.address,
      };
    }

    // Copy contacts (sanitized)
    if (raw.contacts && Array.isArray(raw.contacts)) {
      sanitized.contacts = raw.contacts.map((c: any) => ({
        name: c.name ? { formatted_name: c.name.formatted_name } : undefined,
        phones: c.phones?.map((p: any) => ({ phone: p.phone })),
      }));
    }

    // Copy reaction data
    if (raw.reaction) {
      sanitized.reaction = {
        emoji: raw.reaction.emoji,
        message_id: raw.reaction.message_id,
      };
    }

    // Copy interactive response data
    if (raw.interactive) {
      sanitized.interactive = {
        type: raw.interactive.type,
        button_reply: raw.interactive.button_reply ? {
          id: raw.interactive.button_reply.id,
          title: raw.interactive.button_reply.title,
        } : undefined,
        list_reply: raw.interactive.list_reply ? {
          id: raw.interactive.list_reply.id,
          title: raw.interactive.list_reply.title,
        } : undefined,
      };
    }

    // Copy button response
    if (raw.button) {
      sanitized.button = {
        text: raw.button.text,
        payload: raw.button.payload,
      };
    }

    // Copy context (reply info) - exclude sensitive fields
    if (raw.context) {
      sanitized.context = {
        from: raw.context.from,
        id: raw.context.id,
        referred_product: raw.context.referred_product,
      };
    }

    // Copy referral data (for ads click-to-whatsapp)
    if (raw.referral) {
      const parsed = CtwaService.parseReferral(raw.referral);
      sanitized.referral = parsed ? CtwaService.sanitizeReferral(parsed) : raw.referral;
    }

    // Copy error information if present
    if (raw.errors && Array.isArray(raw.errors)) {
      sanitized.errors = raw.errors.map((e: any) => ({
        code: e.code,
        title: e.title,
        message: e.message,
      }));
    }

    return sanitized;
  }

  /**
   * Emit a webhook event to all matching endpoints for a user
   * Queues webhook delivery jobs to BullMQ within 100ms (Requirement 3.1)
   * 
   * DEDUPLICATION: Uses Redis SET with NX to prevent duplicate emissions
   * for the same message_id + event_type combination within 24 hours.
   * 
   * @param userId - The user ID
   * @param eventType - The type of event
   * @param channel - The channel (whatsapp, instagram, or messenger)
   * @param channelAccountId - The channel account ID (WhatsApp account, Instagram account, etc.)
   * @param data - The event data
   * @param rawWhatsApp - Optional raw WhatsApp message (only for WhatsApp channel)
   */
  async emitEvent(
    userId: string,
    eventType: WebhookEventType,
    channel: 'whatsapp' | 'instagram' | 'messenger',
    channelAccountId: string,
    data: {
      message_id: string;
      customer_id: string;
      customer_phone?: string;
      customer_username?: string;
      direction: 'inbound' | 'outbound';
      message_type: string;
      content?: string;
      media_url?: string;
      phone_number_id?: string; // WhatsApp phone number ID (internal)
      business_phone?: string; // Business phone number that received/sent the message
    },
    rawWhatsApp?: any
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // DEDUPLICATION CHECK: Prevent duplicate webhook emissions for same message+event
      // Key format: webhook:dedup:{userId}:{eventType}:{message_id}
      const dedupKey = `${DEDUP_KEY_PREFIX}${userId}:${eventType}:${data.message_id}`;
      
      // Try to set the key with NX (only if not exists) and EX (expiry)
      const wasSet = await redisConnection.set(dedupKey, Date.now().toString(), 'EX', DEDUP_TTL_SECONDS, 'NX');
      
      if (!wasSet) {
        // Key already exists - this is a duplicate emission
        console.log(`[Webhook Service] ⚠️ DUPLICATE PREVENTED: Event ${eventType} for message ${data.message_id} already emitted`);
        return;
      }

      console.log(`[Webhook Service] 🔔 emitEvent called:`);
      console.log(`  - userId: ${userId}`);
      console.log(`  - eventType: ${eventType}`);
      console.log(`  - channel: ${channel}`);
      console.log(`  - channelAccountId: ${channelAccountId}`);
      console.log(`  - message_id: ${data.message_id}`);

      // Find all active endpoints for this user that match the event type, channel, and account
      const endpoints = await prisma.webhookEndpoint.findMany({
        where: {
          userId,
          isActive: true,
          events: {
            has: eventType,
          },
          AND: [
            // Channel filter
            {
              OR: [
                { channels: { has: channel } },
                { channels: { has: 'all' } },
              ],
            },
            // Account filter: empty array means all accounts, otherwise must match
            {
              OR: [
                { channelAccountIds: { isEmpty: true } },
                { channelAccountIds: { has: channelAccountId } },
              ],
            },
          ],
        },
        select: {
          id: true,
        },
      });

      console.log(`[Webhook Service] 📊 Found ${endpoints.length} matching endpoint(s)`);

      if (endpoints.length === 0) {
        console.log(`[Webhook Service] ⚠️ No matching endpoints found for userId: ${userId}, event: ${eventType}, channel: ${channel}`);
        // Remove the dedup key since no webhook was actually queued
        await redisConnection.del(dedupKey);
        return;
      }

      console.log(`[Webhook Service] ✅ Queueing webhooks for ${endpoints.length} endpoint(s)...`);

      // Generate unique event_id (UUID) for idempotency (Requirement 8.3)
      // Include message_id to create stable idempotency key for n8n
      const eventId = randomUUID();
      
      // Create idempotency key that n8n can use to deduplicate
      // Format: {message_id}_{event_type}_{timestamp_minute}
      // Using minute granularity to handle slight timing differences
      const idempotencyKey = `${data.message_id}_${eventType}_${Math.floor(Date.now() / 60000)}`;

      // Create the webhook payload (Requirements 8.1, 8.2, 8.4)
      // Include sanitized raw WhatsApp data if available (WhatsApp channel only)
      const sanitizedRaw = channel === 'whatsapp' && rawWhatsApp 
        ? this.sanitizeWhatsAppRaw(rawWhatsApp) 
        : undefined;

      const payload: WebhookPayload = {
        event_type: eventType,
        event_id: eventId,
        timestamp: new Date().toISOString(),
        data: {
          message_id: data.message_id,
          customer_id: data.customer_id,
          customer_phone: data.customer_phone,
          customer_username: data.customer_username,
          direction: data.direction,
          message_type: data.message_type,
          content: data.content,
          media_url: data.media_url,
          channel,
          phone_number_id: data.phone_number_id,
          business_phone: data.business_phone,
          raw: sanitizedRaw,
        },
      };

      // Queue jobs for each matching endpoint
      const jobPromises = endpoints.map((endpoint) => {
        const jobData: WebhookOutboundJobData = {
          webhookEndpointId: endpoint.id,
          eventId: `${eventId}_${endpoint.id}`, // Unique per endpoint
          eventType,
          payload,
          attempt: 1,
          maxAttempts: 5, // Initial + 4 retries
          idempotencyKey, // Add idempotency key for n8n
        };

        return webhookOutboundQueue.add(
          `webhook-${eventType}-${endpoint.id}`,
          jobData,
          {
            jobId: `${eventId}_${endpoint.id}`,
            removeOnComplete: true,
            removeOnFail: false,
          }
        );
      });

      // Queue all jobs in parallel
      await Promise.all(jobPromises);

      const elapsed = Date.now() - startTime;
      console.log(`[Webhook Service] ✅ Successfully queued ${endpoints.length} webhook job(s) in ${elapsed}ms`);

      if (elapsed > 100) {
        console.warn(`⚠️ Webhook event queuing took ${elapsed}ms (target: <100ms)`);
      }
    } catch (error) {
      console.error('❌ [Webhook Service] Error emitting webhook event:', error);
      console.error('   Error details:', {
        userId,
        eventType,
        channel,
        message_id: data.message_id,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Don't throw - webhook emission should not block the main flow
    }
  }

  /**
   * Get active endpoints for a user matching event type and channel
   * (Used by webhook worker for filtering)
   * 
   * @param userId - The user ID
   * @param eventType - The event type to filter
   * @param channel - The channel to filter
   * @returns Array of matching endpoint IDs
   */
  async getMatchingEndpoints(
    userId: string,
    eventType: WebhookEventType,
    channel: 'whatsapp' | 'instagram' | 'messenger'
  ): Promise<string[]> {
    const endpoints = await prisma.webhookEndpoint.findMany({
      where: {
        userId,
        isActive: true,
        events: {
          has: eventType,
        },
        OR: [
          { channels: { has: channel } },
          { channels: { has: 'all' } },
        ],
      },
      select: {
        id: true,
      },
    });

    return endpoints.map((e) => e.id);
  }
}

// Export singleton instance
export const webhookService = new WebhookService();
