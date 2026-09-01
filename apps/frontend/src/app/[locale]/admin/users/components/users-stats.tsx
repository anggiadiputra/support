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
  icon: React.ComponentType<{ size?: number }>
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
          <Card key={i}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pb-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-4" />
            </CardHeader>
            <CardContent className="pb-4">
              <Skeleton className="h-8 w-16 mb-1" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
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
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pt-4 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-medium">
          <props.icon size={16} />
          {props.title}
        </CardTitle>
        <TooltipProvider>
          <Tooltip delayDuration={50}>
            <TooltipTrigger>
              <IconInfoCircle className="text-muted-foreground scale-90 stroke-[1.25]" />
              <span className="sr-only">More Info</span>
            </TooltipTrigger>
            <TooltipContent>
              <p>{props.desc}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="text-2xl font-bold">{props.stat.toLocaleString()}</div>
        <p className="text-muted-foreground text-xs">{props.statDesc}</p>
      </CardContent>
    </Card>
  )
}
