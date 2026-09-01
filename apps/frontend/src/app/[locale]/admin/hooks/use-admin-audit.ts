"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export interface AuditLogItem {
  id: string
  action: string
  entityType: string
  entityId: string
  details: unknown
  ipAddress: string | null
  timestamp: string
  user: {
    id: string
    name: string
    email: string
  } | null
}

export interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export interface AuditLogsQuery {
  page?: number
  limit?: number
  action?: string
  userId?: string
  entityType?: string
  startDate?: string
  endDate?: string
  search?: string
}

interface UseAdminAuditReturn {
  logs: AuditLogItem[]
  pagination: Pagination | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  setQuery: (query: AuditLogsQuery) => void
  query: AuditLogsQuery
}

export function useAdminAudit(initialQuery: AuditLogsQuery = {}): UseAdminAuditReturn {
  const [logs, setLogs] = useState<AuditLogItem[]>([])
  const [pagination, setPagination] = useState<Pagination | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState<AuditLogsQuery>(initialQuery)

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const params = new URLSearchParams()
      if (query.page) params.set("page", query.page.toString())
      if (query.limit) params.set("limit", query.limit.toString())
      if (query.action) params.set("action", query.action)
      if (query.userId) params.set("userId", query.userId)
      if (query.entityType) params.set("entityType", query.entityType)
      if (query.startDate) params.set("startDate", query.startDate)
      if (query.endDate) params.set("endDate", query.endDate)
      if (query.search) params.set("search", query.search)

      const response = await fetch(`${API_URL}/api/v1/admin/audit?${params}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access audit logs")
        }
        throw new Error("Failed to fetch audit logs")
      }

      const data = await response.json()

      if (data.success && data.data) {
        setLogs(data.data.logs)
        setPagination(data.data.pagination)
      } else {
        throw new Error(data.error?.message || "Failed to fetch audit logs")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [query])

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  return {
    logs,
    pagination,
    isLoading,
    error,
    refetch: fetchLogs,
    setQuery,
    query,
  }
}

interface UseAuditFiltersReturn {
  actions: string[]
  entityTypes: string[]
  isLoading: boolean
}

export function useAuditFilters(): UseAuditFiltersReturn {
  const [actions, setActions] = useState<string[]>([])
  const [entityTypes, setEntityTypes] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function fetchFilters() {
      try {
        const [actionsRes, entitiesRes] = await Promise.all([
          fetch(`${API_URL}/api/v1/admin/audit/actions`, { credentials: "include" }),
          fetch(`${API_URL}/api/v1/admin/audit/entities`, { credentials: "include" }),
        ])

        if (actionsRes.ok) {
          const data = await actionsRes.json()
          if (data.success) setActions(data.data)
        }

        if (entitiesRes.ok) {
          const data = await entitiesRes.json()
          if (data.success) setEntityTypes(data.data)
        }
      } catch {
        // Silently fail - filters will just be empty
      } finally {
        setIsLoading(false)
      }
    }

    fetchFilters()
  }, [])

  return { actions, entityTypes, isLoading }
}
