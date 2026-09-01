/**
 * Templates Query Hooks
 *
 * TanStack Query hooks for templates data fetching with proper caching.
 * Uses hierarchical query keys and configured cache times for optimal performance.
 * Supports optimistic updates for immediate UI feedback.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 8.1, 8.2, 8.3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { templatesApi } from '@/lib/api/templates-api'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'
import type { Template } from '@/app/[locale]/(dashboard)/templates/data/schema'

/**
 * Filters for templates list query
 */
export interface TemplatesFilters {
  page?: number
  search?: string
  status?: string
  category?: string
  wabaId?: string
  whatsappAccountId?: string
}

/**
 * Hook for fetching templates list with pagination and filtering support
 *
 * Caches data for 5 minutes (stale time) and keeps in memory for 30 minutes (gc time).
 * Returns cached data immediately on subsequent visits while revalidating in background.
 * Different filter combinations have separate cache entries.
 *
 * @param filters - Optional filters for pagination and search
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useTemplates(filters?: TemplatesFilters, enabled: boolean = true) {
  return useQuery<Template[], Error>({
    queryKey: queryKeys.templates.list(filters || {}),
    queryFn: () => templatesApi.getTemplates(
      filters?.whatsappAccountId ? { whatsappAccountId: filters.whatsappAccountId } : undefined
    ),
    ...CACHE_TIMES.templates,
    enabled,
    // Show cached data on error
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching a single template by ID
 *
 * Uses separate cache key from list for granular cache control.
 * Template details are cached independently from the list.
 *
 * @param id - Template ID to fetch
 * @param enabled - Whether the query should be enabled (default: true when id is provided)
 */
export function useTemplateDetail(id: string | undefined, enabled: boolean = true) {
  return useQuery<Template, Error>({
    queryKey: queryKeys.templates.detail(id || ''),
    queryFn: () => templatesApi.getTemplate(id!),
    ...CACHE_TIMES.templates,
    enabled: enabled && !!id,
    // Show cached data on error
    placeholderData: (previousData) => previousData,
  })
}


/**
 * Create template input type
 */
export interface CreateTemplateInput {
  userId: string
  templateName: string
  language: string
  category: string
  content: string
  headerType?: string
  headerContent?: string
  footerContent?: string
  buttons?: any[]
  variables?: string[]
  headerMediaId?: string
  whatsappAccountId?: string
  // Authentication template specific fields
  addSecurityRecommendation?: boolean
  codeExpirationMinutes?: number
  otpType?: "COPY_CODE" | "ONE_TAP"
  copyCodeButtonText?: string
}

/**
 * Hook for creating a new template with cache invalidation
 *
 * Invalidates all templates queries on success to ensure fresh data.
 * Also invalidates dashboard stats as template counts may change.
 *
 * Requirements: 3.2, 8.1
 */
export function useCreateTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateTemplateInput) => templatesApi.createTemplate(data),
    onSuccess: () => {
      // Invalidate all templates queries to refetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
      // Also invalidate dashboard stats as template counts may change
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() })
    },
  })
}

/**
 * Hook for submitting a template to Meta for approval with optimistic update
 *
 * Optimistically updates the template status to PENDING immediately,
 * then rolls back if the mutation fails.
 *
 * Requirements: 3.2, 8.1, 8.2, 8.3
 */
export function useSubmitTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => templatesApi.submitToMeta(id),
    // Optimistic update: immediately set status to PENDING
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: queryKeys.templates.detail(id) })
      await queryClient.cancelQueries({ queryKey: queryKeys.templates.lists() })

      // Snapshot the previous values
      const previousDetail = queryClient.getQueryData<Template>(queryKeys.templates.detail(id))
      const previousLists = queryClient.getQueriesData<Template[]>({ queryKey: queryKeys.templates.lists() })

      // Optimistically update the detail cache
      if (previousDetail) {
        queryClient.setQueryData<Template>(queryKeys.templates.detail(id), {
          ...previousDetail,
          status: 'PENDING',
        })
      }

      // Optimistically update all list caches that contain this template
      previousLists.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<Template[]>(queryKey, 
            data.map(template => 
              template.id === id 
                ? { ...template, status: 'PENDING' } 
                : template
            )
          )
        }
      })

      // Return context with previous values for rollback
      return { previousDetail, previousLists }
    },
    // Rollback on error
    onError: (_error, id, context) => {
      // Restore detail cache
      if (context?.previousDetail) {
        queryClient.setQueryData(queryKeys.templates.detail(id), context.previousDetail)
      }
      // Restore all list caches
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
    },
    // Always refetch after error or success to ensure consistency
    onSettled: (_data, _error, id) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.detail(id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.lists() })
    },
  })
}

/**
 * Hook for deleting a template with cache invalidation
 *
 * Invalidates all templates queries on success to ensure fresh data.
 * Also invalidates dashboard stats as template counts may change.
 *
 * Requirements: 3.2, 8.1
 */
export function useDeleteTemplate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => templatesApi.deleteTemplate(id),
    onSuccess: (_data, id) => {
      // Invalidate all templates queries
      queryClient.invalidateQueries({ queryKey: queryKeys.templates.all })
      // Also invalidate dashboard stats as template counts may change
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.stats() })
    },
  })
}

/**
 * Hook for fetching template analytics
 *
 * Uses template-specific cache key for analytics data.
 *
 * @param id - Template ID to fetch analytics for
 * @param enabled - Whether the query should be enabled
 */
export function useTemplateAnalytics(id: string | undefined, enabled: boolean = true) {
  return useQuery({
    queryKey: [...queryKeys.templates.detail(id || ''), 'analytics'] as const,
    queryFn: () => templatesApi.getAnalytics(id!),
    ...CACHE_TIMES.templates,
    enabled: enabled && !!id,
    placeholderData: (previousData) => previousData,
  })
}
