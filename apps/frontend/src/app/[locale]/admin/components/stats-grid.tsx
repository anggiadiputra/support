"use client"

import { Users, MessageSquare, MessageCircle, Instagram, Facebook } from "lucide-react"
import { StatsCard } from "./stats-card"

interface UserStats {
  total: number
  activeLastWeek: number
  byRole: {
    ADMIN: number
    BUSINESS_OWNER: number
    AGENT: number
  }
  byTier: {
    FREE: number
    LITE: number
    PRO: number
  }
}

interface MessageStats {
  total: number
  today: number
  thisWeek: number
  thisMonth: number
  byChannel: {
    whatsapp: number
    instagram: number
    messenger: number
  }
  deliveryRate: number
}

interface ConnectionStats {
  activeWebsockets: number
  onlineUsers: number
  wabaConnected: number
  wabaDisconnected: number
  wabaPending: number
  instagramConnected: number
  messengerConnected: number
}

interface StatsGridProps {
  users?: UserStats
  messages?: MessageStats
  connections?: ConnectionStats
  isLoading?: boolean
}

export function StatsGrid({ users, messages, connections, isLoading }: StatsGridProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
      <StatsCard
        title="Total Users"
        value={users?.total ?? 0}
        description={`${users?.byTier.PRO ?? 0} PRO, ${users?.byTier.LITE ?? 0} LITE, ${users?.byTier.FREE ?? 0} FREE`}
        icon={Users}
        isLoading={isLoading}
      />
      <StatsCard
        title="Total Messages"
        value={messages?.total ?? 0}
        description={`${messages?.deliveryRate ?? 0}% delivery rate`}
        icon={MessageSquare}
        isLoading={isLoading}
      />
      <StatsCard
        title="WABA Connected"
        value={connections?.wabaConnected ?? 0}
        description="Active WABA accounts"
        icon={MessageCircle}
        isLoading={isLoading}
      />
      <StatsCard
        title="Instagram Accounts"
        value={connections?.instagramConnected ?? 0}
        description="Connected accounts"
        icon={Instagram}
        isLoading={isLoading}
      />
      <StatsCard
        title="Facebook Pages"
        value={connections?.messengerConnected ?? 0}
        description="Connected Messenger pages"
        icon={Facebook}
        isLoading={isLoading}
      />
      <StatsCard
        title="Messages Today"
        value={messages?.today ?? 0}
        description={`${messages?.thisWeek ?? 0} this week`}
        icon={MessageSquare}
        isLoading={isLoading}
      />
      <StatsCard
        title="Messages This Month"
        value={messages?.thisMonth ?? 0}
        description={`WA: ${messages?.byChannel.whatsapp ?? 0}, IG: ${messages?.byChannel.instagram ?? 0}, FB: ${messages?.byChannel.messenger ?? 0}`}
        icon={MessageSquare}
        isLoading={isLoading}
      />
    </div>
  )
}
