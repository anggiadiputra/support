"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface DatabaseHealth {
  status: "healthy" | "unhealthy"
  latencyMs: number
  error?: string
}

interface RedisHealth {
  status: "healthy" | "unhealthy"
  latencyMs: number
  error?: string
}

interface QueueStats {
  pending: number
  active: number
  completed: number
  failed: number
  delayed: number
  byQueue: {
    webhook: { pending: number; active: number; completed: number; failed: number }
    message: { pending: number; active: number; completed: number; failed: number }
    webhookOutbound: { pending: number; active: number; completed: number; failed: number }
  }
}

interface WebsocketStats {
  activeConnections: number
  onlineUsers: number
}

interface WebhookStats {
  successRate24h: number
  totalDeliveries24h: number
  successCount24h: number
  failedCount24h: number
}

export interface SystemHealth {
  database: DatabaseHealth
  redis: RedisHealth
  queue: QueueStats
  websocket: WebsocketStats
  webhooks: WebhookStats
  overall: "healthy" | "degraded" | "unhealthy"
}

interface UseAdminHealthReturn {
  health: SystemHealth | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useAdminHealth(): UseAdminHealthReturn {
  const [health, setHealth] = useState<SystemHealth | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchHealth = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/health`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access system health")
        }
        throw new Error("Failed to fetch system health")
      }

      const data = await response.json()

      if (data.success && data.data) {
        setHealth(data.data)
      } else {
        throw new Error(data.error?.message || "Failed to fetch system health")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchHealth()
  }, [fetchHealth])

  return {
    health,
    isLoading,
    error,
    refetch: fetchHealth,
  }
}

// Failed Jobs Types
export interface FailedJobDetails {
  id: string | number
  name: string
  queue: string
  data: unknown
  failedReason: string | undefined
  stacktrace: string[] | undefined
  attemptsMade: number
  failedAt: string | undefined
}

export interface FailedJobsResponse {
  failedJobs: FailedJobDetails[]
  totalFailed: number
}

interface UseFailedJobsReturn {
  failedJobs: FailedJobsResponse | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  retryJob: (queue: string, jobId: string) => Promise<void>
  deleteJob: (queue: string, jobId: string) => Promise<void>
  deleteAllJobs: () => Promise<void>
}

export function useFailedJobs(limit: number = 20): UseFailedJobsReturn {
  const [failedJobs, setFailedJobs] = useState<FailedJobsResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFailedJobs = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/health/failed-jobs?limit=${limit}`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch failed jobs")
      }

      const data = await response.json()

      if (data.success && data.data) {
        setFailedJobs(data.data)
      } else {
        throw new Error(data.error?.message || "Failed to fetch failed jobs")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [limit])

  const retryJob = useCallback(async (queue: string, jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/health/failed-jobs/${queue}/${jobId}/retry`, {
        method: "POST",
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to retry job")
      }

      // Refresh failed jobs list
      await fetchFailedJobs()
    } catch (err) {
      throw err
    }
  }, [fetchFailedJobs])

  const deleteJob = useCallback(async (queue: string, jobId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/health/failed-jobs/${queue}/${jobId}`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to delete job')
      }

      // Refresh failed jobs list
      await fetchFailedJobs()
    } catch (err) {
      throw err
    }
  }, [fetchFailedJobs])

  const deleteAllJobs = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/health/failed-jobs`, {
        method: 'DELETE',
        credentials: 'include',
      })

      if (!response.ok) {
        throw new Error('Failed to delete all jobs')
      }

      // Refresh failed jobs list
      await fetchFailedJobs()
    } catch (err) {
      throw err
    }
  }, [fetchFailedJobs])

  useEffect(() => {
    fetchFailedJobs()
  }, [fetchFailedJobs])

  return {
    failedJobs,
    isLoading,
    error,
    refetch: fetchFailedJobs,
    retryJob,
    deleteJob,
    deleteAllJobs,
  }
}
