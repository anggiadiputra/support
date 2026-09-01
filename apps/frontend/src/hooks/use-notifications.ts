/**
 * Notifications Query Hooks
 *
 * TanStack Query hooks for notifications data fetching with proper caching.
 * Supports optimistic updates for immediate UI feedback.
 * Includes WebSocket integration for realtime notifications.
 */

import { useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  notificationsApi,
  type Notification,
  type NotificationsResponse,
  type NotificationsFilters,
} from '@/lib/api/notifications-api'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'
import { useWebSocket, type NewNotificationPayload } from './use-websocket'

/**
 * Hook for fetching notifications with pagination support
 *
 * @param filters - Optional filters for pagination
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useNotifications(filters?: NotificationsFilters, enabled: boolean = true) {
  return useQuery<NotificationsResponse, Error>({
    queryKey: queryKeys.notifications.list(filters || {}),
    queryFn: () => notificationsApi.getNotifications(filters),
    ...CACHE_TIMES.notifications,
    enabled,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching only the unread count (lightweight)
 * Used for the notification badge in the navbar
 *
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useUnreadNotificationCount(enabled: boolean = true) {
  return useQuery<number, Error>({
    queryKey: queryKeys.notifications.unreadCount(),
    queryFn: () => notificationsApi.getUnreadCount(),
    ...CACHE_TIMES.notifications,
    enabled,
    // Refetch periodically to catch new notifications
    refetchInterval: 60000, // 1 minute
    refetchIntervalInBackground: true,
  })
}

/**
 * Hook for realtime notification updates via WebSocket
 * Invalidates notification queries when new notification arrives
 */
export function useRealtimeNotifications() {
  const queryClient = useQueryClient()
  
  const { state } = useWebSocket({
    onNewNotification: (event) => {
      console.log('[Notifications] New notification received:', event.payload.title)
      
      // Invalidate all notification queries to trigger refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })

  return { isConnected: state.isConnected }
}

/**
 * Hook for marking a notification as read with optimistic update
 */
export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => notificationsApi.markAsRead(id),
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all })

      // Snapshot the previous values
      const previousLists = queryClient.getQueriesData<NotificationsResponse>({
        queryKey: queryKeys.notifications.lists(),
      })
      const previousCount = queryClient.getQueryData<number>(
        queryKeys.notifications.unreadCount()
      )

      // Optimistically update all notification lists
      previousLists.forEach(([queryKey, data]) => {
        if (data) {
          const wasUnread = data.notifications.find((n) => n.id === id && !n.read)
          queryClient.setQueryData<NotificationsResponse>(queryKey, {
            ...data,
            notifications: data.notifications.map((n) =>
              n.id === id ? { ...n, read: true } : n
            ),
            unreadCount: wasUnread ? data.unreadCount - 1 : data.unreadCount,
          })
        }
      })

      // Optimistically update unread count
      if (previousCount !== undefined && previousCount > 0) {
        queryClient.setQueryData<number>(
          queryKeys.notifications.unreadCount(),
          previousCount - 1
        )
      }

      return { previousLists, previousCount }
    },
    onError: (_error, _id, context) => {
      // Restore previous values on error
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

/**
 * Hook for marking all notifications as read
 */
export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => notificationsApi.markAllAsRead(),
    onMutate: async () => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all })

      // Snapshot the previous values
      const previousLists = queryClient.getQueriesData<NotificationsResponse>({
        queryKey: queryKeys.notifications.lists(),
      })
      const previousCount = queryClient.getQueryData<number>(
        queryKeys.notifications.unreadCount()
      )

      // Optimistically mark all as read in all lists
      previousLists.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<NotificationsResponse>(queryKey, {
            ...data,
            notifications: data.notifications.map((n) => ({ ...n, read: true })),
            unreadCount: 0,
          })
        }
      })

      // Optimistically set unread count to 0
      queryClient.setQueryData<number>(queryKeys.notifications.unreadCount(), 0)

      return { previousLists, previousCount }
    },
    onError: (_error, _variables, context) => {
      // Restore previous values on error
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}

/**
 * Hook for deleting a notification
 */
export function useDeleteNotification() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => notificationsApi.deleteNotification(id),
    onMutate: async (id: string) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.notifications.all })

      // Snapshot the previous values
      const previousLists = queryClient.getQueriesData<NotificationsResponse>({
        queryKey: queryKeys.notifications.lists(),
      })
      const previousCount = queryClient.getQueryData<number>(
        queryKeys.notifications.unreadCount()
      )

      // Find the notification BEFORE modifying lists (to check unread status)
      const notificationToDelete = previousLists
        .flatMap(([, data]) => data?.notifications || [])
        .find((n) => n.id === id)
      const wasUnread = notificationToDelete && !notificationToDelete.read

      // Optimistically remove from all lists
      previousLists.forEach(([queryKey, data]) => {
        if (data) {
          queryClient.setQueryData<NotificationsResponse>(queryKey, {
            ...data,
            notifications: data.notifications.filter((n) => n.id !== id),
            unreadCount: wasUnread ? data.unreadCount - 1 : data.unreadCount,
            total: data.total - 1,
          })
        }
      })

      // Optimistically update unread count if notification was unread
      if (previousCount !== undefined && wasUnread && previousCount > 0) {
        queryClient.setQueryData<number>(
          queryKeys.notifications.unreadCount(),
          previousCount - 1
        )
      }

      return { previousLists, previousCount }
    },
    onError: (_error, _id, context) => {
      // Restore previous values on error
      if (context?.previousLists) {
        context.previousLists.forEach(([queryKey, data]) => {
          queryClient.setQueryData(queryKey, data)
        })
      }
      if (context?.previousCount !== undefined) {
        queryClient.setQueryData(queryKeys.notifications.unreadCount(), context.previousCount)
      }
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.notifications.all })
    },
  })
}
