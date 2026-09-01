/**
 * Credit Routes
 *
 * API endpoints for credit system: balance, history, top-up.
 * Handles credit balance queries, transaction history, and top-up payments.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { creditService } from '../services/credit-service.js';
import { paymentGatewayManager } from '../services/payment/index.js';
import { adminSettingsService } from '../services/admin/settings-service.js';
import type { BrandingSettings } from '../types/admin-settings.js';
import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';

// Default branding fallback
const DEFAULT_BRAND_NAME = 'KirimChat';

const app = new Hono();

// =============================================================================
// GET /api/v1/credit/balance
// Get user's current credit balance
// =============================================================================

app.get('/balance', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const creditBalance = await prisma.creditBalance.findUnique({
      where: { userId: c.user.id },
      select: { balance: true, updatedAt: true },
    });

    return c.json({
      success: true,
      data: {
        balance: creditBalance?.balance ?? 0,
        lastUpdated: creditBalance?.updatedAt?.toISOString() ?? new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error('Credit balance error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get credit balance' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/credit/history
// Get credit transaction history with pagination
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

    const result = await creditService.getHistory(c.user.id, validPage, validLimit);

    return c.json({
      success: true,
      data: {
        transactions: result.transactions.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount,
          balanceBefore: tx.balanceBefore,
          balanceAfter: tx.balanceAfter,
          orderId: tx.orderId || null,
          createdAt: tx.createdAt.toISOString(),
        })),
        pagination: {
          total: result.total,
          page: validPage,
          limit: validLimit,
          totalPages: Math.ceil(result.total / validLimit),
        },
      },
    });
  } catch (error) {
    logger.error('Credit history error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get credit history' },
    }, 500);
  }
});

// =============================================================================
// POST /api/v1/credit/topup
// Create a new top-up payment transaction
// =============================================================================

app.post('/topup', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const body = await c.req.json();
    const { amount, paymentMethod, locale = 'en' } = body;

    // Validate amount - must be one of the valid top-up packages
    if (!amount || !creditService.isValidTopUpAmount(amount)) {
      return c.json({
        error: {
          code: 'InvalidRequest',
          message: `Invalid amount. Must be one of: ${creditService.TOP_UP_PACKAGES.join(', ')}`,
        },
      }, 400);
    }

    // Validate payment method
    const validPaymentMethods = ['QRIS', 'VA_BCA', 'VA_BNI', 'VA_MANDIRI', 'VA_PERMATA'];
    if (!paymentMethod || !validPaymentMethods.includes(paymentMethod)) {
      return c.json({
        error: {
          code: 'InvalidRequest',
          message: 'Invalid payment method. Must be QRIS or VA_BCA/BNI/MANDIRI/PERMATA',
        },
      }, 400);
    }

    // Generate orderId with TOPUP prefix
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    const orderId = `TOPUP-${timestamp}-${random}`;

    // Calculate expiry (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // Create PaymentTransaction with transactionType: 'TOP_UP'
    const transaction = await prisma.paymentTransaction.create({
      data: {
        userId: c.user.id,
        orderId,
        amount,
        paymentMethod,
        targetTier: 'FREE', // Placeholder, tidak upgrade tier
        transactionType: 'TOP_UP' as const,
        durationDays: 0, // Tidak ada durasi untuk top-up
        status: 'PENDING',
        expiresAt,
      } as any, // Type assertion needed as Prisma client may need regeneration
    });

    // Get default payment provider and create payment
    const provider = await paymentGatewayManager.getDefaultProvider();

    if (!provider) {
      // Rollback transaction if no provider available
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });

      return c.json({
        error: { code: 'PaymentError', message: 'No payment provider available' },
      }, 500);
    }

    // Get branding settings for product name (whitelabel support)
    let brandName = DEFAULT_BRAND_NAME;
    try {
      const brandingSettings = await adminSettingsService.getDecryptedSettings<BrandingSettings>('branding');
      if (brandingSettings?.websiteName) {
        brandName = brandingSettings.websiteName;
      }
    } catch (brandingError) {
      logger.warn('Failed to get branding settings for top-up, using default', {
        error: brandingError instanceof Error ? brandingError.message : 'Unknown error',
      });
    }

    // Create payment with provider
    // Sanitize FRONTEND_URL in case it has embedded quotes from misconfigured env
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/^["']|["']$/g, '');
    // Return to subscription page (credit section is on subscription page, not separate page)
    const returnUrl = `${frontendUrl}/${locale}/subscription?topup_verification=true&order_id=${orderId}`;

    // Format amount for display
    const formattedAmount = new Intl.NumberFormat('id-ID').format(amount);
    const productDetails = `${brandName} Credit Top-Up Rp ${formattedAmount}`;

    logger.info('Creating top-up payment', {
      orderId,
      amount,
      brandName,
      productDetails,
    });

    const paymentResult = await provider.createPayment({
      orderId,
      amount,
      paymentMethod,
      customerName: c.user.name || c.user.email || 'Customer',
      customerEmail: c.user.email,
      productDetails,
      returnUrl,
      expiryMinutes: 1440, // 24 hours in minutes
    });

    if (!paymentResult.success) {
      // Update transaction status to FAILED
      await prisma.paymentTransaction.update({
        where: { id: transaction.id },
        data: { status: 'FAILED' },
      });

      return c.json({
        error: { code: 'PaymentError', message: paymentResult.error || 'Failed to create payment' },
      }, 400);
    }

    // Update transaction with provider response
    await prisma.paymentTransaction.update({
      where: { id: transaction.id },
      data: {
        referenceNo: paymentResult.referenceNo,
        qrString: paymentResult.qrString,
        qrUrl: paymentResult.qrUrl,
        vaNumber: paymentResult.vaNumber,
        providerId: provider.providerId,
      },
    });

    logger.info('Top-up payment created', {
      userId: c.user.id,
      orderId,
      amount,
      paymentMethod,
      providerId: provider.providerId,
    });

    return c.json({
      success: true,
      data: {
        orderId,
        amount,
        qrString: paymentResult.qrString || null,
        qrUrl: paymentResult.qrUrl || null,
        vaNumber: paymentResult.vaNumber || null,
        paymentUrl: paymentResult.paymentUrl || null,
        expiresAt: expiresAt.toISOString(),
      },
    });
  } catch (error) {
    logger.error('Top-up create error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to create top-up payment' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/credit/topup/packages
// Get available top-up packages
// =============================================================================

app.get('/topup/packages', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    const packages = creditService.TOP_UP_PACKAGES.map((amount) => ({
      amount,
    }));

    return c.json({
      success: true,
      data: {
        packages,
      },
    });
  } catch (error) {
    logger.error('Top-up packages error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get top-up packages' },
    }, 500);
  }
});

export default app;
