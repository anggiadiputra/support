"use client"

import { useState, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

// Types for WABA Health Status
export type WABAHealthStatus =
  | "ACTIVE"
  | "RESTRICTED"
  | "UNDER_REVIEW"
  | "FLAGGED"
  | "DISABLED"

export interface AccountHealthInfo {
  status: WABAHealthStatus
  restrictionType: string | null
  errorCode: number | null
  errorMessage: string | null
  detectedAt: string | null
  detectedFrom: string | null
}

// Types for WABA & Channels
export interface UserWABAInfo {
  whatsappAccounts: {
    id: string
    wabaId: string
    wabaName: string | null
    connectionStatus: string
    connectedAt: string
    lastSyncAt: string | null
    tokenExpiresAt: string | null
    phoneNumbers: {
      id: string
      phoneNumberId: string
      displayPhoneNumber: string
      verifiedName: string | null
      qualityRating: string | null
      isPrimary: boolean
    }[]
  }[]
  accountHealth: AccountHealthInfo | null
  instagramAccounts: {
    id: string
    username: string
    connectionStatus: string
    connectedAt: string
    tokenExpiresAt: string | null
  }[]
  facebookPages: {
    id: string
    pageName: string
    connectionStatus: string
    connectedAt: string
  }[]
}

// Types for Templates
export interface UserTemplateInfo {
  templates: {
    id: string
    name: string
    status: string
    category: string
    language: string
    createdAt: string
  }[]
  summary: {
    total: number
    approved: number
    pending: number
    rejected: number
  }
}

// Types for Message Stats
export interface UserMessageStats {
  period: {
    days: number
    startDate: string
    endDate: string
  }
  totals: {
    sent: number
    delivered: number
    read: number
    failed: number
  }
  bySource: {
    api: number
    instagram: number
  }
  daily: {
    date: string
    sent: number
    delivered: number
    failed: number
  }[]
}

// Hook for fetching user WABA info
export function useUserWABAInfo(userId: string) {
  const [data, setData] = useState<UserWABAInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/waba`,
        { credentials: "include" }
      )

      if (!response.ok) {
        throw new Error("Failed to fetch WABA info")
      }

      const result = await response.json()
      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error?.message || "Failed to fetch WABA info")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return { data, isLoading, error, fetch }
}

// Hook for manually checking WABA health status
export function useCheckWABAHealth(userId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkHealth = useCallback(async (): Promise<{
    success: boolean
    accountHealth?: AccountHealthInfo
  }> => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/waba-health/check`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || "Failed to check WABA health")
      }

      const result = await response.json()
      return { success: true, accountHealth: result.data?.accountHealth }
    } catch (err) {
      const message = err instanceof Error ? err.message : "An error occurred"
      setError(message)
      return { success: false }
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return { isLoading, error, checkHealth }
}

// Hook for fetching user templates
export function useUserTemplates(userId: string) {
  const [data, setData] = useState<UserTemplateInfo | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/templates`,
        { credentials: "include" }
      )

      if (!response.ok) {
        throw new Error("Failed to fetch templates")
      }

      const result = await response.json()
      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error?.message || "Failed to fetch templates")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return { data, isLoading, error, fetch }
}

// Hook for fetching user message stats
export function useUserMessageStats(userId: string, days: number = 30) {
  const [data, setData] = useState<UserMessageStats | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/message-stats?days=${days}`,
        { credentials: "include" }
      )

      if (!response.ok) {
        throw new Error("Failed to fetch message stats")
      }

      const result = await response.json()
      if (result.success) {
        setData(result.data)
      } else {
        throw new Error(result.error?.message || "Failed to fetch message stats")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [userId, days])

  return { data, isLoading, error, fetch }
}

// Hook for support actions
export function useUserSupportActions(userId: string) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resetApiKeys = useCallback(async (): Promise<{ success: boolean; revokedCount?: number }> => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/reset-api-keys`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || "Failed to reset API keys")
      }

      const result = await response.json()
      return { success: true, revokedCount: result.data?.revokedCount }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      return { success: false }
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const syncTemplates = useCallback(async (): Promise<{ success: boolean; syncedCount?: number }> => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/sync-templates`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || "Failed to sync templates")
      }

      const result = await response.json()
      return { success: true, syncedCount: result.data?.syncedCount }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      return { success: false }
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const clearCache = useCallback(async (): Promise<{ success: boolean; clearedKeys?: number }> => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await globalThis.fetch(
        `${API_URL}/api/v1/admin/users/${userId}/clear-cache`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      if (!response.ok) {
        const result = await response.json()
        throw new Error(result.error?.message || "Failed to clear cache")
      }

      const result = await response.json()
      return { success: true, clearedKeys: result.data?.clearedKeys }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
      return { success: false }
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  return {
    isLoading,
    error,
    resetApiKeys,
    syncTemplates,
    clearCache,
  }
}
