import { prisma } from '../../utils/database.js'
import type { SubscriptionTier, SubscriptionStatus } from '@prisma/client'

// Response interfaces
export interface SubscriptionStats {
  byTier: {
    FREE: number
    LITE: number
    PRO: number
  }
  byStatus: {
    ACTIVE: number
    PENDING_PAYMENT: number
    EXPIRED: number
    CANCELLED: number
  }
  total: number
}

export interface PendingPayment {
  id: string
  userId: string
  userName: string
  userEmail: string
  tier: SubscriptionTier
  paymentProof: string | null
  notes: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ExpiringSubscription {
  id: string
  userId: string
  userName: string
  userEmail: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  endDate: Date
  daysUntilExpiry: number
}

export interface UpdateSubscriptionRequest {
  tier?: SubscriptionTier
  status?: SubscriptionStatus
  endDate?: string
  notes?: string
}


export class AdminSubscriptionService {
  /**
   * Get subscription statistics by tier counts
   * Requirements: 4.1
   */
  static async getSubscriptionStats(): Promise<SubscriptionStats> {
    const [
      freeCount,
      liteCount,
      proCount,
      activeCount,
      pendingPaymentCount,
      expiredCount,
      cancelledCount,
      total
    ] = await Promise.all([
      // By tier
      prisma.subscription.count({ where: { tier: 'FREE' } }),
      prisma.subscription.count({ where: { tier: 'LITE' } }),
      prisma.subscription.count({ where: { tier: 'PRO' } }),
      // By status
      prisma.subscription.count({ where: { status: 'ACTIVE' } }),
      // Count pending from PaymentTransaction table (same as revenue dashboard)
      prisma.paymentTransaction.count({ where: { status: 'PENDING' } }),
      prisma.subscription.count({ where: { status: 'EXPIRED' } }),
      // Count cancelled from PaymentTransaction table (same as revenue dashboard)
      prisma.paymentTransaction.count({ 
        where: { 
          status: { in: ['CANCELLED', 'EXPIRED'] }
        } 
      }),
      // Total
      prisma.subscription.count()
    ])

    return {
      byTier: {
        FREE: freeCount,
        LITE: liteCount,
        PRO: proCount
      },
      byStatus: {
        ACTIVE: activeCount,
        PENDING_PAYMENT: pendingPaymentCount,
        EXPIRED: expiredCount,
        CANCELLED: cancelledCount
      },
      total
    }
  }


  /**
   * Get list of subscriptions with pending payment status
   * Requirements: 4.2
   */
  static async getPendingPayments(): Promise<PendingPayment[]> {
    const subscriptions = await prisma.subscription.findMany({
      where: { status: 'PENDING_PAYMENT' },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { updatedAt: 'desc' }
    })

    return subscriptions.map(sub => ({
      id: sub.id,
      userId: sub.userId,
      userName: sub.user.name,
      userEmail: sub.user.email,
      tier: sub.tier,
      paymentProof: sub.paymentProof,
      notes: sub.notes,
      createdAt: sub.createdAt,
      updatedAt: sub.updatedAt
    }))
  }

  /**
   * Get list of subscriptions expiring within 30 days
   * Requirements: 4.3
   */
  static async getExpiringSubscriptions(daysAhead: number = 30): Promise<ExpiringSubscription[]> {
    const now = new Date()
    const futureDate = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000)

    const subscriptions = await prisma.subscription.findMany({
      where: {
        status: 'ACTIVE',
        endDate: {
          not: null,
          gte: now,
          lte: futureDate
        }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      },
      orderBy: { endDate: 'asc' }
    })

    return subscriptions.map(sub => {
      const endDate = sub.endDate as Date
      const daysUntilExpiry = Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000))
      
      return {
        id: sub.id,
        userId: sub.userId,
        userName: sub.user.name,
        userEmail: sub.user.email,
        tier: sub.tier,
        status: sub.status,
        endDate,
        daysUntilExpiry
      }
    })
  }

  /**
   * Update subscription with audit logging
   * Requirements: 4.4, 4.5, 4.6
   */
  static async updateSubscription(
    userId: string,
    data: UpdateSubscriptionRequest,
    adminUserId: string
  ): Promise<{ success: boolean; subscription?: any; error?: string }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { subscription: true }
    })

    if (!user) {
      return { success: false, error: 'User not found' }
    }

    const changes: string[] = []
    const updateData: any = {}

    // Track tier change
    if (data.tier !== undefined) {
      updateData.tier = data.tier
      changes.push(`tier: ${user.subscription?.tier || 'none'} → ${data.tier}`)
    }

    // Track status change (for payment approval)
    if (data.status !== undefined) {
      updateData.status = data.status
      changes.push(`status: ${user.subscription?.status || 'none'} → ${data.status}`)
    }

    // Track end date extension
    if (data.endDate !== undefined) {
      updateData.endDate = new Date(data.endDate)
      changes.push(`endDate: ${user.subscription?.endDate || 'none'} → ${data.endDate}`)
    }

    // Notes update
    if (data.notes !== undefined) {
      updateData.notes = data.notes
    }

    // Upsert subscription and create audit log in transaction
    const [subscription] = await prisma.$transaction([
      prisma.subscription.upsert({
        where: { userId },
        create: {
          userId,
          tier: data.tier || 'FREE',
          status: data.status || 'ACTIVE',
          endDate: data.endDate ? new Date(data.endDate) : null,
          notes: data.notes
        },
        update: updateData
      }),
      prisma.auditLog.create({
        data: {
          userId: adminUserId,
          action: 'SUBSCRIPTION_UPDATED',
          entityType: 'Subscription',
          entityId: userId,
          details: {
            targetUserId: userId,
            changes,
            updatedFields: updateData
          }
        }
      }),
// Also update the user's subscriptionTier field for quick access
      ...(data.tier ? [
        prisma.user.update({
          where: { id: userId },
          data: { subscriptionTier: data.tier }
        })
      ] : [])
    ])

    // IMPORTANT: Invalidate subscription cache so API returns fresh data immediately
    const { invalidateSubscriptionCache } = await import('../../middleware/subscription.js');
    await invalidateSubscriptionCache(userId);

    return { success: true, subscription }
  }

  /**
   * Approve a pending payment - sets status to ACTIVE
   * Requirements: 4.4
   */
  static async approvePayment(
    userId: string,
    adminUserId: string,
    notes?: string
  ): Promise<{ success: boolean; subscription?: any; error?: string }> {
    const subscription = await prisma.subscription.findUnique({
      where: { userId }
    })

    if (!subscription) {
      return { success: false, error: 'Subscription not found' }
    }

    if (subscription.status !== 'PENDING_PAYMENT') {
      return { success: false, error: 'Subscription is not pending payment' }
    }

    return this.updateSubscription(
      userId,
      { status: 'ACTIVE', notes: notes || `Payment approved by admin` },
      adminUserId
    )
  }
}
