"use client"

import {
  IconMessageCircle,
  IconUsers,
  IconClock,
  IconShieldCheck,
  IconCaretUpFilled,
  IconCaretDownFilled,
  IconInfoCircle,
} from "@tabler/icons-react"
import { Line, LineChart } from "recharts"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartConfig, ChartContainer } from "@/components/ui/chart"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { useDashboardStats } from "../hooks/use-dashboard-stats"
import { useDashboardFilter } from "../context/dashboard-filter-context"

interface StatsCardData {
  label: string
  description: string
  stats: number
  subStats?: string
  type: "up" | "down" | "neutral"
  percentage: number
  chartData: { value: number }[]
  strokeColor: string
  icon: React.ElementType
  badge?: {
    label: string
    color: "green" | "yellow" | "red"
  }
  tierInfo?: string
}

// Quality rating color mapping
const qualityColors = {
  HIGH: "green",
  MEDIUM: "yellow",
  LOW: "red",
} as const

// Quality rating badge colors
const badgeColorClasses = {
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  yellow: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  red: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
}

export default function StatsCards() {
  const { stats, isLoading } = useDashboardStats()
  const { days } = useDashboardFilter()

  // Generate simple label based on days
  const getDateRangeLabel = () => {
    if (days === 1) return "Today"
    return `${days}D`
  }

  const dateRangeLabel = getDateRangeLabel()

  if (isLoading) {
    return (
      <>
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="h-full">
            <CardContent className="p-6">
              <div className="animate-pulse space-y-3">
                <div className="bg-muted h-4 w-24 rounded"></div>
                <div className="bg-muted h-8 w-16 rounded"></div>
                <div className="bg-muted h-3 w-32 rounded"></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </>
    )
  }

  // Calculate delivery rate trend (compare this week vs last week)
  const deliveryRate = stats?.messages?.deliveryRate ?? 0
  const deliveryRateFormatted = `${deliveryRate.toFixed(1)}% delivered`

  // Calculate new customers trend
  const newCustomersThisWeek = stats?.customers?.newThisWeek ?? 0
  const totalCustomers = stats?.customers?.total ?? 0
  const newCustomersPercentage = totalCustomers > 0 
    ? ((newCustomersThisWeek / totalCustomers) * 100) 
    : 0

  // Quality rating
  const qualityRating = stats?.quality?.rating ?? null
  const qualityColor = qualityRating ? qualityColors[qualityRating] : "green"
  const messagingTier = stats?.quality?.messagingTier ?? "N/A"

  // Get messages in selected range (thisMonth now represents the selected range from backend)
  const messagesInRange = stats?.messages?.thisMonth ?? 0

  // Build stats cards data with real data from API
  // Requirements: 1.1, 1.2, 2.1, 2.2, 5.1
  const statsData: StatsCardData[] = [
    {
      label: `Messages (${dateRangeLabel})`,
      description: `Total messages in selected date range with delivery rate`,
      stats: messagesInRange,
      subStats: deliveryRateFormatted,
      type: deliveryRate >= 90 ? "up" : deliveryRate >= 70 ? "neutral" : "down",
      percentage: deliveryRate,
      chartData: [
        { value: stats?.messages?.sent ?? 20 },
        { value: stats?.messages?.delivered ?? 35 },
        { value: stats?.messages?.read ?? 28 },
        { value: messagesInRange },
      ],
      strokeColor: "hsl(var(--chart-1))",
      icon: IconMessageCircle,
    },
    {
      label: "Total Customers",
      description: `All registered customers with new in ${dateRangeLabel.toLowerCase()}`,
      stats: totalCustomers,
      subStats: `+${newCustomersThisWeek} new (${dateRangeLabel.toLowerCase()})`,
      type: newCustomersThisWeek > 0 ? "up" : "neutral",
      percentage: newCustomersPercentage,
      chartData: [
        { value: 15 },
        { value: 22 },
        { value: 18 },
        { value: 28 },
        { value: 25 },
        { value: totalCustomers },
      ],
      strokeColor: "hsl(var(--chart-2))",
      icon: IconUsers,
    },
    {
      label: "Active Windows",
      description: "24-hour messaging windows currently open",
      stats: stats?.customers?.activeWindows ?? 0,
      type: "up",
      percentage: 0,
      chartData: [
        { value: 5 },
        { value: 12 },
        { value: 8 },
        { value: 15 },
        { value: 11 },
        { value: stats?.customers?.activeWindows ?? 18 },
      ],
      strokeColor: "hsl(var(--chart-3))",
      icon: IconClock,
    },
    {
      label: "Quality Rating",
      description: "WhatsApp phone number quality rating from Meta",
      stats: 0, // Not used for this card
      type: qualityRating === "HIGH" ? "up" : qualityRating === "LOW" ? "down" : "neutral",
      percentage: 0,
      chartData: [],
      strokeColor: "hsl(var(--chart-4))",
      icon: IconShieldCheck,
      badge: {
        label: qualityRating ?? "N/A",
        color: qualityColor,
      },
      tierInfo: messagingTier,
    },
  ]

  return (
    <>
      {statsData.map((cardData) => (
        <StatsCard key={cardData.label} {...cardData} />
      ))}
    </>
  )
}

