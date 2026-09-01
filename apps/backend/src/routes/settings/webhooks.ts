import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { webhookService, type WebhookEventType, type WebhookChannel } from '../../services/webhook-service.js';
import { logger } from '../../utils/logger.js';
import { requireFeature, checkUsageLimit } from '../../middleware/subscription.js';
import { handleValidationError } from '../../middleware/errorHandler.js';
import { auditLog } from '../../utils/auditLog.js';
import { prisma } from '../../utils/database.js';

const app = new Hono();

// Valid event types
const VALID_EVENT_TYPES: WebhookEventType[] = [
  'message.received',
  'message.sent',
  'message.delivered',
  'message.read',
  'message.failed',
];

// Valid channels
const VALID_CHANNELS: WebhookChannel[] = ['whatsapp', 'instagram', 'all'];

// Validation schema for creating webhook endpoint
const createWebhookSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  url: z.string().url('Invalid URL format'),
  events: z.array(z.enum(['message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed']))
    .min(1, 'At least one event type is required'),
  channels: z.array(z.enum(['whatsapp', 'instagram', 'all']))
    .min(1, 'At least one channel is required'),
  channelAccountIds: z.array(z.string()).optional().default([]),
});

// Validation schema for updating webhook endpoint
const updateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  url: z.string().url('Invalid URL format').optional(),
  events: z.array(z.enum(['message.received', 'message.sent', 'message.delivered', 'message.read', 'message.failed']))
    .min(1, 'At least one event type is required')
    .optional(),
  channels: z.array(z.enum(['whatsapp', 'instagram', 'all']))
    .min(1, 'At least one channel is required')
    .optional(),
  channelAccountIds: z.array(z.string()).optional(),
  isActive: z.boolean().optional(),
});

/**
 * Validate that channelAccountIds belong to the user
 * Checks across PhoneNumber, InstagramAccount, and FacebookPage tables
 * 
 * @param userId - The user ID to validate against
 * @param channelAccountIds - Array of channel account IDs to validate
 * @returns Object with isValid flag and invalidIds array
 */
async function validateChannelAccountIds(
  userId: string,
  channelAccountIds: string[]
): Promise<{ isValid: boolean; invalidIds: string[] }> {
  if (!channelAccountIds || channelAccountIds.length === 0) {
    return { isValid: true, invalidIds: [] };
  }

  // Query all user's channel accounts in parallel
  const [phoneNumbers, instagramAccounts, facebookPages] = await Promise.all([
    prisma.phoneNumber.findMany({
      where: { userId, id: { in: channelAccountIds } },
      select: { id: true },
    }),
    prisma.instagramAccount.findMany({
      where: { userId, id: { in: channelAccountIds } },
      select: { id: true },
    }),
    prisma.facebookPage.findMany({
      where: { userId, id: { in: channelAccountIds } },
      select: { id: true },
    }),
  ]);

  // Collect all valid IDs
  const validIds = new Set([
    ...phoneNumbers.map((p) => p.id),
    ...instagramAccounts.map((i) => i.id),
    ...facebookPages.map((f) => f.id),
  ]);

  // Find invalid IDs
  const invalidIds = channelAccountIds.filter((id) => !validIds.has(id));

  return {
    isValid: invalidIds.length === 0,
    invalidIds,
  };
}

/**
 * POST /api/v1/settings/webhooks
 * Create a new webhook endpoint
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5
 * Requirements: 3.1 - Feature gating for webhooksEnabled
 * Requirements: 3.2 - Usage limit check for maxWebhookEndpoints
 */
