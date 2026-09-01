"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Clock,
  CreditCard,
  DollarSign,
  Key,
  Info,
  Trash2,
  CheckCheck,
  Loader2,
  ExternalLink,
  Bell,
} from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useToast } from "@/hooks/use-toast"
import {
  useNotifications,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useDeleteNotification,
} from "@/hooks/use-notifications"
import type { Notification, NotificationType } from "@/lib/api/notifications-api"

const ITEMS_PER_PAGE = 20

/**
 * Get the icon component for a notification type
 */
function getNotificationIcon(type: NotificationType) {
  switch (type) {
    case "MESSAGE_RETENTION":
      return Clock
    case "SUBSCRIPTION_EXPIRY":
      return CreditCard
    case "PAYMENT_STATUS":
      return DollarSign
    case "API_KEY_EXPIRY":
      return Key
    case "SYSTEM_ANNOUNCEMENT":
      return Info
    default:
      return Bell
  }
}

/**
 * Get the icon color for a notification type
 */
function getNotificationIconColor(type: NotificationType) {
  switch (type) {
    case "MESSAGE_RETENTION":
      return "text-orange-500"
    case "SUBSCRIPTION_EXPIRY":
      return "text-red-500"
    case "PAYMENT_STATUS":
      return "text-green-500"
    case "API_KEY_EXPIRY":
      return "text-yellow-500"
    case "SYSTEM_ANNOUNCEMENT":
      return "text-blue-500"
    default:
      return "text-muted-foreground"
  }
}

interface NotificationItemProps {
  notification: Notification
  onMarkAsRead: (id: string) => void
  onDelete: (id: string) => void
  isMarkingAsRead: boolean
  isDeleting: boolean
}

/**
 * Individual notification item component
 */
function NotificationItem({
  notification,
  onMarkAsRead,
  onDelete,
  isMarkingAsRead,
  isDeleting,
}: NotificationItemProps) {
  const Icon = getNotificationIcon(notification.type)
  const iconColor = getNotificationIconColor(notification.type)
  const isLoading = isMarkingAsRead || isDeleting

  const handleClick = () => {
    if (!notification.read && !isLoading) {
      onMarkAsRead(notification.id)
    }
  }

  const content = (
    <Card
      className={cn(
        "transition-colors cursor-pointer hover:bg-accent/50",
        !notification.read && "bg-accent/30 border-primary/20"
      )}
      onClick={handleClick}
    >
      <CardContent className="flex items-start gap-4 p-4">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted",
            iconColor
          )}
        >
          <Icon className="h-5 w-5" />
        </div>

        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <p
                className={cn(
                  "text-sm font-medium leading-tight",
                  !notification.read && "font-semibold"
                )}
              >
                {notification.title}
              </p>
              {!notification.read && (
                <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
              )}
            </div>
            <time
              className="text-xs text-muted-foreground whitespace-nowrap"
              dateTime={notification.createdAt}
            >
              {formatDistanceToNow(new Date(notification.createdAt), {
                addSuffix: true,
              })}
            </time>
          </div>

          <p className="text-sm text-muted-foreground line-clamp-2">
            {notification.message}
          </p>

          <div className="flex items-center gap-2 pt-1">
            {notification.actionUrl && (
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-xs"
                asChild
                onClick={(e) => e.stopPropagation()}
              >
                <Link href={notification.actionUrl}>
                  View details
                  <ExternalLink className="ml-1 h-3 w-3" />
                </Link>
              </Button>
            )}

            <div className="flex-1" />

            {!notification.read && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation()
                  onMarkAsRead(notification.id)
                }}
                disabled={isLoading}
                aria-label={isMarkingAsRead ? "Marking as read..." : "Mark as read"}
              >
                {isMarkingAsRead ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <>
                    <CheckCheck className="mr-1 h-3 w-3" />
                    Mark as read
                  </>
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation()
                onDelete(notification.id)
              }}
              disabled={isLoading}
            >
              {isDeleting ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              <span className="sr-only">Delete notification</span>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )

  return content
}

/**
 * Loading skeleton for notification items
 */
function NotificationSkeleton() {
  return (
    <Card>
      <CardContent className="flex items-start gap-4 p-4">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="flex items-start justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-16" />
          </div>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      </CardContent>
    </Card>
  )
}

