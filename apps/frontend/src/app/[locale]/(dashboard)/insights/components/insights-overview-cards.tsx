"use client"

import {
  IconMessageCircle,
  IconPercentage,
  IconMessages,
  IconCurrencyDollar,
} from "@tabler/icons-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import type { InsightsOverviewData } from "@/lib/api/insights-api"

interface InsightsOverviewCardsProps {
  data: InsightsOverviewData | null
  isLoading: boolean
}

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  icon: React.ElementType
  isLoading: boolean
}

function StatCard({ title, value, subtitle, icon: Icon, isLoading }: StatCardProps) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-20 mb-1" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {subtitle && (
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Insights Overview Cards Component
 * Displays 4 key metrics: Messages Sent, Delivery Rate, Total Conversations, Estimated Cost
 * Requirements: 4.2, 4.4
 */
export function InsightsOverviewCards({ data, isLoading }: InsightsOverviewCardsProps) {
  const formatNumber = (num: number): string => {
    return num.toLocaleString()
  }

  const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount)
  }

  const formatPercentage = (rate: number): string => {
    return `${rate.toFixed(1)}%`
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Messages Sent"
        value={data ? formatNumber(data.messages.totalSent) : 0}
        subtitle={data ? `${formatNumber(data.messages.totalDelivered)} delivered` : undefined}
        icon={IconMessageCircle}
        isLoading={isLoading}
      />
      <StatCard
        title="Delivery Rate"
        value={data ? formatPercentage(data.messages.deliveryRate) : "0%"}
        subtitle="Messages successfully delivered"
        icon={IconPercentage}
        isLoading={isLoading}
      />
      <StatCard
        title="Total Conversations"
        value={data ? formatNumber(data.conversations.total) : 0}
        subtitle="Billable conversations"
        icon={IconMessages}
        isLoading={isLoading}
      />
      <StatCard
        title="Estimated Cost"
        value={data ? formatCurrency(data.conversations.estimatedCost) : formatCurrency(0)}
        subtitle="Based on conversation pricing"
        icon={IconCurrencyDollar}
        isLoading={isLoading}
      />
    </div>
  )
}
