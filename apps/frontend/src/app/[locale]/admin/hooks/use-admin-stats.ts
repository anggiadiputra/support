"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface UserStats {
  total: number
  activeLastWeek: number
  byRole: {
    ADMIN: number
    BUSINESS_OWNER: number
    AGENT: number
  }
  byTier: {
    FREE: number
    LITE: number
    PRO: number
  }
}

interface MessageStats {
  total: number
  today: number
  thisWeek: number
  thisMonth: number
  byChannel: {
    whatsapp: number
    instagram: number
    messenger: number
  }
  deliveryRate: number
}

interface ConnectionStats {
  activeWebsockets: number
  onlineUsers: number
  wabaConnected: number
  wabaDisconnected: number
  wabaPending: number
  instagramConnected: number
  messengerConnected: number
}

interface AdminStats {
  users: UserStats
  messages: MessageStats
  connections: ConnectionStats
}

interface UseAdminStatsReturn {
  stats: AdminStats | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useAdminStats(): UseAdminStatsReturn {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchStats = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/stats`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access admin statistics")
        }
        throw new Error("Failed to fetch admin statistics")
      }

      const data = await response.json()
      
      if (data.success && data.data) {
        setStats(data.data)
      } else {
        throw new Error(data.error?.message || "Failed to fetch admin statistics")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStats()
  }, [fetchStats])

  return {
    stats,
    isLoading,
    error,
    refetch: fetchStats,
  }
}

interface MessageVolumeData {
  date: string
  messages: number
}

interface UseMessageVolumeReturn {
  data: MessageVolumeData[]
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useMessageVolume(days: number = 30): UseMessageVolumeReturn {
  const [data, setData] = useState<MessageVolumeData[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/stats/message-volume?days=${days}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access message volume")
        }
        throw new Error("Failed to fetch message volume")
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        setData(result.data)
      } else {
        throw new Error(result.error?.message || "Failed to fetch message volume")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [days])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return {
    data,
    isLoading,
    error,
    refetch: fetchData,
  }
}
