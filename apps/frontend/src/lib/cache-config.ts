/**
 * Cache Configuration
 *
 * Defines stale time and garbage collection time for different data types.
 * - staleTime: Duration data is considered "fresh" (no refetch needed)
 * - gcTime: Duration data stays in cache before garbage collection
 *
 * Data types are categorized by update frequency:
 * - Static: Rarely changes (pricing)
 * - Semi-static: Changes occasionally (templates, subscription)
 * - Dynamic: Changes frequently (dashboard, customers, messages)
 * - Analytics: Medium frequency (insights)
 */

export interface CacheConfig {
  staleTime: number
  gcTime: number
}

export const CACHE_TIMES = {
  // Static data - rarely changes
  pricing: {
    staleTime: 30 * 60 * 1000, // 30 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  },

  // Semi-static data - changes occasionally
  templates: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  },
  subscription: {
    staleTime: 0, // Always fetch fresh data to reflect payment status immediately
    gcTime: 10 * 60 * 1000, // 10 minutes
  },

  // Dynamic data - changes frequently
  dashboard: {
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  },
  customers: {
    staleTime: 3 * 60 * 1000, // 3 minutes
    gcTime: 15 * 60 * 1000, // 15 minutes
  },
  messages: {
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  },

  // Analytics - medium frequency
  insights: {
    staleTime: 10 * 60 * 1000, // 10 minutes
    gcTime: 60 * 60 * 1000, // 60 minutes
  },

  // Team data
  team: {
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes
  },

  // Session/Auth data - keep session cached to avoid blocking navigation
  session: {
    staleTime: 2 * 60 * 1000, // 2 minutes - session considered fresh
    gcTime: 30 * 60 * 1000, // 30 minutes - keep in cache
  },

  // Notifications - check frequently for new notifications
  notifications: {
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 10 * 60 * 1000, // 10 minutes
  },
} as const

export type CacheConfigKey = keyof typeof CACHE_TIMES

/**
 * Helper to get cache config for a specific data type
 */
export function getCacheConfig(key: CacheConfigKey): CacheConfig {
  return CACHE_TIMES[key]
}

/**
 * Default cache configuration used when no specific config is provided
 */
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
}
