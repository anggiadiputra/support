"use client"

import { DollarSign, TrendingUp, CheckCircle, Clock } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { RevenueStats } from "../../hooks/use-admin-revenue"

interface RevenueStatsCardsProps {
  stats: RevenueStats | null
  isLoading?: boolean
}

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function StatCardSkeleton() {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
      <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-7 w-28" />
      </div>
    </div>
  )
}

export function RevenueStatsCards({ stats, isLoading }: RevenueStatsCardsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
        <StatCardSkeleton />
      </div>
    )
  }

  const items = [
    {
      title: "Total Revenue",
      value: formatIDR(stats?.totalRevenue ?? 0),
      desc: "All time",
      icon: DollarSign,
    },
    {
      title: "Monthly Revenue",
      value: formatIDR(stats?.monthlyRevenue ?? 0),
      desc: "This month",
      icon: TrendingUp,
    },
    {
      title: "Successful Txns",
      value: (stats?.successfulTransactions ?? 0).toLocaleString(),
      desc: "This month",
      icon: CheckCircle,
    },
    {
      title: "Pending Txns",
      value: (stats?.pendingTransactions ?? 0).toLocaleString(),
      desc: "Awaiting payment",
      icon: Clock,
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => (
        <div key={item.title} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
          <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center shrink-0">
            <item.icon className="w-5.5 h-5.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider truncate">{item.title}</p>
            <p className="text-2xl font-black text-gray-900 mt-0.5 truncate">{item.value}</p>
            <p className="text-xs text-gray-500 mt-0.5 truncate">{item.desc}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
