"use client"

import { Bell } from "lucide-react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { NotificationList } from "@/components/notifications"
import { RoleGuard } from "@/components/auth/role-guard"

/**
 * Notifications Settings Page
 *
 * Displays all notifications in a list format within the settings section.
 * Uses the NotificationList component to render notifications.
 */
export default function NotificationsPage() {
  return (
    <RoleGuard>
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
            <CardDescription>
              View and manage your notifications. Stay updated on important
              events like subscription changes, API key expiry, and system
              announcements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <NotificationList />
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  )
}
