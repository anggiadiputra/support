"use client"

import { useState, useCallback, useMemo } from "react"
import { RefreshCw, Clock } from "lucide-react"
import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { InsightsOverviewCards } from "./components/insights-overview-cards"
import { MessageAnalyticsChart } from "./components/message-analytics-chart"
import { ConversationCategoryChart } from "./components/conversation-category-chart"
import { CostBreakdownCard } from "./components/cost-breakdown-card"
import { TemplatePerformanceTable } from "./components/template-performance-table"
import {
  NoWabaConnectedError,
  ApiErrorState,
  RateLimitedBanner,
  UnauthorizedError,
} from "./components/insights-error-states"
import { InsightsApiError } from "@/lib/api/insights-api"
import { useInsights } from "@/hooks/use-insights"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { WhatsAppPhoneSelector } from "@/components/whatsapp-phone-selector"

type TimeRange = "24h" | "7d" | "30d" | "90d"

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
]

function getDateRange(timeRange: TimeRange): { startDate: number; endDate: number } {
  const now = Math.floor(Date.now() / 1000)
  const ranges: Record<TimeRange, number> = {
    "24h": 24 * 60 * 60,
    "7d": 7 * 24 * 60 * 60,
    "30d": 30 * 24 * 60 * 60,
    "90d": 90 * 24 * 60 * 60,
  }
  return {
    startDate: now - ranges[timeRange],
    endDate: now,
  }
}

/**
 * WhatsApp Insights Page
 * Displays analytics from Meta Graph API
 * Requirements: 4.1, 4.3, 4.4, 4.5, 7.3
 */
export default function InsightsPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>("7d")
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Multi-number support
  const {
    phoneNumbers,
    selectedPhoneNumberId,
    selectedPhoneNumber,
    selectedWhatsappAccountId,
    hasConnectedWaba,
    isLoading: isWabaLoading,
    setSelectedPhoneNumberId,
  } = useWhatsAppPhoneNumbers()

  // Memoize date range to prevent unnecessary re-renders
  const dateRange = useMemo(() => getDateRange(timeRange), [timeRange])

  // Determine granularity based on time range
  const granularity = timeRange === "24h" ? "HALF_HOUR" : "DAY"

  // Build phoneNumbers filter from selected phone number
  const phoneNumbersFilter = useMemo(
    () => selectedPhoneNumber ? [selectedPhoneNumber.phoneNumberId] : undefined,
    [selectedPhoneNumber]
  )

  const insightsEnabled = !isWabaLoading && hasConnectedWaba
  const showNoWaba = !isWabaLoading && !hasConnectedWaba

  // Use the combined insights hook with proper caching
  const {
    overview: overviewData,
    isOverviewLoading,
    isOverviewFetching,
    overviewError,
    messages: messageData,
    isMessagesLoading: isMessageLoading,
    isMessagesFetching: isMessageFetching,
    messagesError: messageError,
    conversations: conversationData,
    isConversationsLoading: isConversationLoading,
    isConversationsFetching: isConversationFetching,
    conversationsError: conversationError,
    templates: templateData,
    isTemplatesLoading: isTemplateLoading,
    isTemplatesFetching: isTemplateFetching,
    templatesError: templateError,
    isFetching,
    refetchAll,
  } = useInsights({
    dateRange,
    granularity,
    phoneNumbers: phoneNumbersFilter,
    wabaAccountId: selectedWhatsappAccountId,
    enabled: insightsEnabled,
  })

  // Check for NO_WABA_CONNECTED error
  const noWabaError = [overviewError, messageError, conversationError, templateError].find(
    (err) => err instanceof InsightsApiError && err.code === "NO_WABA_CONNECTED"
  )

  // Check for UNAUTHORIZED error
  const unauthorizedError = [overviewError, messageError, conversationError, templateError].find(
    (err) => err instanceof InsightsApiError && err.code === "UNAUTHORIZED"
  )

  // Check for RATE_LIMITED error (may have cached data)
  const rateLimitedError = [overviewError, messageError, conversationError, templateError].find(
    (err) => err instanceof InsightsApiError && err.code === "RATE_LIMITED"
  ) as InsightsApiError | undefined

  // Check for region restriction
  const isRegionRestricted = templateError instanceof InsightsApiError && 
    templateError.code === "REGION_RESTRICTED"

  // Check for general API errors (excluding handled ones)
  const apiError = [overviewError, messageError, conversationError].find(
    (err) => err instanceof InsightsApiError && 
      !["NO_WABA_CONNECTED", "UNAUTHORIZED", "RATE_LIMITED"].includes(err.code)
  ) as InsightsApiError | undefined

  // Refresh all data
  const handleRefresh = useCallback(async () => {
    await refetchAll()
    setLastUpdated(new Date())
  }, [refetchAll])

  // Format last updated timestamp
  const formatLastUpdated = (date: Date | null) => {
    if (!date) return "Never"
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  return (
    <>
      <Header />

      <div className="space-y-6 p-4">
        {/* Page Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">WhatsApp Insights</h1>
            <p className="text-muted-foreground text-sm">
              Analytics from Meta Graph API
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Time range selector */}
            <Select value={timeRange} onValueChange={(v) => setTimeRange(v as TimeRange)}>
              <SelectTrigger className="h-9 w-[140px] text-sm">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {TIME_RANGE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Phone number selector */}
            <WhatsAppPhoneSelector
              phoneNumbers={phoneNumbers}
              selectedId={selectedPhoneNumberId}
              onSelect={setSelectedPhoneNumberId}
            />

            <div className="h-6 w-px bg-border" />

            {/* Last updated */}
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <Clock className="h-3.5 w-3.5" />
              <span>{formatLastUpdated(lastUpdated)}</span>
            </div>

            {/* Refresh button */}
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isFetching}
            >
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </div>

        {/* No WABA Connected Error */}
        {(noWabaError || showNoWaba) && (
          <NoWabaConnectedError />
        )}

        {/* Unauthorized Error */}
        {unauthorizedError && !noWabaError && (
          <UnauthorizedError />
        )}

        {/* Rate Limited Warning Banner */}
        {rateLimitedError && !noWabaError && !unauthorizedError && (
          <RateLimitedBanner retryAfter={rateLimitedError.details?.retryAfter} />
        )}

        {/* General API Error */}
        {apiError && !noWabaError && !unauthorizedError && (
          <ApiErrorState 
            error={{
              code: apiError.code,
              message: apiError.message,
              details: apiError.details,
            }}
            onRetry={handleRefresh}
          />
        )}

        {/* Overview Cards */}
        <InsightsOverviewCards
          data={overviewData || null}
          isLoading={isOverviewLoading}
        />

        {/* Message Analytics Chart */}
        <MessageAnalyticsChart
          data={messageData || null}
          isLoading={isMessageLoading}
        />

        {/* Conversation & Cost Row */}
        <div className="grid gap-4 md:grid-cols-2">
          <ConversationCategoryChart
            data={conversationData || null}
            isLoading={isConversationLoading}
          />
          <CostBreakdownCard
            data={conversationData || null}
            isLoading={isConversationLoading}
          />
        </div>

        {/* Template Performance */}
        <TemplatePerformanceTable
          data={templateData || null}
          isLoading={isTemplateLoading}
          isRegionRestricted={isRegionRestricted}
        />
      </div>
    </>
  )
}
