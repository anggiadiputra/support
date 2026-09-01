/**
 * Webhooks Query Hooks
 *
 * TanStack Query hooks for webhooks data fetching with proper caching.
 * Uses hierarchical query keys and configured cache times for optimal performance.
 * Supports optimistic updates for immediate UI feedback.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  webhooksApi,
  type WebhookEndpoint,
  type WebhookDeliveryLog,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type TestWebhookResult,
} from '@/lib/api/webhooks-api'
import { queryKeys } from '@/lib/query-keys'

/**
 * Query keys for webhooks
 */
export const webhookKeys = {
  all: ['webhooks'] as const,
  lists: () => [...webhookKeys.all, 'list'] as const,
  list: () => [...webhookKeys.lists()] as const,
  details: () => [...webhookKeys.all, 'detail'] as const,
  detail: (id: string) => [...webhookKeys.details(), id] as const,
  logs: (id: string) => [...webhookKeys.all, 'logs', id] as const,
}

/**
 * Cache configuration for webhooks
 * Semi-static data - changes occasionally when user manages webhooks
 */
const WEBHOOK_CACHE = {
  staleTime: 5 * 60 * 1000, // 5 minutes
  gcTime: 30 * 60 * 1000, // 30 minutes
}

/**
 * Hook for fetching webhooks list
 *
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useWebhooks(enabled: boolean = true) {
  return useQuery<WebhookEndpoint[], Error>({
    queryKey: webhookKeys.list(),
    queryFn: () => webhooksApi.list(),
    ...WEBHOOK_CACHE,
    enabled,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching webhook delivery logs
 *
 * @param id - Webhook ID
 * @param limit - Number of logs to fetch (default: 50)
 * @param enabled - Whether the query should be enabled
 */
export function useWebhookLogs(id: string, limit: number = 50, enabled: boolean = true) {
  return useQuery<WebhookDeliveryLog[], Error>({
    queryKey: webhookKeys.logs(id),
    queryFn: () => webhooksApi.getLogs(id, limit),
    ...WEBHOOK_CACHE,
    enabled: enabled && !!id,
  })
}

/**
 * Hook for creating a new webhook
 *
 * Invalidates the webhooks list on success.
 */
export function useCreateWebhook() {
  const queryClient = useQueryClient()

  return useMutation<WebhookEndpoint, Error, CreateWebhookInput>({
    mutationFn: (input) => webhooksApi.create(input),
    onSuccess: (newWebhook) => {
      // Update cache with new webhook
      queryClient.setQueryData<WebhookEndpoint[]>(webhookKeys.list(), (old) => {
        if (!old) return [newWebhook]
        return [newWebhook, ...old]
      })
      // Also invalidate subscription for usage count refresh
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all })
    },
  })
}

/**
 * Hook for updating a webhook
 *
 * Uses optimistic updates for immediate UI feedback.
 */
export function useUpdateWebhook() {
  const queryClient = useQueryClient()

  return useMutation<
    WebhookEndpoint,
    Error,
    { id: string; data: UpdateWebhookInput },
    { previousWebhooks: WebhookEndpoint[] | undefined }
  >({
    mutationFn: ({ id, data }) => webhooksApi.update(id, data),
    onMutate: async ({ id, data }) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: webhookKeys.list() })

      // Snapshot previous value
      const previousWebhooks = queryClient.getQueryData<WebhookEndpoint[]>(webhookKeys.list())

      // Optimistically update
      queryClient.setQueryData<WebhookEndpoint[]>(webhookKeys.list(), (old) => {
        if (!old) return old
        return old.map((webhook) =>
          webhook.id === id ? { ...webhook, ...data } : webhook
        )
      })

      return { previousWebhooks }
    },
    onError: (_error, _variables, context) => {
      // Rollback on error
      if (context?.previousWebhooks) {
        queryClient.setQueryData(webhookKeys.list(), context.previousWebhooks)
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: webhookKeys.list() })
    },
  })
}

/**
 * Hook for deleting a webhook
 *
 * Uses optimistic updates for immediate UI feedback.
 */
export function useDeleteWebhook() {
  const queryClient = useQueryClient()

  return useMutation<
    void,
    Error,
    string,
    { previousWebhooks: WebhookEndpoint[] | undefined }
  >({
    mutationFn: (id) => webhooksApi.delete(id),
    onMutate: async (id) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: webhookKeys.list() })

      // Snapshot previous value
      const previousWebhooks = queryClient.getQueryData<WebhookEndpoint[]>(webhookKeys.list())

      // Optimistically remove
      queryClient.setQueryData<WebhookEndpoint[]>(webhookKeys.list(), (old) => {
        if (!old) return old
        return old.filter((webhook) => webhook.id !== id)
      })

      return { previousWebhooks }
    },
    onError: (_error, _id, context) => {
      // Rollback on error
      if (context?.previousWebhooks) {
        queryClient.setQueryData(webhookKeys.list(), context.previousWebhooks)
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: webhookKeys.list() })
      // Refresh subscription for usage count
      queryClient.invalidateQueries({ queryKey: queryKeys.subscription.all })
    },
  })
}

/**
 * Hook for testing a webhook
 */
export function useTestWebhook() {
  return useMutation<TestWebhookResult, Error, string>({
    mutationFn: (id) => webhooksApi.test(id),
  })
}
