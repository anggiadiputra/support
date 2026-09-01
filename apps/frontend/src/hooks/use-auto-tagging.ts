/**
 * Auto Tagging Query Hooks
 *
 * TanStack Query hooks for auto-tagging rules management.
 * Provides CRUD operations with proper cache invalidation.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  autoTaggingApi,
  type AutoTagRule,
  type CreateAutoTagRuleInput,
  type UpdateAutoTagRuleInput,
} from '@/lib/api/auto-tagging-api'
import { queryKeys } from '@/lib/query-keys'

/**
 * Hook for fetching all auto-tag rules
 */
export function useAutoTagRules() {
  return useQuery<AutoTagRule[], Error>({
    queryKey: queryKeys.autoTagging.rules(),
    queryFn: () => autoTaggingApi.list(),
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  })
}

/**
 * Hook for fetching a single auto-tag rule
 */
export function useAutoTagRule(id: string | undefined) {
  return useQuery<AutoTagRule, Error>({
    queryKey: queryKeys.autoTagging.rule(id || ''),
    queryFn: () => autoTaggingApi.get(id!),
    enabled: !!id,
    staleTime: 1000 * 60 * 5, // 5 minutes
    gcTime: 1000 * 60 * 30, // 30 minutes
  })
}

/**
 * Hook for creating a new auto-tag rule
 */
export function useCreateAutoTagRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateAutoTagRuleInput) => autoTaggingApi.create(data),
    onSuccess: () => {
      // Invalidate rules list to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.autoTagging.rules() })
    },
  })
}

/**
 * Hook for updating an auto-tag rule
 */
export function useUpdateAutoTagRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateAutoTagRuleInput }) =>
      autoTaggingApi.update(id, data),
    onSuccess: (_data, variables) => {
      // Invalidate both the list and the specific rule
      queryClient.invalidateQueries({ queryKey: queryKeys.autoTagging.rules() })
      queryClient.invalidateQueries({ queryKey: queryKeys.autoTagging.rule(variables.id) })
    },
  })
}

/**
 * Hook for deleting an auto-tag rule
 */
export function useDeleteAutoTagRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => autoTaggingApi.delete(id),
    onSuccess: () => {
      // Invalidate rules list
      queryClient.invalidateQueries({ queryKey: queryKeys.autoTagging.rules() })
    },
  })
}

/**
 * Hook for toggling auto-tag rule active status
 */
export function useToggleAutoTagRule() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => autoTaggingApi.toggle(id),
    // Optimistic update for immediate UI feedback
    onMutate: async (id: string) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.autoTagging.rules() })

      // Snapshot previous value
      const previousRules = queryClient.getQueryData<AutoTagRule[]>(queryKeys.autoTagging.rules())

      // Optimistically update the cache
      if (previousRules) {
        queryClient.setQueryData<AutoTagRule[]>(
          queryKeys.autoTagging.rules(),
          previousRules.map((rule) =>
            rule.id === id ? { ...rule, isActive: !rule.isActive } : rule
          )
        )
      }

      return { previousRules }
    },
    // Rollback on error
    onError: (_error, _id, context) => {
      if (context?.previousRules) {
        queryClient.setQueryData(queryKeys.autoTagging.rules(), context.previousRules)
      }
    },
    // Always refetch after mutation
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.autoTagging.rules() })
    },
  })
}

// Re-export types for convenience
export type { AutoTagRule, CreateAutoTagRuleInput, UpdateAutoTagRuleInput }
