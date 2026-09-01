"use client"

import { Cell, Pie, PieChart, Legend } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { IconChartPie } from "@tabler/icons-react"
import type { ConversationAnalyticsData } from "@/lib/api/insights-api"

interface ConversationCategoryChartProps {
  data: ConversationAnalyticsData | null
  isLoading: boolean
}

const CATEGORY_COLORS = {
  marketing: "hsl(340, 82%, 52%)",
  utility: "hsl(142, 70%, 45%)",
  authentication: "hsl(217, 91%, 60%)",
  service: "hsl(47, 96%, 53%)",
}

const chartConfig = {
  marketing: {
    label: "Marketing",
    color: CATEGORY_COLORS.marketing,
  },
  utility: {
    label: "Utility",
    color: CATEGORY_COLORS.utility,
  },
  authentication: {
    label: "Authentication",
    color: CATEGORY_COLORS.authentication,
  },
  service: {
    label: "Service",
    color: CATEGORY_COLORS.service,
  },
} satisfies ChartConfig

/**
 * Conversation Category Chart Component
 * Displays pie chart showing conversation distribution by category
 * Requirements: 5.2, 5.4
 */
export function ConversationCategoryChart({ data, isLoading }: ConversationCategoryChartProps) {
  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[250px] w-full" />
        </CardContent>
      </Card>
    )
  }

  const byCategory = data?.totals.byCategory || {
    marketing: 0,
    utility: 0,
    authentication: 0,
    service: 0,
  }

  const total = Object.values(byCategory).reduce((sum, val) => sum + val, 0)

  // Transform data for pie chart
  const chartData = [
    { name: "Marketing", value: byCategory.marketing, fill: CATEGORY_COLORS.marketing },
    { name: "Utility", value: byCategory.utility, fill: CATEGORY_COLORS.utility },
    { name: "Authentication", value: byCategory.authentication, fill: CATEGORY_COLORS.authentication },
    { name: "Service", value: byCategory.service, fill: CATEGORY_COLORS.service },
  ].filter((item) => item.value > 0)

  const isEmpty = chartData.length === 0

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <IconChartPie className="h-4 w-4" />
          Conversation Categories
        </CardTitle>
        <CardDescription>
          {total > 0 ? `${total.toLocaleString()} total conversations` : "Distribution by category"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[250px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <IconChartPie className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-2">No conversation data available</p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <ChartContainer config={chartConfig} className="h-[180px] w-full">
              <PieChart>
                <Pie
                  data={chartData}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={2}
                  dataKey="value"
                  labelLine={false}
                >
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <ChartTooltip
                  content={
                    <ChartTooltipContent
                      formatter={(value) => (
                        <span className="font-medium">
                          {Number(value).toLocaleString()} conversations
                        </span>
                      )}
                    />
                  }
                />
                <Legend />
              </PieChart>
            </ChartContainer>

            {/* Category breakdown */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {Object.entries(byCategory).map(([category, count]) => {
                const percentage = total > 0 ? ((count / total) * 100).toFixed(1) : "0"
                const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]
                const label = category.charAt(0).toUpperCase() + category.slice(1)
                
                return (
                  <div key={category} className="flex items-center gap-2">
                    <div
                      className="h-3 w-3 rounded-full shrink-0"
                      style={{ backgroundColor: color }}
                    />
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium truncate">{label}</span>
                      <span className="text-muted-foreground text-xs">
                        {count.toLocaleString()} ({percentage}%)
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
