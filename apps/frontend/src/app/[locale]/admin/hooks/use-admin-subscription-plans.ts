"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export interface DurationConfig {
  months: number        // 1, 3, 6, or 12
  days: number          // 30, 90, 180, or 365
  discountPercent: number // 0-100
  enabled: boolean
  label: string         // "1 Bulan", "3 Bulan", etc.
}

export interface ChannelLimits {
  maxWhatsappDevices: number
  maxInstagramAccounts: number
  maxMessengerAccounts: number
}

export interface NumericLimits {
  maxAgents: number
  maxKnowledgeDocs: number
  maxTeamMembers: number
  maxApiKeys: number
  maxWebhookEndpoints: number
  messageRetentionDays: number
}

export interface PlanConfig {
  name: string
  description: string
  price: number
  features: string[]
  durations?: DurationConfig[]
  enabled: boolean          // Whether the plan is available for purchase
  isContactUs: boolean      // Show "Contact Us" instead of price
  contactUrl: string        // URL for Contact Us button
  channelLimits?: ChannelLimits  // Channel connection limits
  numericLimits?: NumericLimits  // Numeric limits (AI agents, knowledge docs, etc.)
}

export interface SubscriptionPlansConfig {
  free: PlanConfig
  basic: PlanConfig
  lite: PlanConfig
  pro: PlanConfig
}

export type PlanTier = "free" | "basic" | "lite" | "pro"

interface UseAdminSubscriptionPlansReturn {
  plans: SubscriptionPlansConfig | null
  isLoading: boolean
  error: string | null
  updatePlan: (tier: PlanTier, config: PlanConfig) => Promise<{ success: boolean; message: string }>
  updateDurations: (tier: PlanTier, durations: DurationConfig[]) => Promise<{ success: boolean; message: string }>
  refetch: () => Promise<void>
  isUpdating: boolean
}

/**
 * Hook for managing admin subscription plans configuration
 * 
 * Features:
 * - Fetch all plans configuration
 * - Update individual plan
 * - Handle loading and error states
 * 
 * Requirements: 1.1, 2.4
 */
export function useAdminSubscriptionPlans(): UseAdminSubscriptionPlansReturn {
  const [plans, setPlans] = useState<SubscriptionPlansConfig | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)

  const fetchPlans = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/subscription-plans`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access subscription plans")
        }
        throw new Error("Failed to fetch subscription plans")
      }

      const result = await response.json()

      if (result.success && result.data) {
        setPlans(result.data)
      } else {
        throw new Error(result.error?.message || "Failed to fetch subscription plans")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchPlans()
  }, [fetchPlans])

  const updatePlan = useCallback(
    async (tier: PlanTier, config: PlanConfig): Promise<{ success: boolean; message: string }> => {
      try {
        setIsUpdating(true)
        setError(null)

        const response = await fetch(`${API_URL}/api/v1/admin/subscription-plans/${tier}`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(config),
        })

        const result = await response.json()

        if (!response.ok) {
          return {
            success: false,
            message: result.error?.message || "Failed to update plan",
          }
        }

        // Refetch to get updated values
        await fetchPlans()

        return {
          success: true,
          message: result.message || "Plan updated successfully",
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
    [fetchPlans]
  )

  const updateDurations = useCallback(
    async (tier: PlanTier, durations: DurationConfig[]): Promise<{ success: boolean; message: string }> => {
      try {
        setIsUpdating(true)
        setError(null)

        const response = await fetch(`${API_URL}/api/v1/admin/subscription-plans/${tier}/durations`, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify({ durations }),
        })

        const result = await response.json()

        if (!response.ok) {
          return {
            success: false,
            message: result.error?.message || "Failed to update durations",
          }
        }

        // Refetch to get updated values
        await fetchPlans()

        return {
          success: true,
          message: result.message || "Durations updated successfully",
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
    [fetchPlans]
  )

  return {
    plans,
    isLoading,
    error,
    updatePlan,
    updateDurations,
    refetch: fetchPlans,
    isUpdating,
  }
}
