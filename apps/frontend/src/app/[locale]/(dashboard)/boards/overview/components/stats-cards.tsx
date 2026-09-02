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
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex flex-col justify-between h-full hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center shrink-0">
            <Icon size={22} className="text-white" />
          </div>
          <div>
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">{label}</p>
            {isQualityCard && badge ? (
              <span
                className={cn(
                  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold mt-0.5",
                  badgeColorClasses[badge.color]
                )}
              >
                {badge.label}
              </span>
            ) : (
              <p className="text-2xl font-black text-gray-900 mt-0.5">{stats.toLocaleString()}</p>
            )}
          </div>
        </div>

        <TooltipProvider>
          <Tooltip delayDuration={50}>
            <TooltipTrigger>
              <IconInfoCircle className="text-gray-400 hover:text-gray-600 size-4" />
              <span className="sr-only">More Info</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{description}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          {subStats && (
            <p className="text-gray-500 text-xs truncate">{subStats}</p>
          )}
          {!subStats && !isQualityCard && (
            <p className="text-gray-400 text-xs">Since last week</p>
          )}
          {isQualityCard && tierInfo && (
            <p className="text-gray-500 text-xs">
              Tier: {tierInfo}
            </p>
          )}
        </div>

        {!isQualityCard && percentage > 0 && (
          <div
            className={cn("flex items-center gap-1 shrink-0 font-semibold text-xs", {
              "text-emerald-600": type === "up",
              "text-red-600": type === "down",
              "text-gray-500": type === "neutral",
            })}
          >
            <span>{percentage.toFixed(1)}%</span>
            {type === "up" && <IconCaretUpFilled size={14} />}
            {type === "down" && <IconCaretDownFilled size={14} />}
          </div>
        )}
      </div>
    </div>
  )
}
