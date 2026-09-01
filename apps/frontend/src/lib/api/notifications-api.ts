/**
 * Notifications API
 *
 * Client-side API functions for fetching and managing notifications.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

/**
 * Notification type matching backend enum
 */
export type NotificationType =
  | 'MESSAGE_RETENTION'
  | 'SUBSCRIPTION_EXPIRY'
  | 'PAYMENT_STATUS'
  | 'API_KEY_EXPIRY'
  | 'SYSTEM_ANNOUNCEMENT'
  | 'MAINTENANCE'
  | 'PROMOTION'
  | 'CUSTOM'
  | 'ESCALATION_ASSIGNMENT'

/**
 * Notification interface matching backend response
 */
export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  data: Record<string, any> | null
  read: boolean
  actionUrl: string | null
  expiresAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * Response type for notifications list
 */
export interface NotificationsResponse {
  notifications: Notification[]
  unreadCount: number
  total: number
}

/**
 * Filters for notifications query
 */
export interface NotificationsFilters {
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

export const notificationsApi = {
  /**
   * Get notifications with optional filters
   */
  async getNotifications(filters?: NotificationsFilters): Promise<NotificationsResponse> {
    const params = new URLSearchParams()

    if (filters?.unreadOnly !== undefined) {
      params.append('unreadOnly', String(filters.unreadOnly))
    }
    if (filters?.limit !== undefined) {
      params.append('limit', String(filters.limit))
    }
    if (filters?.offset !== undefined) {
      params.append('offset', String(filters.offset))
    }

    const queryString = params.toString()
    const url = `${API_URL}/api/v1/notifications${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      credentials: 'include',
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch notifications')
    }

    return result.data
  },

  /**
   * Get unread count only (lightweight call)
   */
  async getUnreadCount(): Promise<number> {
    const response = await fetch(`${API_URL}/api/v1/notifications?limit=0`, {
      credentials: 'include',
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch unread count')
    }

    return result.data.unreadCount
  },

  /**
   * Mark a notification as read
   */
  async markAsRead(id: string): Promise<Notification> {
    const response = await fetch(`${API_URL}/api/v1/notifications/${id}/read`, {
      method: 'POST',
      credentials: 'include',
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to mark notification as read')
    }

    return result.data
  },

  /**
   * Mark all notifications as read
   */
  async markAllAsRead(): Promise<{ count: number }> {
    const response = await fetch(`${API_URL}/api/v1/notifications/read-all`, {
      method: 'POST',
      credentials: 'include',
    })
    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to mark all notifications as read')
    }

    return result.data
  },

  /**
   * Delete a notification
   */
  async deleteNotification(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/notifications/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    if (!response.ok) {
      const result = await response.json()
      throw new Error(result.error?.message || 'Failed to delete notification')
    }
  },
}
