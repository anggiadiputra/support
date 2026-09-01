import { prisma } from '../../utils/database.js'

export interface AuditLogsQuery {
  page?: number
  limit?: number
  action?: string
  userId?: string
  entityType?: string
  startDate?: string
  endDate?: string
  search?: string
}

export interface AuditLogItem {
  id: string
  action: string
  entityType: string
  entityId: string
  details: unknown
  ipAddress: string | null
  timestamp: Date
  user: {
    id: string
    name: string
    email: string
  } | null
}

export interface AuditLogsResponse {
  logs: AuditLogItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  }
}

export class AdminAuditService {
  /**
   * Get audit logs with pagination and filters
   * Requirements: 7.1, 7.2, 7.3, 7.4
   */
  static async getAuditLogs(query: AuditLogsQuery): Promise<AuditLogsResponse> {
    const page = query.page || 1
    const limit = query.limit || 20
    const skip = (page - 1) * limit

    // Build where clause
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = {}

    if (query.action) {
      where.action = query.action
    }

    if (query.userId) {
      where.userId = query.userId
    }

    if (query.entityType) {
      where.entityType = query.entityType
    }

    if (query.startDate || query.endDate) {
      where.timestamp = {}
      if (query.startDate) {
        where.timestamp.gte = new Date(query.startDate)
      }
      if (query.endDate) {
        where.timestamp.lte = new Date(query.endDate)
      }
    }

    // Search filter - search across multiple fields
    if (query.search) {
      const searchTerm = query.search.trim()
      where.OR = [
        { entityId: { contains: searchTerm, mode: 'insensitive' } },
        { user: { name: { contains: searchTerm, mode: 'insensitive' } } },
        { user: { email: { contains: searchTerm, mode: 'insensitive' } } },
        { details: { string_contains: searchTerm } }
      ]
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit
      }),
      prisma.auditLog.count({ where })
    ])

    return {
      logs: logs.map(log => ({
        id: log.id,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        details: log.details,
        ipAddress: log.ipAddress,
        timestamp: log.timestamp,
        user: log.user
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    }
  }

  /**
   * Get distinct action types for filter dropdown
   */
  static async getActionTypes(): Promise<string[]> {
    const actions = await prisma.auditLog.findMany({
      select: { action: true },
      distinct: ['action'],
      orderBy: { action: 'asc' }
    })
    return actions.map(a => a.action)
  }

  /**
   * Get distinct entity types for filter dropdown
   */
  static async getEntityTypes(): Promise<string[]> {
    const entities = await prisma.auditLog.findMany({
      select: { entityType: true },
      distinct: ['entityType'],
      orderBy: { entityType: 'asc' }
    })
    return entities.map(e => e.entityType)
  }
}
