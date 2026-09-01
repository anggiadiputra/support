/**
 * Admin Affiliate API Client
 *
 * API client for admin affiliate management endpoints.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

// =============================================================================
// Types
// =============================================================================

export interface AdminAffiliate {
  id: string
  user: {
    id: string
    name: string
    email: string
  }
  referralCode: string
  isActive: boolean
  tier: "STANDARD" | "SILVER" | "GOLD" | "PLATINUM"
  commissionRate: number
  customCommission: number | null
  totalEarnings: number
  totalReferrals: number
  pendingEarnings: number
  createdAt: string
}

export interface AdminAffiliatesData {
  affiliates: AdminAffiliate[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface AdminCommission {
  id: string
  affiliate: {
    id: string
    user: {
      id: string
      name: string
      email: string
    }
  }
  referredUserId: string
  orderId: string
  transactionType: "SUBSCRIPTION" | "TOP_UP"
  transactionAmount: number
  commissionPercentage: number
  commissionAmount: number
  status: "PENDING" | "CREDITED" | "CANCELLED"
  releaseAt: string
  creditedAt: string | null
  cancelledAt: string | null
  cancelledBy: string | null
  releasedBy: string | null
  createdAt: string
}

export interface AdminCommissionsData {
  commissions: AdminCommission[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface AffiliateSettingsData {
  isEnabled: boolean
  holdingPeriodDays: number
  commissionPercentage: number
  referredUserBonusEnabled: boolean
  referredUserBonusAmount: number
}

// =============================================================================
// API Functions
// =============================================================================

export const adminAffiliateApi = {
  /**
   * Get all affiliates
   */
  async getAffiliates(params: {
    page?: number
    limit?: number
    search?: string
    isActive?: boolean
  }): Promise<AdminAffiliatesData> {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.append("page", String(params.page))
    if (params.limit) searchParams.append("limit", String(params.limit))
    if (params.search) searchParams.append("search", params.search)
    if (params.isActive !== undefined)
      searchParams.append("isActive", String(params.isActive))

    const response = await fetch(
      `${API_URL}/api/v1/admin/affiliates?${searchParams}`,
      {
        method: "GET",
        credentials: "include",
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch affiliates")
    }
    return result.data
  },

  /**
   * Update affiliate
   */
  async updateAffiliate(
    id: string,
    data: {
      tier?: string
      isActive?: boolean
      customCommission?: number | null
    }
  ): Promise<AdminAffiliate> {
    const response = await fetch(`${API_URL}/api/v1/admin/affiliates/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(data),
    })

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to update affiliate")
    }
    return result.data
  },

  /**
   * Get all commissions
   */
  async getCommissions(params: {
    page?: number
    limit?: number
    status?: "PENDING" | "CREDITED" | "CANCELLED"
    affiliateId?: string
    search?: string
  }): Promise<AdminCommissionsData> {
    const searchParams = new URLSearchParams()
    if (params.page) searchParams.append("page", String(params.page))
    if (params.limit) searchParams.append("limit", String(params.limit))
    if (params.status) searchParams.append("status", params.status)
    if (params.affiliateId)
      searchParams.append("affiliateId", params.affiliateId)
    if (params.search) searchParams.append("search", params.search)

    const response = await fetch(
      `${API_URL}/api/v1/admin/affiliates/commissions?${searchParams}`,
      {
        method: "GET",
        credentials: "include",
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch commissions")
    }
    return result.data
  },

  /**
   * Release commission early
   */
  async releaseCommission(id: string): Promise<AdminCommission> {
    const response = await fetch(
      `${API_URL}/api/v1/admin/affiliates/commissions/${id}/release`,
      {
        method: "POST",
        credentials: "include",
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to release commission")
    }
    return result.data
  },

  /**
   * Cancel commission
   */
  async cancelCommission(id: string): Promise<AdminCommission> {
    const response = await fetch(
      `${API_URL}/api/v1/admin/affiliates/commissions/${id}/cancel`,
      {
        method: "POST",
        credentials: "include",
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to cancel commission")
    }
    return result.data
  },

  /**
   * Get affiliate settings
   */
  async getSettings(): Promise<AffiliateSettingsData> {
    const response = await fetch(
      `${API_URL}/api/v1/admin/affiliates/settings`,
      {
        method: "GET",
        credentials: "include",
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch settings")
    }
    return result.data
  },

  /**
   * Update affiliate settings
   */
  async updateSettings(
    data: Partial<AffiliateSettingsData>
  ): Promise<AffiliateSettingsData> {
    const response = await fetch(
      `${API_URL}/api/v1/admin/affiliates/settings`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(data),
      }
    )

    const result = await response.json()
    if (!result.success) {
      throw new Error(result.error?.message || "Failed to update settings")
    }
    return result.data
  },
}
