"use client"

import { useState, useEffect, useCallback } from "react"
import type { Role, SubscriptionTier } from "./use-admin-users"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export type SubscriptionStatus = "ACTIVE" | "PENDING_PAYMENT" | "EXPIRED" | "CANCELLED"

export interface UserDetail {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  subscriptionTier: string
  wabaConnectionStatus: string | null
  createdAt: string
  lastLoginAt: string | null
  emailVerified: boolean
  phoneNumberId: string | null
  wabaId: string | null
}

export interface Subscription {
  id: string
  tier: SubscriptionTier
  status: SubscriptionStatus
  startDate: string
  endDate: string | null
  notes: string | null
}

export interface WabaStatus {
  wabaId: string | null
  phoneNumberId: string | null
  connectionStatus: string | null
  connectedAt: string | null
  lastSyncAt: string | null
}

export interface InstagramAccount {
  id: string
  username: string
  connectionStatus: string
  connectedAt: string
}

export interface AuditLogEntry {
  id: string
  action: string
  entityType: string
  entityId: string
  details: Record<string, unknown>
  timestamp: string
}

export interface AdminUserDetailResponse {
  user: UserDetail
  subscription: Subscription | null
  wabaStatus: WabaStatus | null
  instagramAccounts: InstagramAccount[]
  recentActivity: AuditLogEntry[]
}

interface UseAdminUserDetailReturn {
  data: AdminUserDetailResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  updateUser: (updates: { isActive?: boolean; role?: Role }) => Promise<boolean>
  updateSubscription: (updates: {
    tier?: SubscriptionTier
    status?: SubscriptionStatus
    endDate?: string
    notes?: string
  }) => Promise<boolean>
  isUpdating: boolean
}

export function useAdminUserDetail(userId: string): UseAdminUserDetailReturn {
  const [data, setData] = useState<AdminUserDetailResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isUpdating, setIsUpdating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchUserDetail = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/users/${userId}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("User not found")
        }
        if (response.status === 403) {
          throw new Error("You don't have permission to view this user")
        }
        throw new Error("Failed to fetch user details")
      }

      const result = await response.json()

      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error(result.error?.message || "Failed to fetch user details")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const updateUser = useCallback(
    async (updates: { isActive?: boolean; role?: Role }): Promise<boolean> => {
      try {
        setIsUpdating(true)
        setError(null)

        const response = await fetch(`${API_URL}/api/v1/admin/users/${userId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(updates),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error?.message || "Failed to update user")
        }

        await fetchUserDetail()
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred")
        return false
      } finally {
        setIsUpdating(false)
      }
    },
    [userId, fetchUserDetail]
  )

  const updateSubscription = useCallback(
    async (updates: {
      tier?: SubscriptionTier
      status?: SubscriptionStatus
      endDate?: string
      notes?: string
    }): Promise<boolean> => {
      try {
        setIsUpdating(true)
        setError(null)

        const response = await fetch(
          `${API_URL}/api/v1/admin/users/${userId}/subscription`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(updates),
          }
        )

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error?.message || "Failed to update subscription")
        }

        await fetchUserDetail()
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred")
        return false
      } finally {
        setIsUpdating(false)
      }
    },
    [userId, fetchUserDetail]
  )

  useEffect(() => {
    if (userId) {
      fetchUserDetail()
    }
  }, [userId, fetchUserDetail])

  return {
    data,
    isLoading,
    error,
    refetch: fetchUserDetail,
    updateUser,
    updateSubscription,
    isUpdating,
  }
}

// Activity categories for filtering
export const ACTIVITY_CATEGORIES = [
  { value: "", label: "Semua" },
  { value: "auth", label: "Auth" },
  { value: "messages", label: "Pesan" },
  { value: "templates", label: "Template" },
  { value: "waba", label: "WABA" },
  { value: "channels", label: "Channel" },
  { value: "api", label: "API" },
  { value: "customers", label: "Customer" },
  { value: "broadcast", label: "Broadcast" },
] as const

export interface ActivityFilters {
  page: number
  limit: number
  category: string
  startDate?: string
  endDate?: string
}

export interface ActivityPagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface UserActivityResponse {
  logs: AuditLogEntry[]
  pagination: ActivityPagination
}

interface UseUserActivityReturn {
  data: UserActivityResponse | null
  isLoading: boolean
  error: string | null
  filters: ActivityFilters
  setFilters: (filters: Partial<ActivityFilters>) => void
  refetch: () => Promise<void>
}

export function useUserActivity(userId: string): UseUserActivityReturn {
  const [data, setData] = useState<UserActivityResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFiltersState] = useState<ActivityFilters>({
    page: 1,
    limit: 20,
    category: "",
  })

  const setFilters = useCallback((newFilters: Partial<ActivityFilters>) => {
    setFiltersState((prev) => ({
      ...prev,
      ...newFilters,
      // Reset to page 1 when category changes
      page: newFilters.category !== undefined ? 1 : newFilters.page ?? prev.page,
    }))
  }, [])

  const fetchActivity = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams({
        page: String(filters.page),
        limit: String(filters.limit),
      })
      if (filters.category) params.set("category", filters.category)
      if (filters.startDate) params.set("startDate", filters.startDate)
      if (filters.endDate) params.set("endDate", filters.endDate)

      const response = await fetch(
        `${API_URL}/api/v1/admin/users/${userId}/activity?${params}`,
        { credentials: "include" }
      )

      if (!response.ok) {
        throw new Error("Failed to fetch activity")
      }

      const result = await response.json()
      if (result.success && result.data) {
        setData(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [userId, filters])

  useEffect(() => {
    if (userId) {
      fetchActivity()
    }
  }, [userId, fetchActivity])

  return {
    data,
    isLoading,
    error,
    filters,
    setFilters,
    refetch: fetchActivity,
  }
}
