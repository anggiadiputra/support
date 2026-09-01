/**
 * Quick Replies Query Hooks
 *
 * TanStack Query hooks for quick replies and categories management.
 * Provides CRUD operations with proper cache invalidation.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  quickRepliesApi,
  type QuickReply,
  type QuickReplyCategory,
  type CreateQuickReplyInput,
  type UpdateQuickReplyInput,
  type CreateQuickReplyCategoryInput,
  type UpdateQuickReplyCategoryInput,
  type QuickReplyListParams,
} from "@/lib/api/quick-replies-api"
import { queryKeys } from "@/lib/query-keys"

// ============================================================================
// Quick Reply Hooks
// ============================================================================

/**
 * Hook for fetching quick replies with optional filtering
 *
 * @param params - Optional filters (categoryId, search)
 * @param options - Query options
 */
export function useQuickReplies(
  params?: QuickReplyListParams,
  options?: { enabled?: boolean }
) {
  return useQuery<QuickReply[], Error>({
    queryKey: queryKeys.quickReplies.list(params),
    queryFn: () => quickRepliesApi.list(params),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: options?.enabled ?? true,
  })
}

/**
 * Hook for searching quick replies
 *
 * @param query - Search query string
 * @param options - Query options including enabled flag
 */
export function useQuickReplySearch(
  query: string,
  options?: { enabled?: boolean }
) {
  return useQuery<QuickReply[], Error>({
    queryKey: queryKeys.quickReplies.search(query),
    queryFn: () => quickRepliesApi.search(query),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
    enabled: (options?.enabled ?? true) && query.length > 0,
  })
}

/**
 * Hook for fetching a quick reply by shortcut
 *
 * @param shortcut - The shortcut to look up
 * @param options - Query options
 */
export function useQuickReplyByShortcut(
  shortcut: string,
  options?: { enabled?: boolean }
) {
  return useQuery<QuickReply | null, Error>({
    queryKey: queryKeys.quickReplies.byShortcut(shortcut),
    queryFn: () => quickRepliesApi.getByShortcut(shortcut),
    staleTime: 30 * 1000,
    gcTime: 5 * 60 * 1000,
    enabled: (options?.enabled ?? true) && shortcut.length > 0,
  })
}

/**
 * Hook for creating a new quick reply
 */
export function useCreateQuickReply() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateQuickReplyInput) => quickRepliesApi.create(data),
    onSuccess: () => {
      // Invalidate all quick replies queries to refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.quickReplies.all })
    },
  })
}

/**
 * Hook for updating a quick reply
 */
export function useUpdateQuickReply() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateQuickReplyInput }) =>
      quickRepliesApi.update(id, data),
    onSuccess: () => {
      // Invalidate all quick replies queries
      queryClient.invalidateQueries({ queryKey: queryKeys.quickReplies.all })
    },
  })
}

/**
 * Hook for deleting a quick reply
 */
export function useDeleteQuickReply() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => quickRepliesApi.delete(id),
    onSuccess: () => {
      // Invalidate quick replies list
      queryClient.invalidateQueries({ queryKey: queryKeys.quickReplies.all })
    },
  })
}

// ============================================================================
// Category Hooks
// ============================================================================

/**
 * Hook for fetching all quick reply categories
 */
export function useQuickReplyCategories() {
  return useQuery<QuickReplyCategory[], Error>({
    queryKey: queryKeys.quickReplies.categories.list(),
    queryFn: () => quickRepliesApi.listCategories(),
    staleTime: 30 * 1000, // 30 seconds
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook for creating a new quick reply category
 */
export function useCreateQuickReplyCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: CreateQuickReplyCategoryInput) =>
      quickRepliesApi.createCategory(data),
    onSuccess: () => {
      // Invalidate categories list
      queryClient.invalidateQueries({
        queryKey: queryKeys.quickReplies.categories.all,
      })
    },
  })
}

/**
 * Hook for updating a quick reply category
 */
export function useUpdateQuickReplyCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: UpdateQuickReplyCategoryInput
    }) => quickRepliesApi.updateCategory(id, data),
    onSuccess: () => {
      // Invalidate both categories and quick replies (as category data is embedded)
      queryClient.invalidateQueries({
        queryKey: queryKeys.quickReplies.categories.all,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.quickReplies.all })
    },
  })
}

/**
 * Hook for deleting a quick reply category
 */
export function useDeleteQuickReplyCategory() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => quickRepliesApi.deleteCategory(id),
    onSuccess: () => {
      // Invalidate both categories and quick replies
      queryClient.invalidateQueries({
        queryKey: queryKeys.quickReplies.categories.all,
      })
      queryClient.invalidateQueries({ queryKey: queryKeys.quickReplies.all })
    },
  })
}

// ============================================================================
// Re-export types for convenience
// ============================================================================

export type {
  QuickReply,
  QuickReplyCategory,
  CreateQuickReplyInput,
  UpdateQuickReplyInput,
  CreateQuickReplyCategoryInput,
  UpdateQuickReplyCategoryInput,
  QuickReplyListParams,
}
