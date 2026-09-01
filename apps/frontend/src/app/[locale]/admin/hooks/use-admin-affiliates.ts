"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export type AffiliateTier = "STANDARD" | "SILVER" | "GOLD" | "PLATINUM"

export interface AdminAffiliate {
  id: string
  referralCode: string
  isActive: boolean
  tier: AffiliateTier
  customCommission: number | null
  totalEarnings: number
  totalReferrals: number
  pendingAmount: number
  createdAt: string
  user: {
    id: string
    name: string
    email: string
  }
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AdminAffiliatesQuery {
  page?: number
  limit?: number
  search?: string
  isActive?: boolean
}

export interface UpdateAffiliateData {
  tier?: AffiliateTier
  isActive?: boolean
  customCommission?: number | null
}

interface UseAdminAffiliatesReturn {
  affiliates: AdminAffiliate[]
  pagination: Pagination | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  setQuery: (query: AdminAffiliatesQuery) => void
  query: AdminAffiliatesQuery
  updateAffiliate: (id: string, data: UpdateAffiliateData) => Promise<void>
  isUpdating: boolean
}

export function useAdminAffiliates(initialQuery: AdminAffiliatesQuery = {}): UseAdminAffiliatesReturn {
  const [affiliates, setAffiliates] = useState<AdminAffiliate[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<AdminAffiliatesQuery>(initialQuery)
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchAffiliates = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (query.page) params.set("page", query.page.toString())
      if (query.limit) params.set("limit", query.limit.toString())
      if (query.search) params.set("search", query.search)
      if (query.isActive !== undefined) params.set("isActive", query.isActive.toString())

      const response = await fetch(`${API_URL}/api/v1/admin/affiliates?${params}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access affiliate management")
        }
        throw new Error("Failed to fetch affiliates")
      }

      const data = await response.json()

      if (data.success && data.data) {
        setAffiliates(data.data.affiliates)
        setPagination(data.data.pagination)
      } else {
        throw new Error(data.error?.message || "Failed to fetch affiliates")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [query])

  const updateAffiliate = useCallback(
    async (id: string, data: UpdateAffiliateData): Promise<void> => {
      setIsUpdating(true)
      try {
        const response = await fetch(`${API_URL}/api/v1/admin/affiliates/${id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.error?.message || "Failed to update affiliate")
        }

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error?.message || "Failed to update affiliate")
        }

        // Refresh the list after update
        await fetchAffiliates()
      } finally {
        setIsUpdating(false)
      }
    },
    [fetchAffiliates]
  )

  useEffect(() => {
    fetchAffiliates()
  }, [fetchAffiliates])

  return {
    affiliates,
    pagination,
    isLoading,
    error,
    refetch: fetchAffiliates,
    setQuery,
    query,
    updateAffiliate,
    isUpdating,
  }
}