app.post('/', requireFeature('webhooksEnabled'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    // Check usage limit before creating
    const usageCheck = await checkUsageLimit(c.user.id, 'maxWebhookEndpoints');
    if (!usageCheck.allowed) {
      return c.json({
        error: {
          code: 'LimitExceeded',
          message: `You have reached the maximum number of webhook endpoints for your plan (${usageCheck.current}/${usageCheck.limit}).`,
          limit: usageCheck.limit,
          current: usageCheck.current,
          upgradeUrl: '/settings/billing',
        },
      }, 403);
    }

    const body = await c.req.json();
    const parseResult = createWebhookSchema.safeParse(body);

    if (!parseResult.success) {
      return handleValidationError(parseResult.error, c);
    }

    const { name, url, events, channels, channelAccountIds } = parseResult.data;

    // Validate channelAccountIds belong to user
    if (channelAccountIds && channelAccountIds.length > 0) {
      const validation = await validateChannelAccountIds(c.user.id, channelAccountIds);
      if (!validation.isValid) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Invalid channel account IDs provided',
            invalidIds: validation.invalidIds,
          },
        }, 400);
      }
    }

    const endpoint = await webhookService.createEndpoint({
      userId: c.user.id,
      name,
      url,
      events: events as WebhookEventType[],
      channels: channels as WebhookChannel[],
      channelAccountIds,
    });

    // Audit log
    await auditLog('WEBHOOK_ENDPOINT_CREATED', 'Webhook', endpoint.id, {
      name,
      url,
      events,
      channels,
      channelAccountIds,
    }, c.user.id);

    return c.json({
      success: true,
      data: {
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        secret: endpoint.secret, // Only shown once on creation
        events: endpoint.events,
        channels: endpoint.channels,
        channelAccountIds: endpoint.channelAccountIds,
        isActive: endpoint.isActive,
        createdAt: endpoint.createdAt.toISOString(),
      },
      message: 'Webhook endpoint created. Save the secret securely - it will not be shown again.',
    });
  } catch (error: any) {
    logger.error('Create webhook endpoint error:', error);

    // Handle max limit error
    if (error.message?.includes('Maximum limit')) {
      return c.json({
        error: {
          code: 'LimitExceeded',
          message: error.message,
        },
      }, 400);
    }

    // Handle URL validation error
    if (error.message?.includes('URL') || error.message?.includes('HTTPS')) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: error.message,
        },
      }, 400);
    }

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to create webhook endpoint',
      },
    }, 500);
  }
});

/**
 * GET /api/v1/settings/webhooks
 * List all webhook endpoints for the authenticated user
 * 
 * Requirements: 2.1
 */
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const endpoints = await webhookService.listEndpoints(c.user.id);

    return c.json({
      success: true,
      data: endpoints.map((endpoint) => ({
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        events: endpoint.events,
        channels: endpoint.channels,
        channelAccountIds: endpoint.channelAccountIds,
        isActive: endpoint.isActive,
        failureCount: endpoint.failureCount,
        lastFailedAt: endpoint.lastFailedAt?.toISOString() || null,
        disabledAt: endpoint.disabledAt?.toISOString() || null,
        disableReason: endpoint.disableReason,
        createdAt: endpoint.createdAt.toISOString(),
        updatedAt: endpoint.updatedAt.toISOString(),
      })),
    });
  } catch (error: any) {
    logger.error('List webhook endpoints error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to list webhook endpoints',
      },
    }, 500);
  }
});

/**
 * PUT /api/v1/settings/webhooks/:id
 * Update a webhook endpoint
 * 
 * Requirements: 2.2, 2.3, 2.4
 */
app.put('/:id', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const endpointId = c.req.param('id');

    if (!endpointId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Webhook endpoint ID is required',
        },
      }, 400);
    }

    const body = await c.req.json();
    const parseResult = updateWebhookSchema.safeParse(body);

    if (!parseResult.success) {
      return handleValidationError(parseResult.error, c);
    }

    const updateData = parseResult.data;

    // Validate channelAccountIds belong to user
    if (updateData.channelAccountIds && updateData.channelAccountIds.length > 0) {
      const validation = await validateChannelAccountIds(c.user.id, updateData.channelAccountIds);
      if (!validation.isValid) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Invalid channel account IDs provided',
            invalidIds: validation.invalidIds,
          },
        }, 400);
      }
    }

    const endpoint = await webhookService.updateEndpoint(
      c.user.id,
      endpointId,
      {
        name: updateData.name,
        url: updateData.url,
        events: updateData.events as WebhookEventType[] | undefined,
        channels: updateData.channels as WebhookChannel[] | undefined,
        channelAccountIds: updateData.channelAccountIds,
        isActive: updateData.isActive,
      }
    );

    // Audit log
    await auditLog('WEBHOOK_ENDPOINT_UPDATED', 'Webhook', endpointId, {
      updates: updateData
    }, c.user.id);

    return c.json({
      success: true,
      data: {
        id: endpoint.id,
        name: endpoint.name,
        url: endpoint.url,
        events: endpoint.events,
        channels: endpoint.channels,
        channelAccountIds: endpoint.channelAccountIds,
        isActive: endpoint.isActive,
        failureCount: endpoint.failureCount,
        lastFailedAt: endpoint.lastFailedAt?.toISOString() || null,
        disabledAt: endpoint.disabledAt?.toISOString() || null,
        disableReason: endpoint.disableReason,
        createdAt: endpoint.createdAt.toISOString(),
        updatedAt: endpoint.updatedAt.toISOString(),
      },
    });
  } catch (error: any) {
    logger.error('Update webhook endpoint error:', error);

    // Handle not found error
    if (error.message?.includes('not found')) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Webhook endpoint not found',
        },
      }, 404);
    }

    // Handle URL validation error
    if (error.message?.includes('URL') || error.message?.includes('HTTPS')) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: error.message,
        },
      }, 400);
    }

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to update webhook endpoint',
      },
    }, 500);
  }
});

