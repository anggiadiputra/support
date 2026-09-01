/**
 * AffiliateService
 *
 * Manages the affiliate referral system including:
 * - Affiliate registration and management
 * - Referral code generation and tracking
 * - Commission calculation, holding, and release
 * - Admin operations for affiliate management
 *
 * Uses Prisma transactions for atomic operations to prevent race conditions.
 *
 * IMPORTANT: This service requires the Prisma client to be regenerated
 * after schema changes. Run: pnpm prisma:generate
 */

import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/auditLog.js';
import { creditService } from './credit-service.js';
import type {
  Affiliate,
  AffiliateCommission,
  AffiliateCommissionStatus,
  AffiliateTier,
  Referral,
} from '@prisma/client';

// =============================================================================
// Types and Interfaces
// =============================================================================

/**
 * AffiliateConfig type definition
 * Matches the Prisma schema model
 */
export interface AffiliateConfig {
  id: string;
  commissionPercentage: number;
  holdingPeriodDays: number;
  isEnabled: boolean;
  referredUserBonusEnabled: boolean;
  referredUserBonusAmount: number;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCommissionParams {
  referredUserId: string;
  orderId: string;
  transactionType: 'SUBSCRIPTION' | 'TOP_UP';
  transactionAmount: number;
}

export interface ListAffiliatesParams {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  tier?: AffiliateTier;
}

export interface ListCommissionsParams {
  page?: number;
  limit?: number;
  affiliateId?: string;
  status?: AffiliateCommissionStatus;
}

export interface UpdateAffiliateData {
  isActive?: boolean;
  tier?: AffiliateTier;
  customCommission?: number | null;
}

export interface UpdateConfigData {
  commissionPercentage?: number;
  holdingPeriodDays?: number;
  isEnabled?: boolean;
  referredUserBonusEnabled?: boolean;
  referredUserBonusAmount?: number;
}

export interface AffiliateWithUser extends Affiliate {
  user: {
    id: string;
    name: string;
    email: string;
  };
}

export interface ReferralWithUser extends Referral {
  referredUser: {
    id: string;
    name: string;
    email: string;
    createdAt: Date;
  };
}

export interface AffiliateStats {
  totalEarnings: number;
  totalReferrals: number;
  pendingCommissions: number;
  pendingAmount: number;
  creditedCommissions: number;
  creditedAmount: number;
}

// =============================================================================
// AffiliateService Class
// =============================================================================

export class AffiliateService {
  /**
   * Characters to use for referral code generation
   * Excludes confusing characters: 0, O, 1, I, l
   */
  private readonly CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  private readonly CODE_LENGTH = 6;

  // ===========================================================================
  // Config Methods
  // ===========================================================================

