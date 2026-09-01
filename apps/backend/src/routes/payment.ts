/**
 * Payment Routes
 * 
 * API endpoints for payment transactions using multi-payment gateway system.
 * Handles payment creation, status checking, history, cancellation, and provider health monitoring.
 * 
 * Requirements: 2.1, 2.3, 2.6, 4.5, 5.1-5.5, 8.1-8.5, 9.1-9.3, 10.4
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { paymentService, isValidDurationMonths } from '../services/payment-service.js';
import { adminSubscriptionPlansService } from '../services/admin/subscription-plans-service.js';
import { paymentGatewayManager, ProviderNotFoundError } from '../services/payment/index.js';
import { prorateCalculationService } from '../services/prorate-calculation-service.js';
import { logger } from '../utils/logger.js';

const app = new Hono();

// =============================================================================
// POST /api/v1/payment/create
// Create new payment transaction
// Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
// =============================================================================

app.post('/create', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const body = await c.req.json();
    const { targetTier, durationMonths = 1, paymentMethod = 'QRIS', locale = 'en' } = body;

    // Validate target tier
    if (!targetTier || !['BASIC', 'LITE', 'PRO'].includes(targetTier)) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Invalid target tier. Must be BASIC, LITE or PRO' },
      }, 400);
    }

    // Validate durationMonths (must be 1, 3, 6, or 12)
    if (!isValidDurationMonths(durationMonths)) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Invalid duration. Must be 1, 3, 6, or 12 months' },
      }, 400);
    }

    // Validate payment method
    const validPaymentMethods = ['QRIS', 'VA_BCA', 'VA_BNI', 'VA_MANDIRI', 'VA_PERMATA'];
    if (!validPaymentMethods.includes(paymentMethod)) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Invalid payment method. Must be QRIS or VA_BCA/BNI/MANDIRI/PERMATA' },
      }, 400);
    }

    const result = await paymentService.createPayment({
      userId: c.user.id,
      targetTier,
      durationMonths,
      paymentMethod,
      locale,
    });

    if (!result.success) {
      return c.json({
        error: { code: result.errorCode || 'PaymentError', message: result.error },
      }, 400);
    }

    return c.json({
      success: true,
      data: {
        orderId: result.orderId,
        qrString: result.qrString,
        qrUrl: result.qrUrl,
        vaNumber: result.vaNumber,
        paymentUrl: result.paymentUrl,
        amount: result.amount,
        expiresAt: result.expiresAt?.toISOString(),
        providerId: result.providerId,
      },
    });
  } catch (error) {
    logger.error('Payment create error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to create payment' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/status/:orderId
// Get transaction status for polling
// Requirements: 9.1, 9.2, 9.3
// =============================================================================

app.get('/status/:orderId', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const orderId = c.req.param('orderId');

    if (!orderId) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Order ID is required' },
      }, 400);
    }

    const status = await paymentService.getTransactionStatus(orderId, c.user.id);

    if (!status) {
      return c.json({
        error: { code: 'NotFound', message: 'Transaction not found' },
      }, 404);
    }

    return c.json({
      success: true,
      data: {
        status: status.status,
        paidAt: status.paidAt?.toISOString() || null,
        amount: status.amount,
        targetTier: status.targetTier,
      },
    });
  } catch (error) {
    logger.error('Payment status error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get payment status' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/history
// Get payment history with pagination
// Requirements: 8.1, 8.2, 8.3, 8.4
// =============================================================================

app.get('/history', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = parseInt(c.req.query('limit') || '10', 10);

    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 50); // Max 50 per page

    const result = await paymentService.getPaymentHistory(c.user.id, validPage, validLimit);

    return c.json({
      success: true,
      data: {
        transactions: result.transactions.map((tx) => ({
          id: tx.id,
          orderId: tx.orderId,
          amount: tx.amount,
          paymentMethod: tx.paymentMethod,
          targetTier: tx.targetTier,
          status: tx.status,
          createdAt: tx.createdAt.toISOString(),
          paidAt: tx.paidAt?.toISOString() || null,
        })),
        pagination: {
          total: result.total,
          page: result.page,
          limit: result.limit,
          totalPages: Math.ceil(result.total / result.limit),
        },
      },
    });
  } catch (error) {
    logger.error('Payment history error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get payment history' },
    }, 500);
  }
});

// =============================================================================
// POST /api/v1/payment/cancel/:orderId
// Cancel pending transaction
// Requirements: 4.5
// =============================================================================

app.post('/cancel/:orderId', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const orderId = c.req.param('orderId');

    if (!orderId) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Order ID is required' },
      }, 400);
    }

    const result = await paymentService.cancelTransaction(orderId, c.user.id);

    if (!result.success) {
      return c.json({
        error: { code: 'CancelError', message: result.message },
      }, 400);
    }

    return c.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error('Payment cancel error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to cancel payment' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/pricing
// Get subscription pricing with all duration options
// Requirements: 1.2, 1.3, 1.5, 2.1, 2.3, 2.6
// =============================================================================

app.get('/pricing', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    // Get pricing with all duration options from subscription plans service
    const { basic, lite, pro } = await adminSubscriptionPlansService.getAllPlansPricing();

    // Helper to format plan data with enabled/contactUs fields
    const formatPlanData = (plan: typeof basic, tier: 'BASIC' | 'LITE' | 'PRO') => ({
      tier,
      name: plan.name,
      basePrice: plan.basePrice,
      currency: 'IDR',
      features: plan.features,
      durations: plan.durations.filter(d => d.enabled).map(d => ({
        months: d.months,
        days: d.days,
        discountPercent: d.discountPercent,
        totalPrice: d.totalPrice,
        effectiveMonthlyPrice: d.effectiveMonthlyPrice,
        savings: d.savings,
        label: d.label,
        recommended: d.recommended,
      })),
      enabled: plan.enabled,
      isContactUs: plan.isContactUs,
      contactUrl: plan.contactUrl,
    });

    return c.json({
      success: true,
      data: {
        basic: formatPlanData(basic, 'BASIC'),
        lite: formatPlanData(lite, 'LITE'),
        pro: formatPlanData(pro, 'PRO'),
      },
    });
  } catch (error) {
    logger.error('Payment pricing error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get pricing' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/prorate
// Get proration info for subscription upgrade
// =============================================================================

app.get('/prorate', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const targetTier = c.req.query('targetTier');
    const durationMonthsStr = c.req.query('durationMonths');

    // Validate targetTier
    if (!targetTier || !['BASIC', 'LITE', 'PRO'].includes(targetTier)) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Invalid target tier. Must be BASIC, LITE or PRO' },
      }, 400);
    }

    // Validate durationMonths
    const durationMonths = parseInt(durationMonthsStr || '1', 10);
    if (!isValidDurationMonths(durationMonths)) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Invalid duration. Must be 1, 3, 6, or 12 months' },
      }, 400);
    }

    // Calculate proration
    const prorateInfo = await prorateCalculationService.calculateProrate({
      userId: c.user.id,
      targetTier: targetTier as 'BASIC' | 'LITE' | 'PRO',
      durationMonths: durationMonths as 1 | 3 | 6 | 12,
    });

    // No proration applies
    if (!prorateInfo) {
      // Get target tier pricing for the response
      const planPricing = await adminSubscriptionPlansService.getPlanPricing(
        targetTier.toLowerCase() as 'basic' | 'lite' | 'pro'
      );
      const targetDuration = planPricing.durations.find(d => d.months === durationMonths);
      const originalPrice = targetDuration?.totalPrice ?? planPricing.basePrice;

      return c.json({
        success: true,
        data: {
          hasProration: false,
          targetTier,
          originalPrice,
          effectivePrice: originalPrice,
        },
      });
    }

    // Proration applies
    return c.json({
      success: true,
      data: {
        hasProration: true,
        currentTier: prorateInfo.currentTier,
        targetTier: prorateInfo.targetTier,
        currentTierPrice: prorateInfo.currentTierPrice,
        targetTierPrice: prorateInfo.targetTierPrice,
        daysRemaining: prorateInfo.daysRemaining,
        totalDays: prorateInfo.totalDays,
        prorateCredit: prorateInfo.prorateCredit,
        originalPrice: prorateInfo.originalPrice,
        effectivePrice: prorateInfo.effectivePrice,
        savings: prorateInfo.savings,
      },
    });
  } catch (error) {
    logger.error('Payment prorate error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to calculate proration' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/invoice/:orderId
// Get invoice data for a completed transaction
// =============================================================================

app.get('/invoice/:orderId', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const orderId = c.req.param('orderId');

    if (!orderId) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Order ID is required' },
      }, 400);
    }

    const invoice = await paymentService.getInvoiceData(orderId, c.user.id);

    if (!invoice) {
      return c.json({
        error: { code: 'NotFound', message: 'Invoice not found' },
      }, 404);
    }

    if (invoice.status !== 'COMPLETED') {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Invoice only available for completed transactions' },
      }, 400);
    }

    return c.json({
      success: true,
      data: invoice,
    });
  } catch (error) {
    logger.error('Invoice fetch error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get invoice' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/providers
// Get all registered payment providers with their status
// Requirements: 8.1, 8.2, 8.3, 8.4
// =============================================================================

app.get('/providers', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const allProviders = paymentGatewayManager.getAllProviders();
    const healthResults = await paymentGatewayManager.healthCheckAll();
    const defaultProvider = await paymentGatewayManager.getDefaultProvider();

    const providersData = await Promise.all(
      allProviders.map(async (provider) => {
        const healthResult = healthResults.get(provider.providerId);
        let isConfigured = false;
        
        try {
          isConfigured = await provider.isConfigured();
        } catch {
          // Provider configuration check failed
        }

        return {
          providerId: provider.providerId,
          displayName: provider.displayName,
          paymentMethods: provider.getPaymentMethods(),
          isConfigured,
          isDefault: defaultProvider?.providerId === provider.providerId,
          health: healthResult ? {
            status: healthResult.status,
            message: healthResult.message || null,
            lastChecked: healthResult.lastChecked.toISOString(),
          } : null,
        };
      })
    );

    return c.json({
      success: true,
      data: {
        providers: providersData,
        totalProviders: allProviders.length,
        configuredProviders: providersData.filter(p => p.isConfigured).length,
      },
    });
  } catch (error) {
    logger.error('Payment providers list error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get payment providers' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/payment/providers/:providerId/health
// Get health status for a specific payment provider
// Requirements: 8.1, 8.2, 8.3, 8.4
// =============================================================================

app.get('/providers/:providerId/health', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const providerId = c.req.param('providerId');

    if (!providerId) {
      return c.json({
        error: { code: 'InvalidRequest', message: 'Provider ID is required' },
      }, 400);
    }

    // Check if provider exists
    const provider = paymentGatewayManager.getProvider(providerId);
    if (!provider) {
      return c.json({
        error: { code: 'NotFound', message: `Provider '${providerId}' not found` },
      }, 404);
    }

    // Perform health check
    const healthResult = await paymentGatewayManager.healthCheck(providerId);
    
    // Get configuration status
    let isConfigured = false;
    try {
      isConfigured = await provider.isConfigured();
    } catch {
      // Provider configuration check failed
    }

    // Log warning if provider is unhealthy
    if (healthResult.status !== 'healthy') {
      logger.warn('Provider health check returned non-healthy status', {
        providerId,
        status: healthResult.status,
        message: healthResult.message,
      });
    }

    return c.json({
      success: true,
      data: {
        providerId: provider.providerId,
        displayName: provider.displayName,
        isConfigured,
        health: {
          status: healthResult.status,
          message: healthResult.message || null,
          lastChecked: healthResult.lastChecked.toISOString(),
        },
      },
    });
  } catch (error) {
    if (error instanceof ProviderNotFoundError) {
      return c.json({
        error: { code: 'NotFound', message: error.message },
      }, 404);
    }

    logger.error('Payment provider health check error:', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      providerId: c.req.param('providerId'),
    });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to check provider health' },
    }, 500);
  }
});

export default app;
