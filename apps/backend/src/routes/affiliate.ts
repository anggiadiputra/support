/**
 * Affiliate Routes
 *
 * API endpoints for affiliate system: status, registration, referrals, earnings.
 * Handles affiliate program management for users.
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import crypto from 'crypto';
import { affiliateService } from '../services/affiliate-service.js';
import { logger } from '../utils/logger.js';

const app = new Hono();

// =============================================================================
// Referral Token Signing (HMAC-SHA256)
// Prevents cookie manipulation for Google OAuth referral tracking
// =============================================================================

const REFERRAL_SECRET = process.env.REFERRAL_SIGNING_SECRET || process.env.JWT_SECRET || 'fallback-secret-change-me';
const REFERRAL_TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Mask email for privacy
 * e.g., "john.doe@example.com" -> "jo***@example.com"
 */
function maskEmail(email: string): string {
  const [localPart, domain] = email.split('@');
  if (!domain) return '***@***';
  
  // Show first 2 chars of local part, mask the rest
  const visibleChars = Math.min(2, localPart.length);
  const masked = localPart.substring(0, visibleChars) + '***';
  
  return `${masked}@${domain}`;
}

/**
 * Create signed referral token
 * Format: code:timestamp:signature
 */
export function createSignedReferralToken(code: string): string {
  const timestamp = Date.now().toString();
  const data = `${code}:${timestamp}`;
  const signature = crypto
    .createHmac('sha256', REFERRAL_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars for shorter token
  return `${data}:${signature}`;
}

/**
 * Verify signed referral token
 * Returns referral code if valid, null if invalid/expired
 */
export function verifySignedReferralToken(token: string): string | null {
  try {
    const parts = token.split(':');
    if (parts.length !== 3) return null;

    const [code, timestamp, signature] = parts;
    
    // Check expiry
    const tokenTime = parseInt(timestamp, 10);
    if (isNaN(tokenTime) || Date.now() - tokenTime > REFERRAL_TOKEN_EXPIRY) {
      return null; // Expired
    }

    // Verify signature
    const data = `${code}:${timestamp}`;
    const expectedSignature = crypto
      .createHmac('sha256', REFERRAL_SECRET)
      .update(data)
      .digest('hex')
      .substring(0, 16);

    if (signature !== expectedSignature) {
      return null; // Invalid signature
    }

    return code;
  } catch {
    return null;
  }
}

// =============================================================================
// GET /api/v1/affiliate/status
// Check if current user is an affiliate
// =============================================================================

app.get('/status', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    // Get affiliate config to check if system is enabled
    const config = await affiliateService.getConfig();

    // Get affiliate record for user
    const affiliate = await affiliateService.getAffiliateByUserId(c.user.id);

    // Build referralLink if user is an affiliate
    let affiliateData;
    if (affiliate) {
      const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/^["']|["']$/g, '');
      const referralLink = `${frontendUrl}/ref/${affiliate.referralCode}`;

      // Get stats for total earnings and referrals
      const stats = await affiliateService.getStats(affiliate.id);

      affiliateData = {
        id: affiliate.id,
        referralCode: affiliate.referralCode,
        referralLink,
        isActive: affiliate.isActive,
        tier: affiliate.tier,
        commissionRate: affiliate.customCommission ?? config.commissionPercentage,
        totalEarnings: stats.totalEarnings,
        totalReferrals: stats.totalReferrals,
      };
    }

    return c.json({
      success: true,
      data: {
        isAffiliate: !!affiliate,
        affiliate: affiliateData,
        isEnabled: config.isEnabled,
      },
    });
  } catch (error) {
    logger.error('Affiliate status error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get affiliate status' },
    }, 500);
  }
});

// =============================================================================
// POST /api/v1/affiliate/register
// Register current user as affiliate
// =============================================================================