  /**
   * Get or create singleton AffiliateConfig
   * Creates default config if none exists
   */
  async getConfig(): Promise<AffiliateConfig> {
    try {
      // Using 'any' cast because Prisma types may not be regenerated yet
      let config = await (prisma.affiliateConfig as any).findFirst();

      if (!config) {
        config = await (prisma.affiliateConfig as any).create({
          data: {
            commissionPercentage: 10,
            holdingPeriodDays: 14,
            isEnabled: true,
            referredUserBonusEnabled: false,
            referredUserBonusAmount: 0,
          },
        });

        logger.info('Created default affiliate config');
      }

      return config as AffiliateConfig;
    } catch (error) {
      logger.error('Failed to get affiliate config', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update affiliate config
   * Only admins should call this
   */
  async updateConfig(data: UpdateConfigData, adminUserId: string): Promise<AffiliateConfig> {
    try {
      const config = await this.getConfig();

      const updatedConfig = await (prisma.affiliateConfig as any).update({
        where: { id: config.id },
        data: {
          ...data,
          updatedBy: adminUserId,
        },
      });

      logger.info('Affiliate config updated', {
        adminUserId,
        changes: data,
      });

      await auditLog(
        'affiliate_config_updated',
        'affiliate_config',
        config.id,
        {
          before: {
            commissionPercentage: config.commissionPercentage,
            holdingPeriodDays: config.holdingPeriodDays,
            isEnabled: config.isEnabled,
            referredUserBonusEnabled: config.referredUserBonusEnabled,
            referredUserBonusAmount: config.referredUserBonusAmount,
          },
          after: data,
        },
        adminUserId
      );

      return updatedConfig as AffiliateConfig;
    } catch (error) {
      logger.error('Failed to update affiliate config', {
        adminUserId,
        data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Registration Methods
  // ===========================================================================

  /**
   * Generate unique 6-character referral code
   * Excludes confusing characters (0, O, 1, I, l)
   */
  async generateReferralCode(): Promise<string> {
    const maxAttempts = 10;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      let code = '';
      for (let i = 0; i < this.CODE_LENGTH; i++) {
        const randomIndex = Math.floor(Math.random() * this.CODE_CHARS.length);
        code += this.CODE_CHARS[randomIndex];
      }

      // Check if code already exists
      const existing = await prisma.affiliate.findUnique({
        where: { referralCode: code },
      });

      if (!existing) {
        return code;
      }
    }

    throw new Error('Failed to generate unique referral code after maximum attempts');
  }

  /**
   * Get affiliate by user ID
   * Returns null if user is not an affiliate
   */
  async getAffiliateByUserId(userId: string): Promise<Affiliate | null> {
    try {
      return await prisma.affiliate.findUnique({
        where: { userId },
      });
    } catch (error) {
      logger.error('Failed to get affiliate by user ID', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Register user as affiliate
   * Creates affiliate profile with unique referral code
   */
  async registerAffiliate(userId: string): Promise<Affiliate> {
    try {
      // Check if user is already an affiliate
      const existing = await this.getAffiliateByUserId(userId);
      if (existing) {
        throw new Error('User is already an affiliate');
      }

      // Check if user exists
      const user = await prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        throw new Error('User not found');
      }

      const referralCode = await this.generateReferralCode();

      const affiliate = await prisma.affiliate.create({
        data: {
          userId,
          referralCode,
          isActive: true,
          tier: 'STANDARD',
          totalEarnings: 0,
          totalReferrals: 0,
        },
      });

      logger.info('Affiliate registered', {
        userId,
        affiliateId: affiliate.id,
        referralCode,
      });

      await auditLog('affiliate_registered', 'affiliate', affiliate.id, { referralCode }, userId);

      return affiliate;
    } catch (error) {
      logger.error('Failed to register affiliate', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Referral Methods
  // ===========================================================================

  /**
   * Validate referral code
   * Returns affiliate info if valid, null if invalid
   */
  async validateReferralCode(
    code: string
  ): Promise<{ affiliate: Affiliate; user: { id: string; name: string } } | null> {
    try {
      const affiliate = await prisma.affiliate.findUnique({
        where: { referralCode: code.toUpperCase() },
        include: {
          user: {
            select: { id: true, name: true },
          },
        },
      });

      if (!affiliate || !affiliate.isActive) {
        return null;
      }

      return {
        affiliate,
        user: affiliate.user,
      };
    } catch (error) {
      logger.error('Failed to validate referral code', {
        code,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Track referral when new user registers with referral code
   * Gives bonus credit to referred user if enabled
   */
  async trackReferral(referralCode: string, referredUserId: string): Promise<Referral | null> {
    try {
      const validation = await this.validateReferralCode(referralCode);
      if (!validation) {
        logger.warn('Invalid referral code', { referralCode, referredUserId });
        return null;
      }

      const { affiliate } = validation;

      // Prevent self-referral
      if (affiliate.userId === referredUserId) {
        logger.warn('Self-referral attempted', { referralCode, referredUserId });
        return null;
      }

      // Check if user already has a referrer
      const existingReferral = await prisma.referral.findUnique({
        where: { referredUserId },
      });
      if (existingReferral) {
        logger.warn('User already has referrer', { referredUserId });
        return null;
      }

      const config = await this.getConfig();

      // Create referral within transaction
      const referral = await prisma.$transaction(async (tx) => {
        // Create referral record
        const newReferral = await tx.referral.create({
          data: {
            affiliateId: affiliate.id,
            referredUserId,
          },
        });

        // Update affiliate stats
        await tx.affiliate.update({
          where: { id: affiliate.id },
          data: {
            totalReferrals: { increment: 1 },
          },
        });

        return newReferral;
      });

      logger.info('Referral tracked', {
        affiliateId: affiliate.id,
        referredUserId,
        referralId: referral.id,
      });

      // Give bonus credit to referred user if enabled
      if (config.referredUserBonusEnabled && config.referredUserBonusAmount > 0) {
        try {
          await creditService.addCredit({
            userId: referredUserId,
            amount: config.referredUserBonusAmount,
            type: 'REFERRAL_BONUS' as any, // Cast needed until Prisma client is regenerated
            reason: `Referral bonus from code ${referralCode}`,
          });

          logger.info('Referral bonus credited', {
            referredUserId,
            amount: config.referredUserBonusAmount,
          });
        } catch (bonusError) {
          // Log but don't fail the referral tracking
          logger.error('Failed to credit referral bonus', {
            referredUserId,
            amount: config.referredUserBonusAmount,
            error: bonusError instanceof Error ? bonusError.message : 'Unknown error',
          });
        }
      }

      await auditLog(
        'referral_tracked',
        'referral',
        referral.id,
        {
          affiliateId: affiliate.id,
          referralCode,
          bonusAmount: config.referredUserBonusEnabled ? config.referredUserBonusAmount : 0,
        },
        referredUserId
      );

      return referral;
    } catch (error) {
      logger.error('Failed to track referral', {
        referralCode,
        referredUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get referrals for an affiliate with pagination
   */
  async getReferrals(
    affiliateId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<{ referrals: ReferralWithUser[]; total: number }> {
    try {
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 50);
      const skip = (validPage - 1) * validLimit;

      const [referrals, total] = await Promise.all([
        prisma.referral.findMany({
          where: { affiliateId },
          include: {
            referredUser: {
              select: {
                id: true,
                name: true,
                email: true,
                createdAt: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: validLimit,
        }),
        prisma.referral.count({ where: { affiliateId } }),
      ]);

      return { referrals, total };
    } catch (error) {
      logger.error('Failed to get referrals', {
        affiliateId,
        page,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Commission Methods
  // ===========================================================================

  /**
   * Create commission when referred user makes a payment
   * Idempotent by orderId - won't create duplicate for same order
   */
  async createCommission(params: CreateCommissionParams): Promise<AffiliateCommission | null> {
    const { referredUserId, orderId, transactionType, transactionAmount } = params;

    try {
      const config = await this.getConfig();

      // Check if affiliate system is enabled
      if (!config.isEnabled) {
        logger.info('Affiliate system is disabled, skipping commission', { orderId });
        return null;
      }

      // Find referral for this user
      const referral = await prisma.referral.findUnique({
        where: { referredUserId },
        include: { affiliate: true },
      });

      if (!referral) {
        // User was not referred, no commission
        logger.info('User was not referred, skipping commission', {
          referredUserId,
          orderId,
        });
        return null;
      }

      if (!referral.affiliate.isActive) {
        logger.info('Affiliate is inactive, skipping commission', {
          affiliateId: referral.affiliateId,
          orderId,
        });
        return null;
      }

      // Check for existing commission (idempotency) using findFirst with orderId filter
      const existingCommission = await prisma.affiliateCommission.findFirst({
        where: { orderId },
      });
      if (existingCommission) {
        logger.info('Commission already exists for order', { orderId });
        return existingCommission;
      }

      // Calculate commission percentage (custom or global)
      const commissionPercentage =
        referral.affiliate.customCommission ?? config.commissionPercentage;

      // Calculate commission amount
      const commissionAmount = Math.floor((transactionAmount * commissionPercentage) / 100);

      if (commissionAmount <= 0) {
        logger.info('Commission amount is zero, skipping', { orderId, transactionAmount });
        return null;
      }

      // Calculate release date
      const releaseAt = new Date();
      releaseAt.setDate(releaseAt.getDate() + config.holdingPeriodDays);

      const commission = await prisma.affiliateCommission.create({
        data: {
          affiliateId: referral.affiliateId,
          referredUserId,
          orderId,
          transactionType,
          transactionAmount,
          commissionPercentage,
          commissionAmount,
          status: 'PENDING',
          releaseAt,
        },
      });

      logger.info('Commission created', {
        commissionId: commission.id,
        affiliateId: referral.affiliateId,
        orderId,
        amount: commissionAmount,
        releaseAt,
      });

      await auditLog('commission_created', 'affiliate_commission', commission.id, {
        affiliateId: referral.affiliateId,
        referredUserId,
        orderId,
        transactionAmount,
        commissionPercentage,
        commissionAmount,
        releaseAt,
      });

      return commission;
    } catch (error) {
      logger.error('Failed to create commission', {
        ...params,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Process all commissions past their release date
   * Should be called by a scheduled job (e.g., daily cron)
   */
  async processReleaseableCommissions(): Promise<{ processed: number; failed: number }> {
    let processed = 0;
    let failed = 0;

    try {
      const now = new Date();

      // Find all pending commissions past release date
      const commissions = await prisma.affiliateCommission.findMany({
        where: {
          status: 'PENDING',
          releaseAt: { lte: now },
        },
        orderBy: { releaseAt: 'asc' },
      });

      logger.info('Processing releaseable commissions', { count: commissions.length });

      for (const commission of commissions) {
        try {
          await this.releaseCommission(commission.id);
          processed++;
        } catch (error) {
          failed++;
          logger.error('Failed to release commission', {
            commissionId: commission.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('Finished processing commissions', { processed, failed });

      return { processed, failed };
    } catch (error) {
      logger.error('Failed to process releaseable commissions', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Release a specific commission
   * Adds credit to affiliate's balance and updates stats
   */
  async releaseCommission(commissionId: string, adminUserId?: string): Promise<AffiliateCommission> {
    try {
      const commission = await prisma.affiliateCommission.findUnique({
        where: { id: commissionId },
        include: { affiliate: true },
      });

      if (!commission) {
        throw new Error('Commission not found');
      }

      if (commission.status !== 'PENDING') {
        throw new Error(`Commission is already ${commission.status}`);
      }

      // Use transaction for atomicity
      const result = await prisma.$transaction(async (tx) => {
        // Update commission status
        // Using 'as any' cast for fields that may not be in generated types yet
        const updateData: any = {
          status: 'CREDITED',
          creditedAt: new Date(),
        };
        if (adminUserId) {
          updateData.releasedBy = adminUserId;
        }

        const updatedCommission = await tx.affiliateCommission.update({
          where: { id: commissionId },
          data: updateData,
        });

        // Update affiliate total earnings
        await tx.affiliate.update({
          where: { id: commission.affiliateId },
          data: {
            totalEarnings: { increment: commission.commissionAmount },
          },
        });

        return updatedCommission;
      });

      // Add credit to affiliate's user balance (outside transaction for proper error handling)
      await creditService.addCredit({
        userId: commission.affiliate.userId,
        amount: commission.commissionAmount,
        type: 'AFFILIATE_COMMISSION' as any, // Cast needed until Prisma client is regenerated
        orderId: commission.orderId,
        reason: `Commission from order ${commission.orderId}`,
        adminUserId,
      });

      logger.info('Commission released', {
        commissionId,
        affiliateId: commission.affiliateId,
        amount: commission.commissionAmount,
        releasedBy: adminUserId || 'system',
      });

      await auditLog(
        'commission_released',
        'affiliate_commission',
        commissionId,
        {
          affiliateId: commission.affiliateId,
          amount: commission.commissionAmount,
          releasedBy: adminUserId || 'system',
        },
        adminUserId || commission.affiliate.userId
      );

      return result;
    } catch (error) {
      logger.error('Failed to release commission', {
        commissionId,
        adminUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel a pending commission
   * Only admin can cancel commissions
   */
  async cancelCommission(
    commissionId: string,
    adminUserId: string,
    reason?: string
  ): Promise<AffiliateCommission> {
    try {
      const commission = await prisma.affiliateCommission.findUnique({
        where: { id: commissionId },
      });

      if (!commission) {
        throw new Error('Commission not found');
      }

      if (commission.status !== 'PENDING') {
        throw new Error(`Cannot cancel commission with status ${commission.status}`);
      }

      // Using 'as any' cast for fields that may not be in generated types yet
      const updateData: any = {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelledBy: adminUserId,
      };

      const updatedCommission = await prisma.affiliateCommission.update({
        where: { id: commissionId },
        data: updateData,
      });

      logger.info('Commission cancelled', {
        commissionId,
        adminUserId,
        reason,
      });

      await auditLog(
        'commission_cancelled',
        'affiliate_commission',
        commissionId,
        {
          affiliateId: commission.affiliateId,
          amount: commission.commissionAmount,
          reason,
        },
        adminUserId
      );

      return updatedCommission;
    } catch (error) {
      logger.error('Failed to cancel commission', {
        commissionId,
        adminUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get commission history for an affiliate
   */
  async getCommissions(
    affiliateId: string,
    page: number = 1,
    limit: number = 10,
    status?: AffiliateCommissionStatus
  ): Promise<{ commissions: AffiliateCommission[]; total: number }> {
    try {
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 50);
      const skip = (validPage - 1) * validLimit;

      const where: any = { affiliateId };
      if (status) {
        where.status = status;
      }

      const [commissions, total] = await Promise.all([
        prisma.affiliateCommission.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: validLimit,
        }),
        prisma.affiliateCommission.count({ where }),
      ]);

      return { commissions, total };
    } catch (error) {
      logger.error('Failed to get commissions', {
        affiliateId,
        page,
        limit,
        status,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get earnings summary for an affiliate
   */
  async getStats(affiliateId: string): Promise<AffiliateStats> {
    try {
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateId },
      });

      if (!affiliate) {
        throw new Error('Affiliate not found');
      }

      // Get commission stats by status
      const [pendingStats, creditedStats] = await Promise.all([
        prisma.affiliateCommission.aggregate({
          where: { affiliateId, status: 'PENDING' },
          _count: { id: true },
          _sum: { commissionAmount: true },
        }),
        prisma.affiliateCommission.aggregate({
          where: { affiliateId, status: 'CREDITED' },
          _count: { id: true },
          _sum: { commissionAmount: true },
        }),
      ]);

      return {
        totalEarnings: affiliate.totalEarnings,
        totalReferrals: affiliate.totalReferrals,
        pendingCommissions: pendingStats._count.id,
        pendingAmount: pendingStats._sum.commissionAmount ?? 0,
        creditedCommissions: creditedStats._count.id,
        creditedAmount: creditedStats._sum.commissionAmount ?? 0,
      };
    } catch (error) {
      logger.error('Failed to get affiliate stats', {
        affiliateId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Admin Methods
  // ===========================================================================

  /**
   * List all affiliates with search and filters
   */
  async listAffiliates(
    params: ListAffiliatesParams
  ): Promise<{ affiliates: AffiliateWithUser[]; total: number }> {
    try {
      const { page = 1, limit = 10, search, isActive, tier } = params;
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 50);
      const skip = (validPage - 1) * validLimit;

      const where: any = {};

      if (typeof isActive === 'boolean') {
        where.isActive = isActive;
      }

      if (tier) {
        where.tier = tier;
      }

      if (search) {
        where.OR = [
          { referralCode: { contains: search.toUpperCase(), mode: 'insensitive' } },
          { user: { name: { contains: search, mode: 'insensitive' } } },
          { user: { email: { contains: search, mode: 'insensitive' } } },
        ];
      }

      const [affiliates, total] = await Promise.all([
        prisma.affiliate.findMany({
          where,
          include: {
            user: {
              select: { id: true, name: true, email: true },
            },
            commissions: {
              where: { status: 'PENDING' },
              select: { commissionAmount: true },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: validLimit,
        }),
        prisma.affiliate.count({ where }),
      ]);

      // Calculate pendingAmount for each affiliate
      const affiliatesWithPending = affiliates.map((affiliate) => {
        const pendingAmount = affiliate.commissions.reduce(
          (sum, c) => sum + c.commissionAmount,
          0
        );
        // Remove commissions from response (only needed for calculation)
        const { commissions, ...affiliateData } = affiliate;
        return { ...affiliateData, pendingAmount };
      });

      return { affiliates: affiliatesWithPending, total };
    } catch (error) {
      logger.error('Failed to list affiliates', {
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update affiliate settings (admin only)
   */
  async updateAffiliate(
    affiliateId: string,
    data: UpdateAffiliateData,
    adminUserId: string
  ): Promise<Affiliate> {
    try {
      const affiliate = await prisma.affiliate.findUnique({
        where: { id: affiliateId },
      });

      if (!affiliate) {
        throw new Error('Affiliate not found');
      }

      const updatedAffiliate = await prisma.affiliate.update({
        where: { id: affiliateId },
        data,
      });

      logger.info('Affiliate updated', {
        affiliateId,
        adminUserId,
        changes: data,
      });

      await auditLog(
        'affiliate_updated',
        'affiliate',
        affiliateId,
        {
          before: {
            isActive: affiliate.isActive,
            tier: affiliate.tier,
            customCommission: affiliate.customCommission,
          },
          after: data,
        },
        adminUserId
      );

      return updatedAffiliate;
    } catch (error) {
      logger.error('Failed to update affiliate', {
        affiliateId,
        data,
        adminUserId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List all commissions with filters (admin only)
   */
  async listCommissions(
    params: ListCommissionsParams
  ): Promise<{ commissions: (AffiliateCommission & { affiliate: AffiliateWithUser })[]; total: number }> {
    try {
      const { page = 1, limit = 10, affiliateId, status } = params;
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 50);
      const skip = (validPage - 1) * validLimit;

      const where: any = {};

      if (affiliateId) {
        where.affiliateId = affiliateId;
      }

      if (status) {
        where.status = status;
      }

      const [commissions, total] = await Promise.all([
        prisma.affiliateCommission.findMany({
          where,
          include: {
            affiliate: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          skip,
          take: validLimit,
        }),
        prisma.affiliateCommission.count({ where }),
      ]);

      return { commissions, total };
    } catch (error) {
      logger.error('Failed to list commissions', {
        params,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// Export singleton instance
export const affiliateService = new AffiliateService();
