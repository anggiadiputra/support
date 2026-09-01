"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { IconCurrencyDollar } from "@tabler/icons-react"
import type { ConversationAnalyticsData } from "@/lib/api/insights-api"

interface CostBreakdownCardProps {
  data: ConversationAnalyticsData | null
  isLoading: boolean
  locale?: string
}

const CATEGORY_COLORS = {
  marketing: "hsl(340, 82%, 52%)",
  utility: "hsl(142, 70%, 45%)",
  authentication: "hsl(217, 91%, 60%)",
  service: "hsl(47, 96%, 53%)",
}

const CATEGORY_LABELS = {
  marketing: "Marketing",
  utility: "Utility",
  authentication: "Authentication",
  service: "Service",
}

/**
 * Cost Breakdown Card Component
 * Displays cost per conversation category with locale-aware currency formatting
 * Requirements: 2.3, 8.3
 */
export function CostBreakdownCard({ data, isLoading, locale = "id-ID" }: CostBreakdownCardProps) {
  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "IDR",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  if (isLoading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const costByCategory = data?.totals.costByCategory || {
    marketing: 0,
    utility: 0,
    authentication: 0,
    service: 0,
  }

  const totalCost = data?.totals.totalCost || 0
  const hasData = totalCost > 0

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base font-medium">
          <IconCurrencyDollar className="h-4 w-4" />
          Cost Breakdown
        </CardTitle>
        <CardDescription>
          {hasData ? `Total: ${formatCurrency(totalCost)}` : "Cost per conversation category"}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-[180px] items-center justify-center text-muted-foreground">
            <div className="text-center">
              <IconCurrencyDollar className="mx-auto h-12 w-12 opacity-50" />
              <p className="mt-2">No cost data available</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(costByCategory).map(([category, cost]) => {
              const percentage = totalCost > 0 ? ((cost / totalCost) * 100).toFixed(1) : "0"
              const color = CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS]
              const label = CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS]

              return (
                <div key={category} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div
                        className="h-3 w-3 rounded-full shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium">{label}</span>
                    </div>
                    <span className="text-muted-foreground">
                      {formatCurrency(cost)}
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                </div>
              )
            })}

            {/* Total summary */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-between">
                <span className="font-semibold">Total Cost</span>
                <span className="font-bold text-lg">{formatCurrency(totalCost)}</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
