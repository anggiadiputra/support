"use client"

import { useEffect } from "react"
import { RefreshCw, TrendingUp, TrendingDown, Mail, MessageSquare } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useUserMessageStats } from "../../../hooks/use-admin-user-support"

interface TabMessageStatsProps {
  userId: string
}

export function TabMessageStats({ userId }: TabMessageStatsProps) {
  const { data, isLoading, error, fetch } = useUserMessageStats(userId, 30)

  useEffect(() => {
    fetch()
  }, [fetch])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Alert>
        <AlertDescription>No data available</AlertDescription>
      </Alert>
    )
  }

  const deliveryRate = data.totals.sent > 0 
    ? ((data.totals.delivered / data.totals.sent) * 100).toFixed(1)
    : "0"

  const readRate = data.totals.delivered > 0
    ? ((data.totals.read / data.totals.delivered) * 100).toFixed(1)
    : "0"

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Period: {new Date(data.period.startDate).toLocaleDateString("id-ID")} - {new Date(data.period.endDate).toLocaleDateString("id-ID")} ({data.period.days} days)
        </p>
        <Button variant="outline" size="sm" onClick={() => fetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{data.totals.sent.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Sent</p>
              </div>
              <Mail className="h-8 w-8 text-muted-foreground/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {data.totals.delivered.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Delivered ({deliveryRate}%)</p>
              </div>
              <TrendingUp className="h-8 w-8 text-green-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {data.totals.read.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Read ({readRate}%)</p>
              </div>
              <MessageSquare className="h-8 w-8 text-blue-500/50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {data.totals.failed.toLocaleString()}
                </div>
                <p className="text-xs text-muted-foreground">Failed</p>
              </div>
              <TrendingDown className="h-8 w-8 text-red-500/50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* By Source */}
      <Card>
        <CardHeader>
          <CardTitle>Messages by Source</CardTitle>
          <CardDescription>Breakdown by message source</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <span className="font-medium">WhatsApp API</span>
              <span className="text-lg font-bold">{data.bySource.api.toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
              <span className="font-medium">Instagram</span>
              <span className="text-lg font-bold">{data.bySource.instagram.toLocaleString()}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Daily Breakdown */}
      <Card>
        <CardHeader>
          <CardTitle>Last 7 Days</CardTitle>
          <CardDescription>Daily message breakdown</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {data.daily.map((day) => (
              <div key={day.date} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <span className="text-sm font-medium">
                  {new Date(day.date).toLocaleDateString("id-ID", { weekday: "short", month: "short", day: "numeric" })}
                </span>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-muted-foreground">
                    Sent: <span className="font-medium text-foreground">{day.sent}</span>
                  </span>
                  <span className="text-green-600">
                    Delivered: <span className="font-medium">{day.delivered}</span>
                  </span>
                  <span className="text-red-600">
                    Failed: <span className="font-medium">{day.failed}</span>
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
