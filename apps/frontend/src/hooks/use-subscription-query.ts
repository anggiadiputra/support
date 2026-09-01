/**
 * Subscription Query Hooks
 *
 * TanStack Query hooks for subscription status and pricing data.
 * Uses proper cache configuration for optimal performance.
 *
 * Requirements: 5.1, 5.2
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  subscriptionApi,
  type SubscriptionData,
  type PricingData,
  type PricingDataWithDurations,
} from '@/lib/api/subscription-api'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'

// Default subscription data for fallback
const defaultSubscriptionData: SubscriptionData = {
  tier: 'FREE',
  status: 'ACTIVE',
  expiresAt: null,
  features: {
    aiChatbot: false,
    apiAccess: false,
    webhooksEnabled: false,
  },
  limits: {
    maxKnowledgeDocs: 0,
    maxAgents: 0,
    maxApiKeys: 0,
    maxWebhookEndpoints: 0,
  },
  usage: {
    knowledgeDocs: 0,
    agents: 0,
    apiKeys: 0,
    webhookEndpoints: 0,
  },
  channelLimits: {
    maxWhatsappDevices: 1,
    maxInstagramAccounts: 1,
    maxMessengerAccounts: 1,
  },
  channelUsage: {
    whatsappDevices: 0,
    instagramAccounts: 0,
    messengerAccounts: 0,
  },
}

/**
 * Hook for fetching subscription status
 * Uses 5min stale time as subscription status can change after payment
 *
 * Requirements: 5.1, 5.2
 */
export function useSubscriptionStatus() {
  return useQuery({
    queryKey: queryKeys.subscription.status(),
    queryFn: subscriptionApi.get,
    ...CACHE_TIMES.subscription,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching pricing data
 * Uses 30min stale time as pricing rarely changes
 *
 * Requirements: 5.1, 5.2
 */
export function usePricing() {
  return useQuery({
    queryKey: queryKeys.subscription.pricing(),
    queryFn: subscriptionApi.getPricing,
    ...CACHE_TIMES.pricing,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for handling payment completion with subscription cache invalidation
 * Used when payment is completed to refresh subscription status
 *
 * Requirements: 5.3
 */
export function usePaymentComplete() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      // This mutation is triggered after payment success
      // The actual payment is handled by the payment modal
      return Promise.resolve()
    },
    onSuccess: () => {
      // Invalidate subscription status cache to fetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.status() })
      // Also invalidate all subscription-related queries
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all })
    },
  })
}

/**
 * Hook for invalidating subscription cache after payment
 * Used when payment is completed to refresh subscription status
 *
 * Requirements: 5.3
 */
export function useInvalidateSubscription() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async () => {
      // This is a no-op mutation, just used to trigger invalidation
      return Promise.resolve()
    },
    onSuccess: () => {
      // Invalidate subscription status cache
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.status() })
    },
  })
}

/**
 * Utility function to invalidate subscription cache
 * Can be called directly from payment success handlers
 *
 * Requirements: 5.3
 */
export function invalidateSubscriptionCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.subscription.status() })
  queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all })
}

// Re-export types for convenience
export type {
  SubscriptionData,
  PricingData,
  PricingDataWithDurations,
}
