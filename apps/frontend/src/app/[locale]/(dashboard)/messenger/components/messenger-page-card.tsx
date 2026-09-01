"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  IconCircleCheck,
  IconRefresh,
  IconUnlink,
  IconBrandFacebook,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { useState } from "react"
import type { FacebookPage } from "@/lib/api/messenger"

interface Props {
  page: FacebookPage
  onRefresh: () => void
  onDisconnect: (pageId: string) => void
}

export function MessengerPageCard({ page, onRefresh, onDisconnect }: Props) {
  const [refreshing, setRefreshing] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      await onDisconnect(page.pageId)
    } finally {
      setDisconnecting(false)
    }
  }

  const isConnected = page.connectionStatus === "connected"
  const requiresReauth = page.connectionStatus === "requires_reauth"

  return (
    <Card className={requiresReauth ? "border-amber-200 dark:border-amber-800" : ""}>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={page.profilePicUrl || undefined} alt={page.pageName} />
              <AvatarFallback className="bg-[#1877F2] text-white">
                <IconBrandFacebook className="h-8 w-8" />
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {page.pageName}
                {isConnected && (
                  <Badge className="bg-emerald-600">
                    <IconCircleCheck className="mr-1 h-3 w-3" />
                    Connected
                  </Badge>
                )}
                {requiresReauth && (
                  <Badge variant="outline" className="border-amber-500 text-amber-600">
                    <IconAlertTriangle className="mr-1 h-3 w-3" />
                    Needs Reauth
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {page.pageCategory || "Facebook Page"}
              </CardDescription>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex-1 md:flex-none"
            >
              <IconRefresh className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              disabled={disconnecting}
              className="text-red-600 hover:text-red-700 flex-1 md:flex-none"
            >
              <IconUnlink className="h-4 w-4" />
              {disconnecting ? "..." : "Disconnect"}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-sm">Page ID</p>
            <p className="font-mono text-sm font-medium">{page.pageId}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Connected Since</p>
            <p className="font-medium">
              {new Date(page.connectedAt).toLocaleDateString("en-US", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Webhook Status</p>
            <p className="font-medium">
              {page.webhookSubscribed ? (
                <span className="text-emerald-600">Subscribed</span>
              ) : (
                <span className="text-amber-600">Not Subscribed</span>
              )}
            </p>
          </div>
          {page.lastSyncAt && (
            <div className="md:col-span-2">
              <p className="text-muted-foreground text-sm">Last Synced</p>
              <p className="text-sm">
                {new Date(page.lastSyncAt).toLocaleString()}
              </p>
            </div>
          )}
          {page.conversationCount !== undefined && (
            <div>
              <p className="text-muted-foreground text-sm">Conversations</p>
              <p className="font-medium">{page.conversationCount}</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
