import { prisma } from '../../utils/database.js'

export interface SystemMetrics {
  totalUsers: number
  connectedUsers: number
  disconnectedUsers: number
  totalPhoneNumbers: number
  totalTemplates: number
  approvedTemplates: number
  totalMessages: number
  messagesLast24h: number
}

export class WABAMetrics {
  /**
   * Get system-wide WABA metrics
   */
  async getSystemMetrics(): Promise<SystemMetrics> {
    const [
      users,
      phoneNumbers,
      templates,
      approvedTemplates,
      totalMessages,
      messagesLast24h
    ] = await Promise.all([
      prisma.whatsAppAccount.findMany({
        select: { connectionStatus: true }
      }),
      prisma.phoneNumber.count(),
      prisma.messageTemplate.count(),
      prisma.messageTemplate.count({
        where: { status: 'APPROVED' }
      }),
      prisma.message.count(),
      prisma.message.count({
        where: {
          timestamp: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000)
          }
        }
      })
    ])

    return {
      totalUsers: users.length,
      connectedUsers: users.filter(u => u.connectionStatus === 'connected').length,
      disconnectedUsers: users.filter(u => u.connectionStatus === 'disconnected').length,
      totalPhoneNumbers: phoneNumbers,
      totalTemplates: templates,
      approvedTemplates,
      totalMessages,
      messagesLast24h
    }
  }

  /**
   * Get metrics for a specific user
   */
  async getUserMetrics(userId: string) {
    const [
      user,
      phoneNumbers,
      templates,
      messages,
      customers
    ] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: {
          qualityRatings: {
            orderBy: { measuredAt: 'desc' },
            take: 1
          }
        }
      }),
      prisma.phoneNumber.count({ where: { userId } }),
      prisma.messageTemplate.count({ where: { userId } }),
      prisma.message.count({ where: { userId } }),
      prisma.customer.count({ where: { userId } })
    ])

    return {
      user,
      phoneNumbers,
      templates,
      messages,
      customers,
      latestQualityRating: user?.qualityRatings[0]
    }
  }
}

export const wabaMetrics = new WABAMetrics()
