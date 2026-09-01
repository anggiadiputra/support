"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { CACHE_TIMES } from "@/lib/cache-config"

/**
 * Query key for session caching
 */
export const SESSION_QUERY_KEY = ["auth", "session"] as const

/**
 * Cached session hook that wraps better-auth's useSession with React Query
 * 
 * Benefits:
 * - Session is cached across navigation (no blocking on route change)
 * - Configurable stale time prevents unnecessary refetches
 * - Background refetch keeps session fresh without blocking UI
 * 
 * This solves the slow navigation issue where useSession() blocks
 * every route transition while checking session validity.
 * 
 * Note: refetchOnMount is set to true only when there's no cached data.
 * This handles the case when user is redirected after OAuth login and
 * the session cookie exists but React Query cache is empty.
 */
export function useCachedSession() {
  const queryClient = useQueryClient()
  
  // Check if we have cached data
  const cachedData = queryClient.getQueryData(SESSION_QUERY_KEY)
  
  const { data, isPending, error, refetch } = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const result = await authClient.getSession()
      return result.data
    },
    staleTime: CACHE_TIMES.session.staleTime,
    gcTime: CACHE_TIMES.session.gcTime,
    refetchOnWindowFocus: false,
    // Refetch on mount only if no cached data (handles OAuth redirect case)
    refetchOnMount: !cachedData,
    refetchOnReconnect: true,
    retry: 1,
  })

  return {
    data,
    isPending,
    error,
    refetch,
    isAuthenticated: !!data?.user,
  }
}

/**
 * Prefetch session data - useful for initial load
 */
export function usePrefetchSession() {
  const queryClient = useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async () => {
      const result = await authClient.getSession()
      return result.data
    },
    staleTime: CACHE_TIMES.session.staleTime,
    gcTime: CACHE_TIMES.session.gcTime,
    enabled: false, // Only prefetch on demand
  })

  return queryClient.refetch
}
