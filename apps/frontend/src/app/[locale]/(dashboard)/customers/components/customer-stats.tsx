"use client"

import {
  IconUsers,
  IconUserCheck,
  IconClock,
  IconUserX,
} from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useCustomerStats } from "@/hooks/use-customers"
import { useTranslations } from "next-intl"

interface StatCardProps {
  label: string
  value: number
  icon: React.ElementType
  iconColor?: string
  isLoading?: boolean
}

function StatCard({ label, value, icon: Icon, isLoading }: StatCardProps) {
  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center shrink-0">
        <Icon className="w-5.5 h-5.5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider truncate">{label}</p>
        <p className="text-2xl font-black text-gray-900 mt-0.5">{value.toLocaleString()}</p>
      </div>
    </div>
  )
}

interface CustomerStatsProps {
  enabled?: boolean
  whatsappPhoneNumberId?: string | null
}

export function CustomerStats({ enabled = true, whatsappPhoneNumberId }: CustomerStatsProps) {
  const t = useTranslations("customers")
  const filters = whatsappPhoneNumberId ? { whatsappPhoneNumberId } : undefined
  const { data: stats, isLoading } = useCustomerStats(filters, enabled)

  const statsData = [
    {
      label: t("stats.total"),
      value: stats?.total ?? 0,
      icon: IconUsers,
      iconColor: "text-blue-500",
    },
    {
      label: t("stats.consented"),
      value: stats?.consented ?? 0,
      icon: IconUserCheck,
      iconColor: "text-emerald-500",
    },
    {
      label: t("stats.activeWindow"),
      value: stats?.activeWindow ?? 0,
      icon: IconClock,
      iconColor: "text-amber-500",
    },
    {
      label: t("stats.blacklisted"),
      value: stats?.blacklisted ?? 0,
      icon: IconUserX,
      iconColor: "text-red-500",
    },
  ]

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      {statsData.map((stat) => (
        <StatCard key={stat.label} {...stat} isLoading={isLoading} />
      ))}
    </div>
  )
}
