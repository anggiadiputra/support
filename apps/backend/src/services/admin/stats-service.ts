import { prisma } from '../../utils/database.js'
import { connectionManager } from '../../websocket/connection-manager.js'

export interface UserStats {
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

export interface MessageStats {
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

export interface ConnectionStats {
  activeWebsockets: number
  onlineUsers: number
  wabaConnected: number
  wabaDisconnected: number
  wabaPending: number
  instagramConnected: number
  messengerConnected: number
}

export interface AdminStats {
  users: UserStats
  messages: MessageStats
  connections: ConnectionStats
}

export interface MessageVolumeData {
  date: string
  messages: number
}


export class AdminStatsService {
  /**
   * Get user statistics - total, active, by role, by tier
   * Requirements: 2.1, 2.2
   */
  static async getUserStats(): Promise<UserStats> {
    const now = new Date()
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

    const [
      total,
      activeLastWeek,
      adminCount,
      businessOwnerCount,
      agentCount,
      freeCount,
      liteCount,
      proCount
    ] = await Promise.all([
      // Total users
      prisma.user.count(),
      
      // Active users in last 7 days (users who logged in)
      prisma.user.count({
        where: {
          lastLoginAt: { gte: oneWeekAgo }
        }
      }),
      
      // By role
      prisma.user.count({ where: { role: 'ADMIN' } }),
      prisma.user.count({ where: { role: 'BUSINESS_OWNER' } }),
      prisma.user.count({ where: { role: 'AGENT' } }),
      
      // By subscription tier (count users, not subscriptions)
      // Users with FREE subscription OR no subscription at all
      prisma.user.count({
        where: {
          OR: [
            { subscription: { tier: 'FREE' } },
            { subscription: null }
          ]
        }
      }),
      prisma.user.count({ where: { subscription: { tier: 'LITE' } } }),
      prisma.user.count({ where: { subscription: { tier: 'PRO' } } })
    ])

    return {
      total,
      activeLastWeek,
      byRole: {
        ADMIN: adminCount,
        BUSINESS_OWNER: businessOwnerCount,
        AGENT: agentCount
      },
      byTier: {
        FREE: freeCount,
        LITE: liteCount,
        PRO: proCount
      }
    }
  }

  /**
   * Get message statistics - total, daily, by channel, delivery rate
   * Requirements: 2.3, 2.4, 2.5, 2.6
   */
  static async getMessageStats(): Promise<MessageStats> {
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

    const [
      total,
      today,
      thisWeek,
      thisMonth,
      whatsappCount,
      deliveredCount,
      sentCount
    ] = await Promise.all([
      // Total messages
      prisma.message.count(),
      
      // Today's messages
      prisma.message.count({
        where: { timestamp: { gte: startOfToday } }
      }),
      
      // This week's messages
      prisma.message.count({
        where: { timestamp: { gte: oneWeekAgo } }
      }),
      
      // This month's messages
      prisma.message.count({
        where: { timestamp: { gte: oneMonthAgo } }
      }),
      
      // WhatsApp messages (from Message table - source API or WHATSAPP_APP)
      prisma.message.count({
        where: {
          OR: [
            { source: 'API' },
            { source: 'WHATSAPP_APP' }
          ]
        }
      }),
      
      // Delivered messages for delivery rate
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          status: { in: ['DELIVERED', 'READ'] }
        }
      }),
      
      // Total sent messages
      prisma.message.count({
        where: { direction: 'OUTBOUND' }
      })
    ])

    // Instagram messages count
    const instagramCount = await prisma.iGMessage.count()
    
    // Messenger messages count
    const messengerCount = await prisma.messengerMessage.count()

    // Calculate delivery rate
    const deliveryRate = sentCount > 0 
      ? Math.round((deliveredCount / sentCount) * 100 * 10) / 10 
      : 0

    return {
      total: total + instagramCount + messengerCount,
      today,
      thisWeek,
      thisMonth,
      byChannel: {
        whatsapp: whatsappCount,
        instagram: instagramCount,
        messenger: messengerCount
      },
      deliveryRate
    }
  }

  /**
   * Get connection statistics - websocket, WABA, Instagram, Messenger
   * Requirements: 2.4, 2.5, 2.6
   */
  static async getConnectionStats(): Promise<ConnectionStats> {
    // WebSocket connections from connection manager
    const activeWebsockets = connectionManager.getTotalConnections()
    const onlineUsers = connectionManager.getOnlineUsersCount()

    const [
      wabaConnected,
      wabaDisconnected,
      wabaPending,
      instagramConnected,
      messengerConnected
    ] = await Promise.all([
      // WABA connected accounts
      prisma.whatsAppAccount.count({
        where: { connectionStatus: 'connected' }
      }),

      // WABA disconnected accounts
      prisma.whatsAppAccount.count({
        where: { connectionStatus: 'disconnected' }
      }),

      // WABA pending accounts
      prisma.whatsAppAccount.count({
        where: {
          connectionStatus: 'pending'
        }
      }),

      // Instagram connected accounts
      prisma.instagramAccount.count({
        where: { connectionStatus: 'connected' }
      }),

      // Facebook/Messenger connected pages
      prisma.facebookPage.count({
        where: { connectionStatus: 'connected' }
      })
    ])

    return {
      activeWebsockets,
      onlineUsers,
      wabaConnected,
      wabaDisconnected,
      wabaPending,
      instagramConnected,
      messengerConnected
    }
  }

  /**
   * Get all admin stats combined
   */
  static async getAllStats(): Promise<AdminStats> {
    const [users, messages, connections] = await Promise.all([
      this.getUserStats(),
      this.getMessageStats(),
      this.getConnectionStats()
    ])

    return {
      users,
      messages,
      connections
    }
  }

  /**
   * Get message volume per day for the last N days
   * Requirements: 2.3 - Message volume chart
   */
  static async getMessageVolume(days: number = 30): Promise<MessageVolumeData[]> {
    const now = new Date()
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
    
    // Get WhatsApp messages grouped by date
    const whatsappMessages = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE(timestamp) as date, COUNT(*) as count
      FROM "Message"
      WHERE timestamp >= ${startDate}
      GROUP BY DATE(timestamp)
      ORDER BY date ASC
    `

    // Get Instagram messages grouped by date
    const instagramMessages = await prisma.$queryRaw<Array<{ date: string; count: bigint }>>`
      SELECT DATE("createdAt") as date, COUNT(*) as count
      FROM "IGMessage"
      WHERE "createdAt" >= ${startDate}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `

    // Create a map of all dates with their counts
    const volumeMap = new Map<string, number>()
    
    // Initialize all dates with 0
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(now)
      date.setDate(date.getDate() - i)
      const dateStr = date.toISOString().split('T')[0]
      volumeMap.set(dateStr, 0)
    }

    // Add WhatsApp message counts
    for (const row of whatsappMessages) {
      const dateStr = new Date(row.date).toISOString().split('T')[0]
      const current = volumeMap.get(dateStr) || 0
      volumeMap.set(dateStr, current + Number(row.count))
    }

    // Add Instagram message counts
    for (const row of instagramMessages) {
      const dateStr = new Date(row.date).toISOString().split('T')[0]
      const current = volumeMap.get(dateStr) || 0
      volumeMap.set(dateStr, current + Number(row.count))
    }

    // Convert map to array
    const result: MessageVolumeData[] = []
    for (const [date, messages] of volumeMap) {
      result.push({ date, messages })
    }

    return result.sort((a, b) => a.date.localeCompare(b.date))
  }
}
