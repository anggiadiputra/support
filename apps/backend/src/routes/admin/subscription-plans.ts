/**
 * Admin Subscription Plans Routes
 * 
 * API endpoints for managing subscription plan configurations (FREE, LITE, PRO)
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { requireRole } from '../../middleware/auth.js';
import {
  adminSubscriptionPlansService,
  type PlanConfig,
  type PlanTier,
  type DurationConfig,
} from '../../services/admin/subscription-plans-service.js';

const app = new Hono();

// All routes require ADMIN role
app.use('/*', requireRole(['ADMIN']));

const VALID_TIERS: PlanTier[] = ['free', 'basic', 'lite', 'pro'];

/**
 * GET /api/v1/admin/subscription-plans
 * Get all subscription plans configuration
 */
app.get('/', async (c: Context) => {
  try {
    const plans = await adminSubscriptionPlansService.getPlans();

    return c.json({
      success: true,
      data: plans,
    });
  } catch (error) {
    console.error('Admin get subscription plans error:', error);
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch subscription plans',
      },
    }, 500);
  }
});

/**
 * PUT /api/v1/admin/subscription-plans/:tier
 * Update a specific plan configuration
 */
app.put('/:tier', async (c: Context) => {
  try {
    const tier = c.req.param('tier') as PlanTier;

    // Validate tier
    if (!VALID_TIERS.includes(tier)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Invalid plan tier: ${tier}. Valid tiers: ${VALID_TIERS.join(', ')}`,
        },
      }, 400);
    }

    const body = await c.req.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Request body must be an object',
        },
      }, 400);
    }

    // Validate required fields
    const config: PlanConfig = {
      name: body.name,
      description: body.description ?? '',
      price: body.price,
      features: body.features ?? [],
      durations: body.durations ?? [],
      enabled: body.enabled ?? true,
      isContactUs: body.isContactUs ?? false,
      contactUrl: body.contactUrl ?? '',
      channelLimits: body.channelLimits,
      numericLimits: body.numericLimits,
    };

    // Basic validation before service call
    if (!config.name || typeof config.name !== 'string' || config.name.trim() === '') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Nama paket tidak boleh kosong',
        },
      }, 400);
    }

    if (typeof config.price !== 'number' || isNaN(config.price)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Harga harus berupa angka',
        },
      }, 400);
    }

    if (tier !== 'free' && config.price <= 0) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Harga harus berupa angka positif',
        },
      }, 400);
    }

    if (!Array.isArray(config.features)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Features harus berupa array',
        },
      }, 400);
    }

    // Get admin user ID and IP
    const adminId = c.user?.id;
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found',
        },
      }, 401);
    }

    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';

    const result = await adminSubscriptionPlansService.updatePlan(
      tier,
      config,
      adminId,
      ipAddress
    );

    return c.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error('Admin update subscription plan error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update subscription plan';

    // Check if it's a validation error from the service
    if (message.includes('tidak boleh') || message.includes('harus')) {
      return c.json({
        error: {
          code: 'ValidationError',
          message,
        },
      }, 400);
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message,
      },
    }, 500);
  }
});

/**
 * PUT /api/v1/admin/subscription-plans/:tier/durations
 * Update duration configuration for a specific plan
 */
app.put('/:tier/durations', async (c: Context) => {
  try {
    const tier = c.req.param('tier') as PlanTier;

    // Validate tier - only paid tiers allowed
    if (tier === 'free') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Paket FREE tidak mendukung konfigurasi durasi',
        },
      }, 400);
    }

    if (!VALID_TIERS.includes(tier)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Invalid plan tier: ${tier}. Valid tiers: lite, pro`,
        },
      }, 400);
    }

    const body = await c.req.json();

    // Validate request body structure
    if (!body || typeof body !== 'object') {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Request body must be an object',
        },
      }, 400);
    }

    // Validate durations array exists
    if (!Array.isArray(body.durations)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Durations harus berupa array',
        },
      }, 400);
    }

    const durations: DurationConfig[] = body.durations;

    // Basic validation for each duration
    for (const duration of durations) {
      if (typeof duration.discountPercent !== 'number' ||
        duration.discountPercent < 0 ||
        duration.discountPercent > 100) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: 'Diskon harus berupa angka antara 0-100%',
          },
        }, 400);
      }
    }

    // Get admin user ID and IP
    const adminId = c.user?.id;
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found',
        },
      }, 401);
    }

    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
      || c.req.header('x-real-ip')
      || 'unknown';

    const result = await adminSubscriptionPlansService.updateDurationConfig(
      tier,
      durations,
      adminId,
      ipAddress
    );

    return c.json({
      success: result.success,
      message: result.message,
    });
  } catch (error) {
    console.error('Admin update duration config error:', error);
    const message = error instanceof Error ? error.message : 'Failed to update duration configuration';

    // Check if it's a validation error from the service
    if (message.includes('tidak') || message.includes('harus') || message.includes('Diskon')) {
      return c.json({
        error: {
          code: 'ValidationError',
          message,
        },
      }, 400);
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message,
      },
    }, 500);
  }
});

export default app;
