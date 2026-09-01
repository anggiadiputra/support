"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import {
  IconTrendingUp,
  IconTrendingDown,
  IconMinus,
  IconShieldCheck
} from "@tabler/icons-react"

interface QualityMetrics {
  overall: "HIGH" | "MEDIUM" | "LOW"
  score: number // 0-100
  templateQuality: "HIGH" | "MEDIUM" | "LOW"
  phoneQuality: "GREEN" | "YELLOW" | "RED"
  trend: "UP" | "DOWN" | "STABLE"
  lastUpdated: Date
}

interface Props {
  metrics: QualityMetrics | null
}

export function QualityMetricsCard({ metrics }: Props) {
  if (!metrics) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <IconShieldCheck className="text-muted-foreground mb-4 h-12 w-12" />
          <h3 className="mb-2 text-lg font-semibold">No Quality Data</h3>
          <p className="text-muted-foreground text-sm">
            Connect a WABA to view quality metrics
          </p>
        </CardContent>
      </Card>
    )
  }

  const overallConfig = {
    HIGH: { label: "High Quality", color: "bg-emerald-600", textColor: "text-emerald-600" },
    MEDIUM: { label: "Medium Quality", color: "bg-amber-600", textColor: "text-amber-600" },
    LOW: { label: "Low Quality", color: "bg-red-600", textColor: "text-red-600" },
  }

  const trendIcons = {
    UP: { icon: IconTrendingUp, color: "text-emerald-600" },
    DOWN: { icon: IconTrendingDown, color: "text-red-600" },
    STABLE: { icon: IconMinus, color: "text-gray-600" },
  }

  const overall = overallConfig[metrics.overall]
  const TrendIcon = trendIcons[metrics.trend].icon

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <IconShieldCheck className="h-5 w-5" />
              Quality Metrics
            </CardTitle>
            <CardDescription>Monitor your messaging quality rating</CardDescription>
          </div>
          <Badge className={overall.color}>
            {overall.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Overall Score */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">Overall Score</p>
                <TrendIcon className={`h-4 w-4 ${trendIcons[metrics.trend].color}`} />
              </div>
              <p className={`text-2xl font-bold ${overall.textColor}`}>
                {metrics.score}%
              </p>
            </div>
            <Progress value={metrics.score} className="h-2" />
            <p className="text-muted-foreground mt-1 text-xs">
              Based on customer feedback and engagement
            </p>
          </div>

          {/* Quality Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Template Quality</p>
                <p className="text-muted-foreground text-xs">Message template performance</p>
              </div>
              <Badge
                variant={
                  metrics.templateQuality === "HIGH"
                    ? "default"
                    : metrics.templateQuality === "MEDIUM"
                      ? "secondary"
                      : "destructive"
                }
              >
                {metrics.templateQuality}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">Phone Number Quality</p>
                <p className="text-muted-foreground text-xs">Account health status</p>
              </div>
              <Badge
                className={
                  metrics.phoneQuality === "GREEN"
                    ? "bg-emerald-600"
                    : metrics.phoneQuality === "YELLOW"
                      ? "bg-amber-600"
                      : "bg-red-600"
                }
              >
                {metrics.phoneQuality}
              </Badge>
            </div>
          </div>

          {/* Last Updated */}
          <div className="text-muted-foreground border-t pt-3 text-xs">
            Last updated: {new Date(metrics.lastUpdated).toLocaleString()}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
