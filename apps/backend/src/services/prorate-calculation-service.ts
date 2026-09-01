/**
 * ProrateCalculationService
 * 
 * Handles proration calculations when users upgrade their subscription plan.
 * Calculates the remaining value of current subscription and applies it as credit
 * towards the new subscription purchase.
 * 
 * Requirements:
 * - Calculate remaining value based on days left in current billing period
 * - Only applies to UPGRADES (lower tier to higher tier)
 * - FREE tier users don't get proration (they're upgrading from free)
 * - User must have ACTIVE subscription with endDate > now()
 */

import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { adminSubscriptionPlansService } from './admin/subscription-plans-service.js';

// =============================================================================
// Types and Interfaces
// =============================================================================

export type SubscriptionTier = 'FREE' | 'BASIC' | 'LITE' | 'PRO';

export interface ProrateInfo {
  currentTier: string;
  targetTier: string;
  currentTierPrice: number;
  targetTierPrice: number;
  daysRemaining: number;
  totalDays: number;
  prorateCredit: number;
  originalPrice: number;
  effectivePrice: number;
  savings: number;
}

export interface ProrateCalculationParams {
  userId: string;
  targetTier: 'BASIC' | 'LITE' | 'PRO';
  durationMonths: 1 | 3 | 6 | 12;
}

// Tier order for comparison (lower = lower tier)
const TIER_ORDER: Record<SubscriptionTier, number> = {
  FREE: 0,
  BASIC: 1,
  LITE: 2,
  PRO: 3,
};

// =============================================================================
// ProrateCalculationService Class
// =============================================================================

export class ProrateCalculationService {
  
