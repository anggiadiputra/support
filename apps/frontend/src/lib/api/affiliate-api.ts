/**
 * Affiliate API Client
 *
 * API client for affiliate system endpoints: status, register, referrals, earnings, validation.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

// =============================================================================
// Types
// =============================================================================

export interface AffiliateData {
  id: string
  referralCode: string
  referralLink: string
  isActive: boolean
  tier: "STANDARD" | "SILVER" | "GOLD" | "PLATINUM"
  commissionRate: number
  totalEarnings: number
  totalReferrals: number
  createdAt: string
}

export interface AffiliateStatusData {
  isAffiliate: boolean
  affiliate?: AffiliateData
  isEnabled: boolean
}

export interface ReferredUser {
  id: string
  referredUser: {
    id: string
    name: string
    email: string
  }
  createdAt: string
}

export interface ReferralsData {
  referrals: ReferredUser[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface Commission {
  id: string
  transactionType: "SUBSCRIPTION" | "TOP_UP"
  transactionAmount: number
  commissionPercentage: number
  commissionAmount: number
  status: "PENDING" | "CREDITED" | "CANCELLED"
  releaseAt: string
  creditedAt: string | null
  createdAt: string
}

export interface EarningsSummary {
  totalEarnings: number
  pendingEarnings: number
  creditedEarnings: number
  totalReferrals: number
}

export interface EarningsData {
  summary: EarningsSummary
  commissions: Commission[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface ValidateCodeData {
  valid: boolean
  affiliateName: string | null
  bonusEnabled: boolean
  bonusAmount: number
}

// =============================================================================
// API Functions
// =============================================================================

export const affiliateApi = {
  /**
   * Get current user's affiliate status
   */
  async getStatus(): Promise<AffiliateStatusData> {
    const response = await fetch(`${API_URL}/api/v1/affiliate/status`, {
      method: "GET",
      credentials: "include",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch affiliate status")
    }

    return result.data
  },

  /**
   * Register as affiliate
   */
  async register(): Promise<AffiliateData> {
    const response = await fetch(`${API_URL}/api/v1/affiliate/register`, {
      method: "POST",
      credentials: "include",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to register as affiliate")
    }

    return result.data
  },

  /**
   * Get referrals list
   */
  async getReferrals(page: number = 1, limit: number = 10): Promise<ReferralsData> {
    const response = await fetch(
      `${API_URL}/api/v1/affiliate/referrals?page=${page}&limit=${limit}`,
      {
        method: "GET",
        credentials: "include",
      }
    )

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch referrals")
    }

    return result.data
  },

  /**
   * Get earnings summary and commission history
   */
  async getEarnings(
    page: number = 1,
    limit: number = 10,
    status?: "PENDING" | "CREDITED" | "CANCELLED"
  ): Promise<EarningsData> {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) })
    if (status) params.append("status", status)

    const response = await fetch(`${API_URL}/api/v1/affiliate/earnings?${params}`, {
      method: "GET",
      credentials: "include",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch earnings")
    }

    return result.data
  },

  /**
   * Validate referral code (public)
   */
  async validateCode(code: string): Promise<ValidateCodeData> {
    const response = await fetch(`${API_URL}/api/v1/affiliate/validate/${code}`, {
      method: "GET",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to validate code")
    }

    return result.data
  },
}
