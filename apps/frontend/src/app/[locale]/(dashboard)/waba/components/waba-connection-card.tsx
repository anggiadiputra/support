"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  IconCircleCheck,
  IconAlertCircle,
  IconRefresh,
  IconUnlink
} from "@tabler/icons-react"
import { useState } from "react"

interface WABAInfo {
  id: string
  name: string
  status: "CONNECTED" | "DISCONNECTED" | "PENDING"
  lastSynced?: Date | null
}

interface Props {
  wabaInfo: WABAInfo | null
  onRefresh: () => void
  onDisconnect: () => void
}

export function WABAConnectionCard({ wabaInfo, onRefresh, onDisconnect }: Props) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }

  if (!wabaInfo) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <IconAlertCircle className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="mb-2 text-lg font-semibold">No WABA Connected</h3>
          <p className="text-muted-foreground mb-4 text-center text-sm">
            Connect your WhatsApp Business Account to get started
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex flex-wrap items-center gap-2">
              WhatsApp Business Account
              {wabaInfo.status === "CONNECTED" && (
                <Badge className="bg-emerald-600">
                  <IconCircleCheck className="mr-1 h-3 w-3" />
                  Connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>Manage your WABA connection</CardDescription>
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
              onClick={onDisconnect}
              className="text-red-600 hover:text-red-700 flex-1 md:flex-none"
            >
              <IconUnlink className="h-4 w-4" />
              Disconnect
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <p className="text-muted-foreground text-sm">WABA ID</p>
            <p className="font-mono text-sm font-medium">{wabaInfo.id}</p>
          </div>
          <div>
            <p className="text-muted-foreground text-sm">Business Name</p>
            <p className="font-medium">{wabaInfo.name}</p>
          </div>
          {wabaInfo.lastSynced && (
            <div className="md:col-span-2">
              <p className="text-muted-foreground text-sm">Last Synced</p>
              <p className="text-sm">
                {new Date(wabaInfo.lastSynced).toLocaleString()}
              </p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
