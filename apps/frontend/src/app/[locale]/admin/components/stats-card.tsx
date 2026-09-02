"use client"

import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { LucideIcon } from "lucide-react"

interface StatsCardProps {
  title: string
  value: string | number
  description?: string
  icon?: LucideIcon
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  isLoading?: boolean
  className?: string
}

export function StatsCard({
  title,
  value,
  description,
  icon: Icon,
  trend,
  isLoading,
  className,
}: StatsCardProps) {
  if (isLoading) {
    return (
      <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4", className)}>
        <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow", className)}>
      {Icon && (
        <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center shrink-0">
          <Icon className="w-5.5 h-5.5 text-white" />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider truncate">{title}</p>
        <p className="text-2xl font-black text-gray-900 mt-0.5">{value.toLocaleString()}</p>
        {description && (
          <p className="text-xs text-gray-500 mt-0.5 truncate">{description}</p>
        )}
        {trend && (
          <p className={cn(
            "text-xs font-semibold mt-1",
            trend.isPositive ? "text-emerald-600" : "text-red-600"
          )}>
            {trend.isPositive ? "+" : ""}{trend.value}% {trend.label}
          </p>
        )}
      </div>
    </div>
  )
}