/**
 * DELETE /api/v1/settings/webhooks/:id
 * Delete a webhook endpoint
 * 
 * Requirements: 2.1
 */
app.delete('/:id', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const endpointId = c.req.param('id');

    if (!endpointId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Webhook endpoint ID is required',
        },
      }, 400);
    }

    await webhookService.deleteEndpoint(c.user.id, endpointId);

    // Audit log
    await auditLog('WEBHOOK_ENDPOINT_DELETED', 'Webhook', endpointId, {
      deletedBy: c.user.id
    }, c.user.id);

    return c.json({
      success: true,
      message: 'Webhook endpoint deleted successfully',
    });
  } catch (error: any) {
    logger.error('Delete webhook endpoint error:', error);

    // Handle not found error
    if (error.message?.includes('not found')) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Webhook endpoint not found',
        },
      }, 404);
    }

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to delete webhook endpoint',
      },
    }, 500);
  }
});

/**
 * POST /api/v1/settings/webhooks/:id/test
 * Test a webhook endpoint by sending a test payload
 * 
 * Requirements: 2.6 - Send test payload and report response within 10 seconds
 */
app.post('/:id/test', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const endpointId = c.req.param('id');

    if (!endpointId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Webhook endpoint ID is required',
        },
      }, 400);
    }

    const result = await webhookService.testEndpoint(c.user.id, endpointId);

    return c.json({
      success: result.success,
      data: {
        statusCode: result.statusCode,
        latencyMs: result.latencyMs,
        error: result.error,
      },
      message: result.success
        ? 'Webhook test successful'
        : `Webhook test failed: ${result.error}`,
    });
  } catch (error: any) {
    logger.error('Test webhook endpoint error:', error);

    // Handle not found error
    if (error.message?.includes('not found')) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Webhook endpoint not found',
        },
      }, 404);
    }

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to test webhook endpoint',
      },
    }, 500);
  }
});

/**
 * GET /api/v1/settings/webhooks/:id/logs
 * Get delivery logs for a webhook endpoint
 * 
 * Requirements: 3.6 - Store delivery logs for 7 days
 */
app.get('/:id/logs', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const endpointId = c.req.param('id');
    const limitParam = c.req.query('limit');
    const limit = limitParam ? parseInt(limitParam, 10) : 50;

    if (!endpointId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Webhook endpoint ID is required',
        },
      }, 400);
    }

    if (isNaN(limit) || limit < 1 || limit > 100) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Limit must be between 1 and 100',
        },
      }, 400);
    }

    const logs = await webhookService.getDeliveryLogs(c.user.id, endpointId, limit);

    return c.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        eventId: log.eventId,
        eventType: log.eventType,
        responseStatus: log.responseStatus,
        latencyMs: log.latencyMs,
        attemptNumber: log.attemptNumber,
        status: log.status,
        errorMessage: log.errorMessage,
        createdAt: log.createdAt.toISOString(),
        nextRetryAt: log.nextRetryAt?.toISOString() || null,
      })),
    });
  } catch (error: any) {
    logger.error('Get webhook delivery logs error:', error);

    // Handle not found error
    if (error.message?.includes('not found')) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Webhook endpoint not found',
        },
      }, 404);
    }

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to get delivery logs',
      },
    }, 500);
  }
});

export default app;
