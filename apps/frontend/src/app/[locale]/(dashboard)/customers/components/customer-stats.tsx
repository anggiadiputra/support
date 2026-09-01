"use client"

import {
  IconUsers,
  IconUserCheck,
  IconClock,
  IconUserX,
} from "@tabler/icons-react"
import { Card, CardContent } from "@/components/ui/card"
import { useCustomerStats } from "@/hooks/use-customers"
import { useTranslations } from "next-intl"

interface StatCardProps {
  label: string
  value: number
  icon: React.ElementType
  iconColor: string
  isLoading?: boolean
}

function StatCard({ label, value, icon: Icon, iconColor, isLoading }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Icon className={`h-5 w-5 ${iconColor}`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-muted-foreground truncate">{label}</p>
            {isLoading ? (
              <div className="h-7 w-16 bg-muted animate-pulse rounded mt-1" />
            ) : (
              <p className="text-2xl font-bold">{value.toLocaleString()}</p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
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
