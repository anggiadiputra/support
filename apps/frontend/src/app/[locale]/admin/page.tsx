"use client"

import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { StatsGrid } from "./components/stats-grid"
import { MessageVolumeChart } from "./components/message-volume-chart"
import { ChannelDistributionChart } from "./components/channel-distribution-chart"
import { useAdminStats } from "./hooks/use-admin-stats"

export default function AdminOverviewPage() {
  const { stats, isLoading, error, refetch } = useAdminStats()

  return (
    <div className="p-5 md:p-8 space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Admin Dashboard</h1>
          <p className="text-sm text-gray-500">
            Platform overview and management
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="w-full sm:w-auto rounded-lg border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards Grid */}
      <StatsGrid
        users={stats?.users}
        messages={stats?.messages}
        connections={stats?.connections}
        isLoading={isLoading}
      />

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <MessageVolumeChart />
        <ChannelDistributionChart
          whatsapp={stats?.messages.byChannel.whatsapp}
          instagram={stats?.messages.byChannel.instagram}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
