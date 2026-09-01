"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export type Role = "ADMIN" | "BUSINESS_OWNER" | "AGENT"
export type SubscriptionTier = "FREE" | "LITE" | "PRO"
export type UserStatus = "active" | "inactive"

export interface AdminUser {
  id: string
  email: string
  name: string
  role: Role
  isActive: boolean
  subscriptionTier: string
  wabaConnectionStatus: string | null
  createdAt: string
  lastLoginAt: string | null
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AdminUsersQuery {
  page?: number
  limit?: number
  search?: string
  role?: Role
  tier?: SubscriptionTier
  status?: UserStatus
}

interface BulkUpdateResult {
  updated: number
  failed: string[]
}

interface UseAdminUsersReturn {
  users: AdminUser[]
  pagination: Pagination | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  setQuery: (query: AdminUsersQuery) => void
  query: AdminUsersQuery
  bulkUpdate: (userIds: string[], action: 'activate' | 'deactivate') => Promise<BulkUpdateResult>
  isBulkUpdating: boolean
}

export function useAdminUsers(initialQuery: AdminUsersQuery = {}): UseAdminUsersReturn {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<AdminUsersQuery>(initialQuery)
  const [isBulkUpdating, setIsBulkUpdating] = useState(false)

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (query.page) params.set("page", query.page.toString())
      if (query.limit) params.set("limit", query.limit.toString())
      if (query.search) params.set("search", query.search)
      if (query.role) params.set("role", query.role)
      if (query.tier) params.set("tier", query.tier)
      if (query.status) params.set("status", query.status)

      const response = await fetch(`${API_URL}/api/v1/admin/users?${params}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access user management")
        }
        throw new Error("Failed to fetch users")
      }

      const data = await response.json()

      if (data.success && data.data) {
        setUsers(data.data.users)
        setPagination(data.data.pagination)
      } else {
        throw new Error(data.error?.message || "Failed to fetch users")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [query])

  const bulkUpdate = useCallback(async (userIds: string[], action: 'activate' | 'deactivate'): Promise<BulkUpdateResult> => {
    setIsBulkUpdating(true)
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/users/bulk`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userIds, action })
      })

      if (!response.ok) {
        throw new Error('Failed to bulk update users')
      }

      const data = await response.json()
      
      if (data.success) {
        // Refresh the list after bulk update
        await fetchUsers()
        return data.data
      }
      
      throw new Error(data.error?.message || 'Failed to bulk update users')
    } finally {
      setIsBulkUpdating(false)
    }
  }, [fetchUsers])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  return {
    users,
    pagination,
    isLoading,
    error,
    refetch: fetchUsers,
    setQuery,
    query,
    bulkUpdate,
    isBulkUpdating,
  }
}
