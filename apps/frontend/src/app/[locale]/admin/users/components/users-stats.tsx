"use client"

import { IconInfoCircle } from "@tabler/icons-react"
import {
  IconUsersGroup,
  IconUsersPlus,
  IconUserCheck,
  IconUserX,
} from "@tabler/icons-react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"

interface UserStatProps {
  title: string
  desc: string
  stat: string | number
  statDesc: string
  icon: React.ComponentType<{ size?: number; className?: string }>
}

interface UsersStatsProps {
  stats?: {
    totalUsers: number
    activeUsers: number
    inactiveUsers: number
    newUsersThisMonth: number
  }
  isLoading?: boolean
}

export function UsersStats({ stats, isLoading }: UsersStatsProps) {
  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4">
            <Skeleton className="w-12 h-12 rounded-xl shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-24" />
            </div>
          </div>
        ))}
      </div>
    )
  }

  const userStats: UserStatProps[] = [
    {
      title: "Total Users",
      desc: "Total number of registered users",
      stat: stats?.totalUsers ?? 0,
      statDesc: "All registered users",
      icon: IconUsersGroup,
    },
    {
      title: "Active Users",
      desc: "Users with active status",
      stat: stats?.activeUsers ?? 0,
      statDesc: `${stats?.totalUsers ? Math.round((stats.activeUsers / stats.totalUsers) * 100) : 0}% of all users`,
      icon: IconUserCheck,
    },
    {
      title: "Inactive Users",
      desc: "Users with inactive status",
      stat: stats?.inactiveUsers ?? 0,
      statDesc: `${stats?.totalUsers ? Math.round((stats.inactiveUsers / stats.totalUsers) * 100) : 0}% of all users`,
      icon: IconUserX,
    },
    {
      title: "New This Month",
      desc: "Users who joined this month",
      stat: stats?.newUsersThisMonth ?? 0,
      statDesc: "Joined in the last 30 days",
      icon: IconUsersPlus,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {userStats.map((stat) => (
        <UserStat key={stat.title} {...stat} />
      ))}
    </div>
  )
}

function UserStat(props: UserStatProps) {
  const Icon = props.icon
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-black rounded-xl flex items-center justify-center shrink-0">
        <Icon size={22} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase font-bold text-gray-400 tracking-wider truncate">{props.title}</p>
        <p className="text-2xl font-black text-gray-900 mt-0.5">{props.stat.toLocaleString()}</p>
        <p className="text-xs text-gray-500 mt-0.5 truncate">{props.statDesc}</p>
      </div>
    </div>
  )
}
