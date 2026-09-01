"use client"

import { useState } from "react"
import { useRouter } from "@/i18n/routing"
import { Bell, CheckCheck, Loader2, ExternalLink, Clock, CreditCard, DollarSign, Key, Info, UserPlus } from "lucide-react"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatDistanceToNow } from "date-fns"
import {
  useNotifications,
  useUnreadNotificationCount,
  useMarkNotificationAsRead,
  useMarkAllNotificationsAsRead,
  useRealtimeNotifications,
} from "@/hooks/use-notifications"
import type { NotificationType } from "@/lib/api/notifications-api"

interface NotificationIconProps {
  className?: string
}

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
    case "ESCALATION_ASSIGNMENT":
      return UserPlus
    default:
      return Bell
  }
}

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
    case "ESCALATION_ASSIGNMENT":
      return "text-purple-500"
    default:
      return "text-muted-foreground"
  }
}

/**
 * NotificationIcon Component
 *
 * Bell icon with badge showing unread notification count.
 * Shows popover with notification preview on click.
 */
export function NotificationIcon({ className }: NotificationIconProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const { data: unreadCount = 0, isLoading: isLoadingCount } = useUnreadNotificationCount()
  const { data, isLoading } = useNotifications({ limit: 5, offset: 0 })
  const markAsRead = useMarkNotificationAsRead()
  const markAllAsRead = useMarkAllNotificationsAsRead()
  const [markingId, setMarkingId] = useState<string | null>(null)
  
  // Enable realtime notification updates via WebSocket
  useRealtimeNotifications()

  const notifications = data?.notifications || []

  const handleMarkAsRead = async (id: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setMarkingId(id)
    try {
      await markAsRead.mutateAsync(id)
    } finally {
      setMarkingId(null)
    }
  }

  const handleMarkAllAsRead = async () => {
    await markAllAsRead.mutateAsync()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn("relative scale-95 rounded-full", className)}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ""}`}
        >
          <Bell className="size-[1.2rem]" />
          {!isLoadingCount && unreadCount > 0 && (
            <Badge
              variant="destructive"
              className={cn(
                "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full p-0 text-[10px] font-semibold",
                unreadCount > 99 && "px-1"
              )}
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h4 className="font-semibold text-sm">Notifications</h4>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={handleMarkAllAsRead}
              disabled={markAllAsRead.isPending}
            >
              {markAllAsRead.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <>
                  <CheckCheck className="mr-1 h-3 w-3" />
                  Mark all read
                </>
              )}
            </Button>
          )}
        </div>

        {/* Notification List */}
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="flex-1 space-y-2">
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-3 w-full" />
                  </div>
                </div>
              ))}
            </div>
          ) : notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Bell className="h-10 w-10 text-muted-foreground/50 mb-2" />
              <p className="text-sm text-muted-foreground">No notifications</p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((notification) => {
                const Icon = getNotificationIcon(notification.type)
                const iconColor = getNotificationIconColor(notification.type)
                const isMarking = markingId === notification.id

                const handleNotificationClick = (e: React.MouseEvent) => {
                  if (!notification.read) {
                    handleMarkAsRead(notification.id, e)
                  }
                  // Navigate and close popover when clicking notification with actionUrl
                  if (notification.actionUrl) {
                    setOpen(false)
                    router.push(notification.actionUrl)
                  }
                }

                const notificationContent = (
                  <div
                    className={cn(
                      "flex gap-3 p-3 hover:bg-muted/50 transition-colors cursor-pointer",
                      !notification.read && "bg-accent/30"
                    )}
                    onClick={handleNotificationClick}
                  >
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted",
                        iconColor
                      )}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={cn(
                            "text-sm leading-tight line-clamp-1",
                            !notification.read && "font-semibold"
                          )}
                        >
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {notification.message}
                      </p>
                      <div className="flex items-center justify-between mt-1">
                        <time className="text-[10px] text-muted-foreground">
                          {formatDistanceToNow(new Date(notification.createdAt), {
                            addSuffix: true,
                          })}
                        </time>
                        {!notification.read && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-1.5 text-[10px]"
                            onClick={(e) => handleMarkAsRead(notification.id, e)}
                            disabled={isMarking}
                          >
                            {isMarking ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin" />
                            ) : (
                              "Mark read"
                            )}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )

                return (
                  <div key={notification.id}>
                    {notificationContent}
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        {/* Footer */}
        <div className="border-t p-2">
          <Button
            variant="ghost"
            className="w-full h-8 text-xs"
            asChild
            onClick={() => setOpen(false)}
          >
            <Link href="/settings/notifications">
              View all notifications
              <ExternalLink className="ml-1 h-3 w-3" />
            </Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
