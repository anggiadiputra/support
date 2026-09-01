/**
 * Insights Query Hooks
 *
 * TanStack Query hooks for WhatsApp insights data with proper caching.
 * Uses 10min stale time and 60min gc time for analytics data.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'
import {
  insightsApi,
  type Granularity,
  type MessageAnalyticsData,
  type ConversationAnalyticsData,
  type TemplatePerformanceData,
  type InsightsOverviewData,
} from '@/lib/api/insights-api'

// =============================================================================
// Types
// =============================================================================

export interface InsightsDateRange {
  startDate: number
  endDate: number
}

export interface UseInsightsOptions {
  dateRange: InsightsDateRange
  granularity?: Granularity
  phoneNumbers?: string[]
  wabaAccountId?: string | null
  enabled?: boolean
}

export interface UseInsightsReturn {
  // Overview data
  overview: InsightsOverviewData | undefined
  isOverviewLoading: boolean
  isOverviewFetching: boolean
  overviewError: Error | null

  // Message analytics
  messages: MessageAnalyticsData | undefined
  isMessagesLoading: boolean
  isMessagesFetching: boolean
  messagesError: Error | null

  // Conversation analytics
  conversations: ConversationAnalyticsData | undefined
  isConversationsLoading: boolean
  isConversationsFetching: boolean
  conversationsError: Error | null

  // Template performance
  templates: TemplatePerformanceData | undefined
  isTemplatesLoading: boolean
  isTemplatesFetching: boolean
  templatesError: Error | null

  // Combined states
  isLoading: boolean
  isFetching: boolean

  // Actions
  refetchAll: () => Promise<void>
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Generate cache key for insights based on date range
 */
function getInsightsCacheKey(startDate: number, endDate: number, wabaAccountId?: string) {
  return queryKeys.insights.byDateRange(String(startDate), String(endDate), wabaAccountId)
}

// =============================================================================
// Individual Hooks
// =============================================================================

/**
 * Hook for fetching insights overview data
 */
export function useInsightsOverview(options: UseInsightsOptions) {
  const { dateRange, granularity = 'DAY', phoneNumbers, wabaAccountId, enabled = true } = options

  return useQuery({
    queryKey: [...getInsightsCacheKey(dateRange.startDate, dateRange.endDate, wabaAccountId || undefined), 'overview', granularity],
    queryFn: () =>
      insightsApi.getOverview({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity,
        phoneNumbers,
        wabaAccountId: wabaAccountId || undefined,
      }),
    ...CACHE_TIMES.insights,
    enabled,
    // Don't retry for expected errors like NO_WABA_CONNECTED
    retry: 1,
    // Show cached data on error - ensures error state only shows when no cache exists
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching message analytics
 */
export function useMessageAnalytics(options: UseInsightsOptions) {
  const { dateRange, granularity = 'DAY', phoneNumbers, wabaAccountId, enabled = true } = options

  return useQuery({
    queryKey: [...getInsightsCacheKey(dateRange.startDate, dateRange.endDate, wabaAccountId || undefined), 'messages', granularity],
    queryFn: () =>
      insightsApi.getMessageAnalytics({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity,
        phoneNumbers,
        wabaAccountId: wabaAccountId || undefined,
      }),
    ...CACHE_TIMES.insights,
    enabled,
    // Don't retry for expected errors like NO_WABA_CONNECTED
    retry: 1,
    // Show cached data on error - ensures error state only shows when no cache exists
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching conversation analytics
 */
export function useConversationAnalytics(options: UseInsightsOptions) {
  const { dateRange, granularity = 'DAY', phoneNumbers, wabaAccountId, enabled = true } = options

  return useQuery({
    queryKey: [...getInsightsCacheKey(dateRange.startDate, dateRange.endDate, wabaAccountId || undefined), 'conversations', granularity],
    queryFn: () =>
      insightsApi.getConversationAnalytics({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        granularity,
        phoneNumbers,
        wabaAccountId: wabaAccountId || undefined,
      }),
    ...CACHE_TIMES.insights,
    enabled,
    // Don't retry for expected errors like NO_WABA_CONNECTED
    retry: 1,
    // Show cached data on error - ensures error state only shows when no cache exists
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching template performance
 */
export function useTemplatePerformance(options: Omit<UseInsightsOptions, 'granularity'>) {
  const { dateRange, wabaAccountId, enabled = true } = options

  return useQuery({
    queryKey: [...getInsightsCacheKey(dateRange.startDate, dateRange.endDate, wabaAccountId || undefined), 'templates'],
    queryFn: () =>
      insightsApi.getTemplatePerformance({
        startDate: dateRange.startDate,
        endDate: dateRange.endDate,
        wabaAccountId: wabaAccountId || undefined,
      }),
    ...CACHE_TIMES.insights,
    enabled,
    // Don't retry for expected errors like NO_WABA_CONNECTED
    retry: 1,
    // Show cached data on error - ensures error state only shows when no cache exists
    placeholderData: (previousData) => previousData,
  })
}

// =============================================================================
// Combined Hook
// =============================================================================

/**
 * Combined hook for all insights data
 *
 * Fetches overview, messages, conversations, and template performance
 * with proper caching using date range as cache key.
 *
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */
export function useInsights(options: UseInsightsOptions): UseInsightsReturn {
  const { dateRange, granularity = 'DAY', phoneNumbers, wabaAccountId, enabled = true } = options
  const queryClient = useQueryClient()

  // Fetch all insights data
  const overviewQuery = useInsightsOverview({ dateRange, granularity, phoneNumbers, wabaAccountId, enabled })
  const messagesQuery = useMessageAnalytics({ dateRange, granularity, phoneNumbers, wabaAccountId, enabled })
  const conversationsQuery = useConversationAnalytics({ dateRange, granularity, phoneNumbers, wabaAccountId, enabled })
  const templatesQuery = useTemplatePerformance({ dateRange, wabaAccountId, enabled })

  // Combined loading states
  const isLoading =
    overviewQuery.isLoading ||
    messagesQuery.isLoading ||
    conversationsQuery.isLoading ||
    templatesQuery.isLoading

  const isFetching =
    overviewQuery.isFetching ||
    messagesQuery.isFetching ||
    conversationsQuery.isFetching ||
    templatesQuery.isFetching

  // Refetch all queries
  const refetchAll = useCallback(async () => {
    const cacheKey = getInsightsCacheKey(dateRange.startDate, dateRange.endDate, wabaAccountId || undefined)
    await queryClient.invalidateQueries({ queryKey: cacheKey })
  }, [queryClient, dateRange.startDate, dateRange.endDate, wabaAccountId])

  return {
    // Overview
    overview: overviewQuery.data,
    isOverviewLoading: overviewQuery.isLoading,
    isOverviewFetching: overviewQuery.isFetching,
    overviewError: overviewQuery.error,

    // Messages
    messages: messagesQuery.data,
    isMessagesLoading: messagesQuery.isLoading,
    isMessagesFetching: messagesQuery.isFetching,
    messagesError: messagesQuery.error,

    // Conversations
    conversations: conversationsQuery.data,
    isConversationsLoading: conversationsQuery.isLoading,
    isConversationsFetching: conversationsQuery.isFetching,
    conversationsError: conversationsQuery.error,

    // Templates
    templates: templatesQuery.data,
    isTemplatesLoading: templatesQuery.isLoading,
    isTemplatesFetching: templatesQuery.isFetching,
    templatesError: templatesQuery.error,

    // Combined
    isLoading,
    isFetching,

    // Actions
    refetchAll,
  }
}
