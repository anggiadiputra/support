/**
 * Dashboard Query Hooks
 *
 * TanStack Query hooks for dashboard data fetching with proper caching.
 * Uses hierarchical query keys and configured cache times for optimal performance.
 *
 * Requirements: 2.1, 2.2, 2.3
 */

import { useQuery } from '@tanstack/react-query'
import {
  dashboardApi,
  type EnhancedDashboardStats,
  type MessageVolumeData,
  type CustomerInsights,
  type QualityMetrics,
} from '@/lib/api/dashboard-api'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'

/**
 * Hook for fetching dashboard statistics
 *
 * Caches data for 2 minutes (stale time) and keeps in memory for 10 minutes (gc time).
 * Returns cached data immediately on subsequent visits while revalidating in background.
 */
export function useDashboardStats(filters?: { 
  whatsappPhoneNumberId?: string
  startDate?: string
  endDate?: string 
}) {
  return useQuery<EnhancedDashboardStats, Error>({
    queryKey: [
      ...queryKeys.dashboard.stats(), 
      filters?.whatsappPhoneNumberId || 'all',
      filters?.startDate || 'default',
      filters?.endDate || 'default'
    ],
    queryFn: () => dashboardApi.getStats(filters),
    ...CACHE_TIMES.dashboard,
    // Show cached data on error
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching message volume chart data
 *
 * Includes days parameter in cache key for proper cache separation.
 * Different day ranges will have separate cache entries.
 *
 * @param days - Number of days to fetch (default: 30)
 */
export function useMessageVolume(days: number = 30, filters?: { whatsappPhoneNumberId?: string }) {
  return useQuery<MessageVolumeData[], Error>({
    queryKey: queryKeys.dashboard.messageVolume(days, filters?.whatsappPhoneNumberId),
    queryFn: () => dashboardApi.getMessageVolume(days, filters),
    ...CACHE_TIMES.dashboard,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching customer insights
 *
 * Provides pipeline stage distribution and top leads data.
 */
export function useCustomerInsights(filters?: { whatsappPhoneNumberId?: string }) {
  return useQuery<CustomerInsights, Error>({
    queryKey: queryKeys.dashboard.customerInsights(filters?.whatsappPhoneNumberId),
    queryFn: () => dashboardApi.getCustomerInsights(filters),
    ...CACHE_TIMES.dashboard,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching quality metrics
 *
 * Provides WhatsApp quality rating and messaging tier information.
 */
export function useQualityMetrics(filters?: { whatsappPhoneNumberId?: string }) {
  return useQuery<QualityMetrics, Error>({
    queryKey: queryKeys.dashboard.qualityMetrics(filters?.whatsappPhoneNumberId),
    queryFn: () => dashboardApi.getQualityMetrics(filters),
    ...CACHE_TIMES.dashboard,
    placeholderData: (previousData) => previousData,
  })
}
