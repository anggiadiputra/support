"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

type SettingCategory = "whatsapp" | "instagram" | "messenger" | "smtp" | "openai" | "duitku" | "xendit"

interface UseAdminSettingsReturn<T> {
  settings: T | null
  source: "database" | "env" | null
  isLoading: boolean
  error: string | null
  updateSettings: (data: T) => Promise<{ success: boolean; message: string }>
  testConnection: (testEmail?: string) => Promise<{ success: boolean; message: string }>
  resetToDefault: () => Promise<{ success: boolean; message: string }>
  refetch: () => Promise<void>
  isUpdating: boolean
  isTesting: boolean
  isResetting: boolean
}

/**
 * Hook for managing admin settings by category
 * 
 * Features:
 * - Fetch settings by category
 * - Handle loading and error states
 * - Provide updateSettings mutation
 * - Provide testConnection mutation
 * - Provide resetToDefault mutation
 * 
 * Requirements: 7.2, 7.3
 */
export function useAdminSettings<T>(category: SettingCategory): UseAdminSettingsReturn<T> {
  const [settings, setSettings] = useState<T | null>(null)
  const [source, setSource] = useState<"database" | "env" | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [isResetting, setIsResetting] = useState(false)

  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/${category}`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access settings")
        }
        throw new Error("Failed to fetch settings")
      }

      const result = await response.json()

      if (result.success && result.data) {
        setSettings(result.data.data as T)
        setSource(result.data.source)
      } else {
        throw new Error(result.error?.message || "Failed to fetch settings")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [category])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const updateSettings = useCallback(
    async (data: T): Promise<{ success: boolean; message: string }> => {
      try {
        setIsUpdating(true)
        setError(null)

        const response = await fetch(`${API_URL}/api/v1/admin/settings/${category}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(data),
        })

        const result = await response.json()

        if (!response.ok) {
          return {
            success: false,
            message: result.error?.message || "Failed to update settings",
          }
        }

        // Refetch to get updated masked values
        await fetchSettings()

        return {
          success: true,
          message: result.message || "Settings updated successfully",
        }
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : "An error occurred",
        }
      } finally {
        setIsUpdating(false)
      }
    },
    [category, fetchSettings]
  )

  const testConnection = useCallback(
    async (testEmail?: string): Promise<{ success: boolean; message: string }> => {
      try {
        setIsTesting(true)

        const body = testEmail ? { testEmail } : undefined

        const response = await fetch(`${API_URL}/api/v1/admin/settings/${category}/test`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: body ? JSON.stringify(body) : undefined,
        })

        const result = await response.json()

        return {
          success: result.success,
          message: result.message || (result.success ? "Connection successful" : "Connection failed"),
        }
      } catch (err) {
        return {
          success: false,
          message: err instanceof Error ? err.message : "An error occurred",
        }
      } finally {
        setIsTesting(false)
      }
    },
    [category]
  )

  const resetToDefault = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      setIsResetting(true)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/${category}/reset`, {
        method: "POST",
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        return {
          success: false,
          message: result.error?.message || "Failed to reset settings",
        }
      }

      // Refetch to get updated values
      await fetchSettings()

      return {
        success: true,
        message: result.message || "Settings reset to defaults",
      }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      }
    } finally {
      setIsResetting(false)
    }
  }, [category, fetchSettings])

  return {
    settings,
    source,
    isLoading,
    error,
    updateSettings,
    testConnection,
    resetToDefault,
    refetch: fetchSettings,
    isUpdating,
    isTesting,
    isResetting,
  }
}
