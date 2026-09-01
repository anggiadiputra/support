'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'
import { dashboardApi } from '@/lib/api/dashboard-api'
import { templatesApi } from '@/lib/api/templates-api'
import { customersApi } from '@/lib/api/customers-api'

/**
 * Hook for prefetching data on navigation hover
 * 
 * Prefetches data for high-priority pages to make navigation feel instant.
 * All prefetch operations are non-blocking and silently handle errors.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */
export function usePrefetch() {
  const queryClient = useQueryClient()

  /**
   * Prefetch dashboard stats data
   * Non-blocking, silently handles errors
   */
  const prefetchDashboard = useCallback(async () => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.dashboard.stats(),
        queryFn: () => dashboardApi.getStats(),
        staleTime: CACHE_TIMES.dashboard.staleTime,
      })
    } catch {
      // Silently fail - prefetch errors should not affect user experience
    }
  }, [queryClient])

  /**
   * Prefetch templates list data
   * Non-blocking, silently handles errors
   */
  const prefetchTemplates = useCallback(async () => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.templates.list({}),
        queryFn: () => templatesApi.getTemplates(),
        staleTime: CACHE_TIMES.templates.staleTime,
      })
    } catch {
      // Silently fail - prefetch errors should not affect user experience
    }
  }, [queryClient])

  /**
   * Prefetch customers list data
   * Non-blocking, silently handles errors
   */
  const prefetchCustomers = useCallback(async () => {
    try {
      await queryClient.prefetchQuery({
        queryKey: queryKeys.customers.list({}),
        queryFn: () => customersApi.getCustomers(),
        staleTime: CACHE_TIMES.customers.staleTime,
      })
    } catch {
      // Silently fail - prefetch errors should not affect user experience
    }
  }, [queryClient])

  return {
    prefetchDashboard,
    prefetchTemplates,
    prefetchCustomers,
  }
}

export type PrefetchType = 'dashboard' | 'templates' | 'customers'
