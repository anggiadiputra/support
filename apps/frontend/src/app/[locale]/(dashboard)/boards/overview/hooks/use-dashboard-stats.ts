/**
 * Dashboard Stats Hook (Wrapper)
 *
 * This hook wraps the centralized dashboard query hooks from @/hooks/use-dashboard-stats
 * to provide backward compatibility with existing components.
 *
 * Uses TanStack Query with proper cache configuration:
 * - staleTime: 2 minutes (data considered fresh)
 * - gcTime: 10 minutes (cache retention)
 * - Background refetch when data is stale
 * - Loading skeleton only shows on initial load, not background refetch
 *
 * Requirements: 2.1, 2.2, 2.3
 */

import { useQueryClient } from "@tanstack/react-query"
import { useCallback, useMemo } from "react"
import {
  useDashboardStats as useDashboardStatsQuery,
  useMessageVolume,
} from "@/hooks/use-dashboard-stats"
import { queryKeys } from "@/lib/query-keys"
import { useDashboardFilter, type DateRange } from "../context/dashboard-filter-context"
import type {
  EnhancedDashboardStats,
  MessageVolumeData,
} from "@/lib/api/dashboard-api"

export interface UseDashboardStatsReturn {
  stats: EnhancedDashboardStats | null
  messageVolume: MessageVolumeData[]
  isLoading: boolean
  isRefetching: boolean
  error: string | null
  refetch: () => Promise<void>
  lastUpdated: Date | null
}

export function useDashboardStats(filters?: { whatsappPhoneNumberId?: string }): UseDashboardStatsReturn {
  const queryClient = useQueryClient()
  const contextFilter = useDashboardFilter()

  // Use explicit filters if provided, otherwise fall back to context filter
  const baseFilters = filters ?? (contextFilter.whatsappPhoneNumberId
    ? { whatsappPhoneNumberId: contextFilter.whatsappPhoneNumberId }
    : undefined)

  // Get days and date range from context
  const { days, dateRange } = contextFilter

  // Add date range to filters
  const effectiveFilters = {
    ...baseFilters,
    startDate: dateRange.from.toISOString(),
    endDate: dateRange.to.toISOString(),
  }

  // Use centralized dashboard stats hook with proper cache config
  // Requirements: 2.1, 2.2
  const {
    data: stats,
    isLoading: isStatsLoading,
    isFetching: isStatsFetching,
    error: statsError,
    dataUpdatedAt: statsUpdatedAt,
  } = useDashboardStatsQuery(effectiveFilters)

  // Use centralized message volume hook with days parameter in cache key
  // Requirements: 2.1
  const {
    data: messageVolume,
    isLoading: isVolumeLoading,
    isFetching: isVolumeFetching,
    error: volumeError,
  } = useMessageVolume(days, baseFilters)

  // Refetch all dashboard data by invalidating queries
  // Requirements: 2.3
  const refetch = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
    ])
  }, [queryClient])

  // Compute last updated from query data
  const lastUpdated = useMemo(() => {
    return statsUpdatedAt ? new Date(statsUpdatedAt) : null
  }, [statsUpdatedAt])

  // Only show loading on initial load, not background refetch
  // Requirements: 2.2, 2.3
  const isLoading = isStatsLoading || isVolumeLoading
  const isRefetching = (isStatsFetching && !isStatsLoading) || (isVolumeFetching && !isVolumeLoading)

  // Combine errors
  const error = statsError
    ? (statsError as Error).message
    : volumeError
      ? (volumeError as Error).message
      : null

  return {
    stats: stats ?? null,
    messageVolume: messageVolume ?? [],
    isLoading,
    isRefetching,
    error,
    refetch,
    lastUpdated,
  }
}
