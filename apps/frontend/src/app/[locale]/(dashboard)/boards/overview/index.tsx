"use client"

import { RefreshCw, Clock, Download } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import StatsCards from "./components/stats-cards"
import MessageMetrics from "./components/message-metrics"
import MessageTypeBreakdown from "./components/message-type-breakdown"
import ChannelDistribution from "./components/channel-distribution"
import PipelineFunnel from "./components/pipeline-funnel"
import TopLeads from "./components/top-leads"
import TemplateStats from "./components/template-stats"
import QualityMetrics from "./components/quality-metrics"
import { useDashboardStats } from "./hooks/use-dashboard-stats"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { WhatsAppPhoneSelector } from "@/components/whatsapp-phone-selector"
import { DashboardFilterProvider, useDashboardFilter } from "./context/dashboard-filter-context"
import { DashboardDateRangePicker } from "./components/date-range-picker"
import { useToast } from "@/hooks/use-toast"
import { useState } from "react"

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.origin) ||
  "http://localhost:3005"

// Inner component that uses context
function OverviewContent({ 
  phoneNumbers,
  selectedPhoneNumberId,
  setSelectedPhoneNumberId,
}: {
  phoneNumbers: ReturnType<typeof useWhatsAppPhoneNumbers>["phoneNumbers"]
  selectedPhoneNumberId: string | null
  setSelectedPhoneNumberId: (id: string | null) => void
}) {
  const { stats, isLoading, isRefetching, refetch, lastUpdated, error } =
    useDashboardStats(
      selectedPhoneNumberId ? { whatsappPhoneNumberId: selectedPhoneNumberId } : undefined
    )

  const { dateRange } = useDashboardFilter()
  const { toast } = useToast()
  const [isExporting, setIsExporting] = useState(false)

  // Format last updated timestamp - Requirements: 6.4
  const formatLastUpdated = (date: Date | null) => {
    if (!date) return "Never"
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  // Export dashboard data to CSV
  const handleExport = async () => {
    setIsExporting(true)
    try {
      const params = new URLSearchParams()
      if (selectedPhoneNumberId) {
        params.append("whatsappPhoneNumberId", selectedPhoneNumberId)
      }
      params.append("startDate", dateRange.from.toISOString())
      params.append("endDate", dateRange.to.toISOString())

      const res = await fetch(
        `${API_URL}/api/v1/dashboard/export?${params.toString()}`,
        { credentials: "include" }
      )

      if (!res.ok) {
        let msg = `Failed to export (status ${res.status})`
        try {
          const data = await res.json()
          msg = data?.error?.message || data?.message || msg
        } catch {
          const fallback = await res.text().catch(() => "")
          if (fallback) msg = fallback
        }
        throw new Error(msg)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `dashboard-report-${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast({ title: "Export ready", description: "Dashboard report downloaded." })
    } catch (error: any) {
      console.error("Export dashboard error", error)
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "Could not export dashboard data.",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with filters and actions */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Date filter + Last updated */}
        <div className="flex flex-wrap items-center gap-4">
          <DashboardDateRangePicker />
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>{formatLastUpdated(lastUpdated)}</span>
          </div>
        </div>

        {/* Right: Phone filter + Actions */}
        <div className="flex items-center gap-2">
          <WhatsAppPhoneSelector
            phoneNumbers={phoneNumbers}
            selectedId={selectedPhoneNumberId}
            onSelect={setSelectedPhoneNumberId}
          />
          <div className="h-6 w-px bg-border" />
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={isExporting}
          >
            <Download className={cn("h-4 w-4", isExporting && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isRefetching}
          >
            <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={refetch} className="mt-2">
            Try Again
          </Button>
        </div>
      )}

      {/* Row 1: Stats Cards - 4 cards in a row */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCards />
      </div>

      {/* Row 2: Message Volume Chart - Full width */}
      <div className="grid grid-cols-1">
        <MessageMetrics />
      </div>

      {/* Row 3: Channel Distribution + Message Types + Template Stats */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <ChannelDistribution />
        <MessageTypeBreakdown />
        <TemplateStats />
      </div>

      {/* Row 4: Pipeline + Top Leads + Quality Metrics */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <PipelineFunnel />
        <TopLeads />
        <QualityMetrics />
      </div>
    </div>
  )
}

// Requirements: 6.1, 6.2, 6.3, 6.4
export default function Overview() {
  const {
    phoneNumbers,
    selectedPhoneNumberId,
    setSelectedPhoneNumberId,
  } = useWhatsAppPhoneNumbers()

  return (
    <DashboardFilterProvider whatsappPhoneNumberId={selectedPhoneNumberId ?? undefined}>
      <OverviewContent 
        phoneNumbers={phoneNumbers}
        selectedPhoneNumberId={selectedPhoneNumberId}
        setSelectedPhoneNumberId={setSelectedPhoneNumberId}
      />
    </DashboardFilterProvider>
  )
}
