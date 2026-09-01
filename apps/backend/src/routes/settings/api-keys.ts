import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { apiKeyService } from '../../services/api-key-service.js';
import { logger } from '../../utils/logger.js';
import { requireFeature, checkUsageLimit } from '../../middleware/subscription.js';
import { handleValidationError } from '../../middleware/errorHandler.js';
import { auditLog } from '../../utils/auditLog.js';

const app = new Hono();

// Validation schema for creating API key
const createApiKeySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be 100 characters or less'),
  expiresInDays: z.number().int().min(1).max(365).optional(),
});

/**
 * POST /api/v1/settings/api-keys
 * Create a new API key
 * 
 * Requirements: 1.1 - Generate unique 256-bit cryptographically secure API key
 * Requirements: 2.1 - Feature gating for apiAccess
 * Requirements: 2.2 - Usage limit check for maxApiKeys
 */
app.post('/', requireFeature('apiAccess'), async (c: Context) => {
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
    const usageCheck = await checkUsageLimit(c.user.id, 'maxApiKeys');
    if (!usageCheck.allowed) {
      return c.json({
        error: {
          code: 'LimitExceeded',
          message: `You have reached the maximum number of API keys for your plan (${usageCheck.current}/${usageCheck.limit}).`,
          limit: usageCheck.limit,
          current: usageCheck.current,
          upgradeUrl: '/settings/billing',
        },
      }, 403);
    }

    const body = await c.req.json();
    const parseResult = createApiKeySchema.safeParse(body);

    if (!parseResult.success) {
      return handleValidationError(parseResult.error, c);
    }

    const { name, expiresInDays } = parseResult.data;

    const apiKey = await apiKeyService.createApiKey({
      userId: c.user.id,
      name,
      expiresInDays,
    });

    // Audit log
    await auditLog('API_KEY_CREATED', 'APIKey', apiKey.id, {
      name,
      keyPrefix: apiKey.keyPrefix,
      expiresAt: apiKey.expiresAt.toISOString()
    }, c.user.id);

    return c.json({
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        key: apiKey.key, // Full key only shown once
        keyPrefix: apiKey.keyPrefix,
        expiresAt: apiKey.expiresAt.toISOString(),
        createdAt: apiKey.createdAt.toISOString(),
      },
      message: 'API key created. Save this key securely - it will not be shown again.',
    });
  } catch (error: any) {
    logger.error('Create API key error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to create API key',
      },
    }, 500);
  }
});

/**
 * GET /api/v1/settings/api-keys
 * List all API keys for the authenticated user
 * 
 * Requirements: 1.3 - List API keys without revealing full key value
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

    const apiKeys = await apiKeyService.listApiKeys(c.user.id);

    return c.json({
      success: true,
      data: apiKeys.map((key) => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        expiresAt: key.expiresAt.toISOString(),
        createdAt: key.createdAt.toISOString(),
        lastUsedAt: key.lastUsedAt?.toISOString() || null,
      })),
    });
  } catch (error: any) {
    logger.error('List API keys error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to list API keys',
      },
    }, 500);
  }
});

/**
 * DELETE /api/v1/settings/api-keys/:id
 * Revoke an API key
 * 
 * Requirements: 1.4 - Immediately invalidate the key
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

    const apiKeyId = c.req.param('id');

    if (!apiKeyId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'API key ID is required',
        },
      }, 400);
    }

    await apiKeyService.revokeApiKey(c.user.id, apiKeyId);

    // Audit log
    await auditLog('API_KEY_REVOKED', 'APIKey', apiKeyId, {
      revokedBy: c.user.id
    }, c.user.id);

    return c.json({
      success: true,
      message: 'API key revoked successfully',
    });
  } catch (error: any) {
    logger.error('Revoke API key error:', error);

    // Handle not found error
    if (error.message?.includes('not found')) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'API key not found or already revoked',
        },
      }, 404);
    }

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to revoke API key',
      },
    }, 500);
  }
});

export default app;