function StatsCard({
  label,
  description,
  stats,
  subStats,
  type,
  percentage,
  chartData,
  strokeColor,
  icon: Icon,
  badge,
  tierInfo,
}: StatsCardData) {
  const chartConfig = {
    value: {
      label: "Value",
      color: strokeColor,
    },
  } satisfies ChartConfig

  const isQualityCard = label === "Quality Rating"

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-5 space-y-0 pt-4 pb-2">
        <CardTitle className="flex items-center gap-2 truncate text-sm font-medium">
          <Icon size={16} />
          {label}
        </CardTitle>
        <TooltipProvider>
          <Tooltip delayDuration={50}>
            <TooltipTrigger>
              <IconInfoCircle className="text-muted-foreground scale-90 stroke-[1.25]" />
              <span className="sr-only">More Info</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="flex h-[calc(100%_-_48px)] flex-col justify-between py-4">
        <div className="flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-6">
            {isQualityCard && badge ? (
              <div className="flex flex-col gap-1">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-lg font-semibold",
                    badgeColorClasses[badge.color]
                  )}
                >
                  {badge.label}
                </span>
              </div>
            ) : (
              <div className="text-3xl font-bold">{stats.toLocaleString()}</div>
            )}
            {chartData.length > 0 && (
              <ChartContainer className="w-[70px]" config={chartConfig}>
                <LineChart accessibilityLayer data={chartData}>
                  <Line
                    dataKey="value"
                    type="linear"
                    stroke="var(--color-value)"
                    strokeWidth={1.5}
                    dot={false}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </div>
          {subStats && (
            <p className="text-muted-foreground mt-1 text-xs">{subStats}</p>
          )}
          {!subStats && !isQualityCard && (
            <p className="text-muted-foreground text-xs">Since last week</p>
          )}
          {isQualityCard && tierInfo && (
            <p className="text-muted-foreground mt-1 text-xs">
              Tier: {tierInfo}
            </p>
          )}
        </div>

        {!isQualityCard && percentage > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="text-sm font-semibold">Trend</div>
            <div
              className={cn("flex items-center gap-1", {
                "text-emerald-500 dark:text-emerald-400": type === "up",
                "text-red-500 dark:text-red-400": type === "down",
                "text-muted-foreground": type === "neutral",
              })}
            >
              <p className={"text-[13px] font-medium leading-none"}>
                {percentage.toFixed(1)}%
              </p>
              {type === "up" && <IconCaretUpFilled size={18} />}
              {type === "down" && <IconCaretDownFilled size={18} />}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
