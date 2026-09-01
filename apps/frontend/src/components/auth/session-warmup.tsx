"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { authClient } from "@/lib/auth-client"
import { SESSION_QUERY_KEY } from "@/hooks/use-cached-session"
import { CACHE_TIMES } from "@/lib/cache-config"

/**
 * SessionWarmup component - prefetches and caches session on app load
 * 
 * This ensures the session is available in cache before any navigation,
 * preventing the slow navigation issue where each route change waits
 * for session validation.
 * 
 * Place this component high in the component tree (e.g., in Providers)
 */
export function SessionWarmup() {
  const queryClient = useQueryClient()

  useEffect(() => {
    // Prefetch session data on mount
    queryClient.prefetchQuery({
      queryKey: SESSION_QUERY_KEY,
      queryFn: async () => {
        const result = await authClient.getSession()
        return result.data
      },
      staleTime: CACHE_TIMES.session.staleTime,
      gcTime: CACHE_TIMES.session.gcTime,
    })
  }, [queryClient])

  return null
}
