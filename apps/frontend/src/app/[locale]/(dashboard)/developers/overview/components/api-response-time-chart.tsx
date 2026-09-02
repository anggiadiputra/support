"use client"

import { TrendingDown } from "lucide-react"
import { CartesianGrid, LabelList, Line, LineChart, XAxis } from "recharts"
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
  { week: "W1", time: 350 },
  { week: "W2", time: 190 },
  { week: "W3", time: 460 },
  { week: "W4", time: 142 },
  { week: "W5", time: 220 },
  { week: "W6", time: 200 },
]

const chartConfig = {
  time: {
    label: "Time (ms)",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig

export function ApiResponseTimeChart({ className = "" }: Props) {
  const times = chartData.map((item) => item.time)
  const minTime = Math.round(Math.min(...times))
  const maxTime = Math.round(Math.max(...times))
  const avgTime = Math.round(
    times.reduce((sum, time) => sum + time, 0) / times.length
  )
  return (
    <Card
      className={cn(
        "bg-white rounded-2xl shadow-sm border border-gray-200 p-5 space-y-4 hover:shadow-md transition-shadow",
        className
      )}
    >
      <CardHeader className="space-y-2 p-0">
        <CardTitle className="text-base font-bold text-gray-900">Response Time</CardTitle>
        <CardDescription className="flex gap-6">
          <div>
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Min
            </div>
            <span className="text-xl font-bold text-gray-900">{minTime}ms</span>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Avg
            </div>
            <span className="text-xl font-bold text-gray-900">{avgTime}ms</span>
          </div>
          <div>
            <div className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Max
            </div>
            <span className="text-xl font-bold text-gray-900">{maxTime}ms</span>
          </div>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <ChartContainer config={chartConfig}>
          <LineChart
            accessibilityLayer
            data={chartData}
            margin={{
              top: 20,
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
              tickFormatter={(value) => value.slice(0, 3)}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent indicator="line" />}
            />
            <Line
              dataKey="time"
              type="natural"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{
                fill: "#6366f1",
              }}
              activeDot={{
                r: 6,
              }}
            >
              <LabelList
                position="top"
                offset={12}
                className="fill-gray-600 font-semibold"
                fontSize={11}
              />
            </Line>
          </LineChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-1 p-0 text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-emerald-600">
          Response time decreased by 20ms this week{" "}
          <TrendingDown className="h-3.5 w-3.5" />
        </div>
        <div className="text-gray-400">
          Average API response time for the past 6 weeks in milliseconds
        </div>
      </CardFooter>
    </Card>
  )
}