/**
 * Empty state component
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted">
        <Bell className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-lg font-medium">No notifications</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        You&apos;re all caught up! Check back later for new updates.
      </p>
    </div>
  )
}

interface NotificationListProps {
  className?: string
}

/**
 * NotificationList Component
 *
 * Displays a list of all notifications, newest first.
 * Features:
 * - Icon based on notification type
 * - Title, message, and timestamp
 * - Mark as read on click/view
 * - "Mark all as read" button
 * - Load more pagination
 */
export function NotificationList({ className }: NotificationListProps) {
  const [offset, setOffset] = useState(0)
  const [accumulatedNotifications, setAccumulatedNotifications] = useState<Notification[]>([])
  const [markingAsReadId, setMarkingAsReadId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const { toast } = useToast()

  const { data, isLoading, isFetching } = useNotifications({
    limit: ITEMS_PER_PAGE,
    offset,
  })

  const markAsRead = useMarkNotificationAsRead()
  const markAllAsRead = useMarkAllNotificationsAsRead()
  const deleteNotification = useDeleteNotification()

  // Accumulate notifications when new data arrives
  useEffect(() => {
    if (data?.notifications) {
      if (offset === 0) {
        // Initial load or refresh: replace all
        setAccumulatedNotifications(data.notifications)
      } else {
        // Load more: append new notifications (avoiding duplicates)
        setAccumulatedNotifications((prev) => {
          const existingIds = new Set(prev.map((n) => n.id))
          const newNotifications = data.notifications.filter((n) => !existingIds.has(n.id))
          return [...prev, ...newNotifications]
        })
      }
    }
  }, [data?.notifications, offset])

  // Update accumulated list when notifications are marked as read
  useEffect(() => {
    if (data?.notifications && offset === 0) {
      // Sync read status from query data
      setAccumulatedNotifications((prev) =>
        prev.map((n) => {
          const updated = data.notifications.find((dn) => dn.id === n.id)
          return updated ? { ...n, read: updated.read } : n
        })
      )
    }
  }, [data?.notifications, offset])

  const notifications = accumulatedNotifications
  const unreadCount = data?.unreadCount || 0
  const total = data?.total || 0
  const hasMore = notifications.length < total

  const handleMarkAsRead = async (id: string) => {
    setMarkingAsReadId(id)
    try {
      await markAsRead.mutateAsync(id)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark notification as read"
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      })
    } finally {
      setMarkingAsReadId(null)
    }
  }

  const handleMarkAllAsRead = async () => {
    try {
      await markAllAsRead.mutateAsync()
      toast({
        title: "Success",
        description: "All notifications marked as read",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to mark all as read"
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      })
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      await deleteNotification.mutateAsync(id)
      toast({
        title: "Success",
        description: "Notification deleted",
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete notification"
      toast({
        variant: "destructive",
        title: "Error",
        description: message,
      })
    } finally {
      setDeletingId(null)
    }
  }

  const handleLoadMore = () => {
    setOffset((prev) => prev + ITEMS_PER_PAGE)
  }

  if (isLoading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[...Array(5)].map((_, i) => (
          <NotificationSkeleton key={i} />
        ))}
      </div>
    )
  }

  if (notifications.length === 0) {
    return <EmptyState />
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header with stats and actions */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {total} notification{total !== 1 ? "s" : ""}
          {unreadCount > 0 && (
            <span className="ml-1">
              ({unreadCount} unread)
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleMarkAllAsRead}
            disabled={markAllAsRead.isPending}
          >
            {markAllAsRead.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="mr-2 h-4 w-4" />
            )}
            Mark all as read
          </Button>
        )}
      </div>

      {/* Notification list */}
      <ScrollArea className="h-[calc(100vh-20rem)]">
        <div className="space-y-3 pr-4">
          {notifications.map((notification) => (
            <NotificationItem
              key={notification.id}
              notification={notification}
              onMarkAsRead={handleMarkAsRead}
              onDelete={handleDelete}
              isMarkingAsRead={markingAsReadId === notification.id}
              isDeleting={deletingId === notification.id}
            />
          ))}

          {/* Load more button */}
          {hasMore && (
            <div className="flex justify-center pt-4">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={isFetching}
              >
                {isFetching ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  "Load more"
                )}
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
