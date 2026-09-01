"use client"

import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from "@/components/ui/chart"
import { Skeleton } from "@/components/ui/skeleton"
import { IconChartLine } from "@tabler/icons-react"
import type { MessageAnalyticsData } from "@/lib/api/insights-api"

interface MessageAnalyticsChartProps {
  data: MessageAnalyticsData | null
  isLoading: boolean
}

const chartConfig = {
  sent: {
    label: "Sent",
    color: "hsl(var(--chart-1))",
  },
  delivered: {
    label: "Delivered",
    color: "hsl(var(--chart-2))",
  },
} satisfies ChartConfig

/**
 * Message Analytics Chart Component
 * Displays line chart showing sent vs delivered messages over time
 * Requirements: 5.1, 5.4, 5.5
 */
export function MessageAnalyticsChart({ data, isLoading }: MessageAnalyticsChartProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-[300px] w-full" />
        </CardContent>
      </Card>
    )
  }

  // Transform data points for chart
  const chartData = data?.dataPoints.map((point) => ({
    date: new Date(point.start * 1000).toISOString(),
    sent: point.sent,
    delivered: point.delivered,
  })) || []

  const isEmpty = chartData.length === 0

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <IconChartLine className="h-4 w-4" />
          Message Analytics
        </CardTitle>
        <CardDescription>
          {data ? (
            <>
              {data.totals.sent.toLocaleString()} sent • {data.totals.delivered.toLocaleString()} delivered • {data.totals.deliveryRate.toFixed(1)}% delivery rate
            </>
          ) : (
            "Messages sent vs delivered over time"
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          <div className="flex h-[300px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <IconChartLine className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-2">No message data available for this period</p>
            </div>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[300px] w-full">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                width={50}
                tickFormatter={(value) => {
                  if (value >= 1000) {
                    return `${(value / 1000).toFixed(0)}k`
                  }
                  return value
                }}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString("en-US", {
                        weekday: "short",
                        month: "long",
                        day: "numeric",
                      })
                    }}
                  />
                }
              />
              <ChartLegend content={<ChartLegendContent />} />
              <Line
                type="monotone"
                dataKey="sent"
                stroke="var(--color-sent)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="delivered"
                stroke="var(--color-delivered)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}