  /**
   * Calculate proration info for a subscription upgrade
   * 
   * @param params - Calculation parameters including userId, targetTier, and durationMonths
   * @returns ProrateInfo if proration applies, null otherwise
   * 
   * Returns null when:
   * - User has no active subscription
   * - User is on FREE tier (no proration from free)
   * - User is attempting a downgrade or same-tier purchase
   * - Subscription has already expired
   */
  async calculateProrate(params: ProrateCalculationParams): Promise<ProrateInfo | null> {
    const { userId, targetTier, durationMonths } = params;

    try {
      // Get user's current subscription
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
        select: {
          tier: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });

      // No active subscription -> no proration
      if (!subscription) {
        logger.debug('No subscription found for user, no proration', { userId });
        return null;
      }

      // Check if subscription is ACTIVE
      if (subscription.status !== 'ACTIVE') {
        logger.debug('Subscription is not active, no proration', { 
          userId, 
          status: subscription.status 
        });
        return null;
      }

      const currentTier = subscription.tier as SubscriptionTier;

      // FREE tier -> no proration (they're upgrading from free)
      if (currentTier === 'FREE') {
        logger.debug('User is on FREE tier, no proration', { userId });
        return null;
      }

      // Check if endDate exists and is in the future
      const now = new Date();
      if (!subscription.endDate) {
        // Lifetime subscription - no proration (endDate is null)
        logger.debug('User has lifetime subscription (no endDate), no proration', { userId });
        return null;
      }

      if (subscription.endDate <= now) {
        // Subscription already expired
        logger.debug('Subscription has expired, no proration', { 
          userId, 
          endDate: subscription.endDate 
        });
        return null;
      }

      // Check if this is an upgrade (target tier > current tier)
      const currentTierOrder = TIER_ORDER[currentTier];
      const targetTierOrder = TIER_ORDER[targetTier as SubscriptionTier];

      if (targetTierOrder <= currentTierOrder) {
        // Not an upgrade (downgrade or same tier)
        logger.debug('Not an upgrade, no proration', { 
          userId, 
          currentTier, 
          targetTier 
        });
        return null;
      }

      // Get pricing for current and target tiers
      const [currentPlanPricing, targetPlanPricing] = await Promise.all([
        adminSubscriptionPlansService.getPlanPricing(currentTier.toLowerCase() as 'basic' | 'lite' | 'pro'),
        adminSubscriptionPlansService.getPlanPricing(targetTier.toLowerCase() as 'basic' | 'lite' | 'pro'),
      ]);

      const currentTierMonthlyPrice = currentPlanPricing.basePrice; // Monthly price

      // Find the target duration option
      const targetDuration = targetPlanPricing.durations.find(d => d.months === durationMonths);
      if (!targetDuration) {
        logger.warn('Target duration not found', { targetTier, durationMonths });
        return null;
      }

      // Calculate days remaining and total days in current billing period
      const startDate = subscription.startDate;
      const endDate = subscription.endDate;
      
      // Total days in current billing period
      const totalDays = Math.ceil(
        (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Days remaining from now until endDate
      const daysRemaining = Math.ceil(
        (endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Ensure daysRemaining is at least 0
      const effectiveDaysRemaining = Math.max(0, daysRemaining);

      // Determine the months in current subscription period based on totalDays
      // This maps the subscription period to a standard duration
      const daysToMonths: Record<number, number> = {
        30: 1,
        90: 3,
        180: 6,
        365: 12,
      };
      
      // Find the closest matching months for the current period
      let currentPeriodMonths = 1;
      for (const [days, months] of Object.entries(daysToMonths)) {
        if (Math.abs(totalDays - parseInt(days)) <= 5) { // Allow 5 days tolerance
          currentPeriodMonths = months;
          break;
        }
      }
      
      // Find the current duration pricing to get actual paid price
      const currentDuration = currentPlanPricing.durations.find(d => d.months === currentPeriodMonths);
      
      // Calculate total value paid for current subscription period
      // Use the actual totalPrice from duration (includes any discounts) or fallback to monthly * months
      const currentPeriodTotalPaid = currentDuration?.totalPrice ?? (currentTierMonthlyPrice * currentPeriodMonths);
      
      // Calculate prorate credit using formula:
      // prorateCredit = (totalPaidForPeriod * daysRemaining) / totalDays
      // This calculates the proportional value of unused subscription based on actual amount paid
      const prorateCredit = Math.round((currentPeriodTotalPaid * effectiveDaysRemaining) / totalDays);

      // Original price for target subscription (with duration discount applied)
      const originalPrice = targetDuration.totalPrice;

      // Effective price after proration (minimum 0)
      const effectivePrice = Math.max(0, originalPrice - prorateCredit);

      // Savings from proration
      const savings = originalPrice - effectivePrice;

      const prorateInfo: ProrateInfo = {
        currentTier,
        targetTier,
        currentTierPrice: currentTierMonthlyPrice,
        targetTierPrice: targetPlanPricing.basePrice,
        daysRemaining: effectiveDaysRemaining,
        totalDays,
        prorateCredit,
        originalPrice,
        effectivePrice,
        savings,
      };

      logger.info('Prorate calculation completed', {
        userId,
        currentTier,
        targetTier,
        durationMonths,
        daysRemaining: effectiveDaysRemaining,
        prorateCredit,
        effectivePrice,
      });

      return prorateInfo;
    } catch (error) {
      logger.error('Failed to calculate proration', {
        userId,
        targetTier,
        durationMonths,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      // Return null on error - don't block upgrade, just don't apply proration
      return null;
    }
  }

  /**
   * Check if a tier upgrade is valid (target is higher than current)
   */
  isValidUpgrade(currentTier: SubscriptionTier, targetTier: SubscriptionTier): boolean {
    return TIER_ORDER[targetTier] > TIER_ORDER[currentTier];
  }

  /**
   * Get the tier order value for comparison
   */
  getTierOrder(tier: SubscriptionTier): number {
    return TIER_ORDER[tier];
  }

  /**
   * Calculate remaining value for a subscription without target tier
   * Useful for displaying remaining credit to users
   */
  async calculateRemainingValue(userId: string): Promise<{
    tier: string;
    daysRemaining: number;
    remainingValue: number;
  } | null> {
    try {
      const subscription = await prisma.subscription.findUnique({
        where: { userId },
        select: {
          tier: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      });

      if (!subscription || subscription.status !== 'ACTIVE') {
        return null;
      }

      const currentTier = subscription.tier as SubscriptionTier;

      if (currentTier === 'FREE' || !subscription.endDate) {
        return null;
      }

      const now = new Date();
      if (subscription.endDate <= now) {
        return null;
      }

      // Get current tier pricing
      const planPricing = await adminSubscriptionPlansService.getPlanPricing(
        currentTier.toLowerCase() as 'basic' | 'lite' | 'pro'
      );

      const daysRemaining = Math.max(0, Math.ceil(
        (subscription.endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      ));

      // Calculate total days in billing period for accurate proration
      const totalDays = Math.ceil(
        (subscription.endDate.getTime() - subscription.startDate.getTime()) / (1000 * 60 * 60 * 24)
      );

      // Determine the months in current subscription period based on totalDays
      const daysToMonths: Record<number, number> = {
        30: 1,
        90: 3,
        180: 6,
        365: 12,
      };
      
      // Find the closest matching months for the current period
      let currentPeriodMonths = 1;
      for (const [days, months] of Object.entries(daysToMonths)) {
        if (Math.abs(totalDays - parseInt(days)) <= 5) { // Allow 5 days tolerance
          currentPeriodMonths = months;
          break;
        }
      }
      
      // Find the current duration pricing to get actual paid price
      const currentDuration = planPricing.durations.find(d => d.months === currentPeriodMonths);
      
      // Calculate total value paid for current subscription period
      const currentPeriodTotalPaid = currentDuration?.totalPrice ?? (planPricing.basePrice * currentPeriodMonths);
      
      // Use proper formula: (totalPaid * daysRemaining) / totalDays
      const remainingValue = Math.round((currentPeriodTotalPaid * daysRemaining) / totalDays);

      return {
        tier: currentTier,
        daysRemaining,
        remainingValue,
      };
    } catch (error) {
      logger.error('Failed to calculate remaining value', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }
}

// Export singleton instance
export const prorateCalculationService = new ProrateCalculationService();
