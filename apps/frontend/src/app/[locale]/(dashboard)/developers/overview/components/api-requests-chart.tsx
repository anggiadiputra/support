"use client"

import { TrendingUp } from "lucide-react"
import { CartesianGrid, Line, LineChart, XAxis } from "recharts"
import { cn } from "@/lib/utils"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"

interface Props {
  className?: string
}

const chartData = [
  { week: "W1", count: 40 },
  { week: "W2", count: 24 },
  { week: "W3", count: 52 },
  { week: "W4", count: 33 },
  { week: "W5", count: 80 },
  { week: "W6", count: 95 },
]

const chartConfig = {
  count: {
    label: "Count",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig

export function ApiRequestsChart({ className = "" }: Props) {
  return (
    <Card
      className={cn(
        "bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4 hover:shadow-md transition-shadow",
        className
      )}
    >
      <CardHeader className="space-y-2 p-0">
        <CardTitle className="text-base font-bold text-gray-900">API Requests</CardTitle>
        <CardDescription className="flex gap-6">
          <div>
            <div className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">
              Successful
            </div>
            <span className="text-xl font-bold text-gray-900">270</span>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-rose-500 tracking-wider">
              Failed
            </div>
            <span className="text-xl font-bold text-gray-900">6</span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="week"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent hideLabel />}
            />
            <Line
              dataKey="count"
              type="linear"
              stroke="#10b981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 p-0 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
          Requests increased by 8.7% this week{" "}
          <TrendingUp className="h-3.5 w-3.5" />
        </div>
        <div className="text-gray-400">
          Displaying total API requests for the past {chartData.length} weeks
        </div>
      </CardFooter>
    </Card>
  )
}
