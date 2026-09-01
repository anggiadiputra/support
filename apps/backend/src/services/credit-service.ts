/**
 * CreditService
 *
 * Manages user credit balance and transactions for the credit system.
 * Handles top-up, payment deduction, admin adjustments, refunds, and affiliate commissions.
 * Uses Prisma transactions for atomic operations to prevent race conditions.
 */

import { prisma } from '../utils/database.js';
import { logger } from '../utils/logger.js';
import { auditLog } from '../utils/auditLog.js';
import type { CreditBalance, CreditTransaction, CreditTransactionType } from '@prisma/client';

// =============================================================================
// Types and Interfaces
// =============================================================================

export interface AddCreditParams {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  orderId?: string;
  paymentTransactionId?: string;
  reason?: string;
  adminUserId?: string;
}

export interface DeductCreditParams {
  userId: string;
  amount: number;
  type: CreditTransactionType;
  orderId?: string;
}

export interface CreditHistoryResult {
  transactions: CreditTransaction[];
  total: number;
}

// =============================================================================
// CreditService Class
// =============================================================================

export class CreditService {
  /**
   * Valid top-up package amounts in IDR
   */
  readonly TOP_UP_PACKAGES = [50000, 100000, 300000, 500000];

  // ===========================================================================
  // Balance Methods
  // ===========================================================================

  /**
   * Get current credit balance for a user
   * Returns 0 if user has no CreditBalance record
   */
  async getBalance(userId: string): Promise<number> {
    try {
      const creditBalance = await prisma.creditBalance.findUnique({
        where: { userId },
        select: { balance: true },
      });

      return creditBalance?.balance ?? 0;
    } catch (error) {
      logger.error('Failed to get credit balance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get existing CreditBalance or create new one with balance 0
   * Uses upsert to handle race conditions
   */
  async getOrCreateBalance(userId: string): Promise<CreditBalance> {
    try {
      const creditBalance = await prisma.creditBalance.upsert({
        where: { userId },
        update: {}, // No update if exists
        create: {
          userId,
          balance: 0,
        },
      });

      return creditBalance;
    } catch (error) {
      logger.error('Failed to get or create credit balance', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Credit Operations
  // ===========================================================================

  /**
   * Add credit to user balance
   * Creates CreditTransaction with balanceBefore and balanceAfter
   * Uses Prisma transaction for atomic operation
   */
  async addCredit(params: AddCreditParams): Promise<CreditTransaction> {
    const { userId, amount, type, orderId, paymentTransactionId, reason, adminUserId } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    try {
      const transaction = await prisma.$transaction(async (tx) => {
        // Get or create balance with lock (SELECT FOR UPDATE behavior in transaction)
        let creditBalance = await tx.creditBalance.findUnique({
          where: { userId },
        });

        if (!creditBalance) {
          creditBalance = await tx.creditBalance.create({
            data: {
              userId,
              balance: 0,
            },
          });
        }

        const balanceBefore = creditBalance.balance;
        const balanceAfter = balanceBefore + amount;

        // Update balance
        await tx.creditBalance.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        // Create transaction record
        const creditTransaction = await tx.creditTransaction.create({
          data: {
            userId,
            type,
            amount, // Positive for additions
            balanceBefore,
            balanceAfter,
            orderId,
            paymentTransactionId,
            reason,
            adminUserId,
          },
        });

        return creditTransaction;
      });

      logger.info('Credit added successfully', {
        userId,
        amount,
        type,
        transactionId: transaction.id,
        orderId,
      });

      // Audit log for compliance (especially for ADMIN_ADJUSTMENT, REFUND)
      await auditLog(
        'credit_added',
        'credit_transaction',
        transaction.id,
        {
          type,
          amount,
          balanceBefore: transaction.balanceBefore,
          balanceAfter: transaction.balanceAfter,
          orderId,
          reason,
        },
        adminUserId || userId
      );

      return transaction;
    } catch (error) {
      logger.error('Failed to add credit', {
        userId,
        amount,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Deduct credit from user balance
   * Creates CreditTransaction with NEGATIVE amount
   * Validates sufficient balance before deduction
   * Uses Prisma transaction for atomic operation
   */
  async deductCredit(params: DeductCreditParams): Promise<CreditTransaction> {
    const { userId, amount, type, orderId } = params;

    if (amount <= 0) {
      throw new Error('Amount must be positive');
    }

    try {
      const transaction = await prisma.$transaction(async (tx) => {
        // Get balance with lock
        const creditBalance = await tx.creditBalance.findUnique({
          where: { userId },
        });

        if (!creditBalance) {
          throw new Error('Credit balance not found');
        }

        const balanceBefore = creditBalance.balance;

        // Validate sufficient balance
        if (balanceBefore < amount) {
          throw new Error('Insufficient credit balance');
        }

        const balanceAfter = balanceBefore - amount;

        // Update balance
        await tx.creditBalance.update({
          where: { userId },
          data: { balance: balanceAfter },
        });

        // Create transaction record with negative amount
        const creditTransaction = await tx.creditTransaction.create({
          data: {
            userId,
            type,
            amount: -amount, // Negative for deductions
            balanceBefore,
            balanceAfter,
            orderId,
          },
        });

        return creditTransaction;
      });

      logger.info('Credit deducted successfully', {
        userId,
        amount,
        type,
        transactionId: transaction.id,
        orderId,
      });

      // Audit log for compliance
      await auditLog(
        'credit_deducted',
        'credit_transaction',
        transaction.id,
        {
          type,
          amount: -amount,
          balanceBefore: transaction.balanceBefore,
          balanceAfter: transaction.balanceAfter,
          orderId,
        },
        userId
      );

      return transaction;
    } catch (error) {
      logger.error('Failed to deduct credit', {
        userId,
        amount,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // History Methods
  // ===========================================================================

  /**
   * Get credit transaction history with pagination
   * Ordered by createdAt DESC (newest first)
   */
  async getHistory(
    userId: string,
    page: number = 1,
    limit: number = 10
  ): Promise<CreditHistoryResult> {
    try {
      // Input validation
      const validPage = Math.max(1, page);
      const validLimit = Math.min(Math.max(1, limit), 50); // Max 50 per page
      const skip = (validPage - 1) * validLimit;

      const [transactions, total] = await Promise.all([
        prisma.creditTransaction.findMany({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          skip,
          take: validLimit,
        }),
        prisma.creditTransaction.count({
          where: { userId },
        }),
      ]);

      return {
        transactions,
        total,
      };
    } catch (error) {
      logger.error('Failed to get credit history', {
        userId,
        page,
        limit,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  // ===========================================================================
  // Validation Methods
  // ===========================================================================

  /**
   * Check if amount is a valid top-up package
   */
  isValidTopUpAmount(amount: number): boolean {
    return this.TOP_UP_PACKAGES.includes(amount);
  }
}

// Export singleton instance
export const creditService = new CreditService();