app.post('/register', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    // Check if affiliate system is enabled
    const config = await affiliateService.getConfig();
    if (!config.isEnabled) {
      return c.json({
        error: { code: 'AffiliateDisabled', message: 'Affiliate program is currently disabled' },
      }, 400);
    }

    // Check if user is already an affiliate
    const existingAffiliate = await affiliateService.getAffiliateByUserId(c.user.id);
    if (existingAffiliate) {
      return c.json({
        error: { code: 'AlreadyAffiliate', message: 'You are already registered as an affiliate' },
      }, 400);
    }

    const affiliate = await affiliateService.registerAffiliate(c.user.id);

    // Build referralLink
    const frontendUrl = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/^["']|["']$/g, '');
    const referralLink = `${frontendUrl}/ref/${affiliate.referralCode}`;

    return c.json({
      success: true,
      data: {
        id: affiliate.id,
        referralCode: affiliate.referralCode,
        referralLink,
        isActive: affiliate.isActive,
        tier: affiliate.tier,
        commissionRate: affiliate.customCommission ?? config.commissionPercentage,
        totalEarnings: affiliate.totalEarnings,
        totalReferrals: affiliate.totalReferrals,
      },
    });
  } catch (error) {
    logger.error('Affiliate register error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to register as affiliate' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/affiliate/referrals
// Get list of referred users
// =============================================================================

app.get('/referrals', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    // Check if user is an affiliate
    const affiliate = await affiliateService.getAffiliateByUserId(c.user.id);
    if (!affiliate) {
      return c.json({
        error: { code: 'NotAffiliate', message: 'You are not registered as an affiliate' },
      }, 403);
    }

    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = parseInt(c.req.query('limit') || '10', 10);

    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 50); // Max 50 per page

    const result = await affiliateService.getReferrals(affiliate.id, validPage, validLimit);

    return c.json({
      success: true,
      data: {
        referrals: result.referrals.map((referral) => ({
          id: referral.id,
          referredUser: {
            id: referral.referredUser.id,
            name: referral.referredUser.name,
            email: maskEmail(referral.referredUser.email), // Masked for privacy
            createdAt: referral.referredUser.createdAt.toISOString(),
          },
          createdAt: referral.createdAt.toISOString(),
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
    logger.error('Affiliate referrals error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get referrals' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/affiliate/earnings
// Get earnings summary and commission history
// =============================================================================

app.get('/earnings', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' },
      }, 401);
    }

    // Check if user is an affiliate
    const affiliate = await affiliateService.getAffiliateByUserId(c.user.id);
    if (!affiliate) {
      return c.json({
        error: { code: 'NotAffiliate', message: 'You are not registered as an affiliate' },
      }, 403);
    }

    const page = parseInt(c.req.query('page') || '1', 10);
    const limit = parseInt(c.req.query('limit') || '10', 10);
    const statusFilter = c.req.query('status') as 'PENDING' | 'CREDITED' | 'CANCELLED' | undefined;

    // Validate pagination params
    const validPage = Math.max(1, page);
    const validLimit = Math.min(Math.max(1, limit), 50); // Max 50 per page

    // Validate status filter if provided
    const validStatuses = ['PENDING', 'CREDITED', 'CANCELLED'];
    const validStatusFilter = statusFilter && validStatuses.includes(statusFilter) ? statusFilter : undefined;

    // Get stats and commissions
    const [stats, commissionsResult] = await Promise.all([
      affiliateService.getStats(affiliate.id),
      affiliateService.getCommissions(affiliate.id, validPage, validLimit, validStatusFilter),
    ]);

    return c.json({
      success: true,
      data: {
        summary: {
          totalEarnings: stats.totalEarnings,
          pendingEarnings: stats.pendingAmount,
          creditedEarnings: stats.creditedAmount,
        },
        commissions: commissionsResult.commissions.map((commission) => ({
          id: commission.id,
          orderId: commission.orderId,
          transactionType: commission.transactionType,
          transactionAmount: commission.transactionAmount,
          commissionPercentage: commission.commissionPercentage,
          commissionAmount: commission.commissionAmount,
          status: commission.status,
          releaseAt: commission.releaseAt.toISOString(),
          creditedAt: commission.creditedAt?.toISOString() || null,
          createdAt: commission.createdAt.toISOString(),
        })),
        pagination: {
          total: commissionsResult.total,
          page: validPage,
          limit: validLimit,
          totalPages: Math.ceil(commissionsResult.total / validLimit),
        },
      },
    });
  } catch (error) {
    logger.error('Affiliate earnings error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to get earnings' },
    }, 500);
  }
});

// =============================================================================
// GET /api/v1/affiliate/validate/:code
// Validate referral code (public endpoint for registration)
// =============================================================================

app.get('/validate/:code', async (c: Context) => {
  try {
    const code = c.req.param('code')?.toUpperCase();

    if (!code || code.length < 3) {
      return c.json({
        error: { code: 'InvalidCode', message: 'Invalid referral code' },
      }, 400);
    }

    // Validate the code
    const validation = await affiliateService.validateReferralCode(code);

    // Get config for bonus info
    const config = await affiliateService.getConfig();

    if (!validation) {
      return c.json({
        success: true,
        data: {
          valid: false,
          affiliateName: undefined,
          bonusEnabled: false,
          bonusAmount: 0,
          signedToken: null,
        },
      });
    }

    // Generate signed token for secure cookie storage
    const signedToken = createSignedReferralToken(code);

    return c.json({
      success: true,
      data: {
        valid: true,
        affiliateName: validation.user.name,
        bonusEnabled: config.isEnabled,
        bonusAmount: 0,
        signedToken, // Frontend should store this in cookie
      },
    });
  } catch (error) {
    logger.error('Affiliate validate code error:', { error: error instanceof Error ? error.message : 'Unknown error' });
    return c.json({
      error: { code: 'InternalError', message: 'Failed to validate referral code' },
    }, 500);
  }
});

export default app;
