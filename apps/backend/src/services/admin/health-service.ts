import { prisma } from '../../utils/database.js'
import { connectionManager } from '../../websocket/connection-manager.js'
import { webhookQueue, messageQueue, webhookOutboundQueue, documentQueue, QUEUE_NAMES } from '../../utils/queue.js'
import type { Job } from 'bullmq'

export interface DatabaseHealth {
  status: 'healthy' | 'unhealthy'
  latencyMs: number
  error?: string
}

export interface RedisHealth {
  status: 'healthy' | 'unhealthy'
  latencyMs: number
  error?: string
}

export interface QueueStats {
  pending: number
  active: number
  completed: number
  failed: number
  delayed: number
  byQueue: {
    webhook: { pending: number; active: number; completed: number; failed: number }
    message: { pending: number; active: number; completed: number; failed: number }
    webhookOutbound: { pending: number; active: number; completed: number; failed: number }
    document: { pending: number; active: number; completed: number; failed: number }
  }
}

export interface WebsocketStats {
  activeConnections: number
  onlineUsers: number
}

export interface WebhookStats {
  successRate24h: number
  totalDeliveries24h: number
  successCount24h: number
  failedCount24h: number
}

export interface SystemHealth {
  database: DatabaseHealth
  redis: RedisHealth
  queue: QueueStats
  websocket: WebsocketStats
  webhooks: WebhookStats
  overall: 'healthy' | 'degraded' | 'unhealthy'
}

export interface FailedJobDetails {
  id: string | number
  name: string
  queue: string
  data: unknown
  failedReason: string | undefined
  stacktrace: string[] | undefined
  attemptsMade: number
  failedAt: Date | undefined
}

export interface FailedJobsResponse {
  failedJobs: FailedJobDetails[]
  totalFailed: number
}


export class AdminHealthService {
  /**
   * Check database connection and latency
   * Requirements: 6.1
   */
  static async checkDatabase(): Promise<DatabaseHealth> {
    const start = Date.now()
    try {
      // Simple query to check connection
      await prisma.$queryRaw`SELECT 1`
      const latencyMs = Date.now() - start

      return {
        status: 'healthy',
        latencyMs
      }
    } catch (error) {
      const latencyMs = Date.now() - start
      return {
        status: 'unhealthy',
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown database error'
      }
    }
  }

  /**
   * Check Redis connection and latency
   * Requirements: 6.2
   */
  static async checkRedis(): Promise<RedisHealth> {
    const start = Date.now()
    try {
      // Use webhookQueue's client to ping Redis
      const client = await webhookQueue.client
      await (client as unknown as { ping(): Promise<string> }).ping()
      const latencyMs = Date.now() - start

      return {
        status: 'healthy',
        latencyMs
      }
    } catch (error) {
      const latencyMs = Date.now() - start
      return {
        status: 'unhealthy',
        latencyMs,
        error: error instanceof Error ? error.message : 'Unknown Redis error'
      }
    }
  }

  /**
   * Get BullMQ queue statistics
   * Requirements: 6.3
   */
  static async getQueueStats(): Promise<QueueStats> {
    const [webhookCounts, messageCounts, webhookOutboundCounts, documentCounts] = await Promise.all([
      webhookQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      messageQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      webhookOutboundQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed'),
      documentQueue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed')
    ])

    return {
      pending: webhookCounts.waiting + messageCounts.waiting + webhookOutboundCounts.waiting + documentCounts.waiting,
      active: webhookCounts.active + messageCounts.active + webhookOutboundCounts.active + documentCounts.active,
      completed: webhookCounts.completed + messageCounts.completed + webhookOutboundCounts.completed + documentCounts.completed,
      failed: webhookCounts.failed + messageCounts.failed + webhookOutboundCounts.failed + documentCounts.failed,
      delayed: webhookCounts.delayed + messageCounts.delayed + webhookOutboundCounts.delayed + documentCounts.delayed,
      byQueue: {
        webhook: {
          pending: webhookCounts.waiting,
          active: webhookCounts.active,
          completed: webhookCounts.completed,
          failed: webhookCounts.failed
        },
        message: {
          pending: messageCounts.waiting,
          active: messageCounts.active,
          completed: messageCounts.completed,
          failed: messageCounts.failed
        },
        webhookOutbound: {
          pending: webhookOutboundCounts.waiting,
          active: webhookOutboundCounts.active,
          completed: webhookOutboundCounts.completed,
          failed: webhookOutboundCounts.failed
        },
        document: {
          pending: documentCounts.waiting,
          active: documentCounts.active,
          completed: documentCounts.completed,
          failed: documentCounts.failed
        }
      }
    }
  }

  /**
   * Get WebSocket connection statistics
   */
  static getWebsocketStats(): WebsocketStats {
    return {
      activeConnections: connectionManager.getTotalConnections(),
      onlineUsers: connectionManager.getOnlineUsersCount()
    }
  }

  /**
   * Get webhook delivery statistics for last 24 hours
   * Requirements: 6.4
   */
  static async getWebhookStats(): Promise<WebhookStats> {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000)

    const [totalDeliveries, successCount] = await Promise.all([
      prisma.webhookDeliveryLog.count({
        where: { createdAt: { gte: twentyFourHoursAgo } }
      }),
      prisma.webhookDeliveryLog.count({
        where: {
          createdAt: { gte: twentyFourHoursAgo },
          status: 'success'
        }
      })
    ])

    const failedCount = totalDeliveries - successCount
    const successRate = totalDeliveries > 0
      ? Math.round((successCount / totalDeliveries) * 100 * 10) / 10
      : 100 // If no deliveries, consider it 100%

    return {
      successRate24h: successRate,
      totalDeliveries24h: totalDeliveries,
      successCount24h: successCount,
      failedCount24h: failedCount
    }
  }

  /**
   * Determine overall health status
   * Requirements: 6.5
   */
  static determineOverallHealth(
    database: DatabaseHealth,
    redis: RedisHealth,
    queue: QueueStats
  ): 'healthy' | 'degraded' | 'unhealthy' {
    // If database or Redis is down, system is unhealthy
    if (database.status === 'unhealthy' || redis.status === 'unhealthy') {
      return 'unhealthy'
    }

    // If there are many failed jobs, system is degraded
    const totalFailed = queue.failed
    if (totalFailed > 100) {
      return 'degraded'
    }

    // If latency is high, system is degraded
    if (database.latencyMs > 1000 || redis.latencyMs > 500) {
      return 'degraded'
    }

    return 'healthy'
  }

  /**
   * Get complete system health status
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  static async getSystemHealth(): Promise<SystemHealth> {
    const [database, redis, queue, webhooks] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
      this.getQueueStats(),
      this.getWebhookStats()
    ])

    const websocket = this.getWebsocketStats()
    const overall = this.determineOverallHealth(database, redis, queue)

    return {
      database,
      redis,
      queue,
      websocket,
      webhooks,
      overall
    }
  }

  /**
   * Get failed jobs from all queues
   * @param limit - Maximum number of failed jobs to return per queue
   */
  static async getFailedJobs(limit: number = 20): Promise<FailedJobsResponse> {
    const queues = [
      { name: QUEUE_NAMES.WEBHOOK, queue: webhookQueue, label: 'webhook' },
      { name: QUEUE_NAMES.MESSAGE, queue: messageQueue, label: 'message' },
      { name: QUEUE_NAMES.WEBHOOK_OUTBOUND, queue: webhookOutboundQueue, label: 'webhookOutbound' },
      { name: QUEUE_NAMES.DOCUMENT, queue: documentQueue, label: 'document' },
    ]

    const failedJobs: FailedJobDetails[] = []

    for (const { name, queue, label } of queues) {
      const jobs = await queue.getFailed(0, limit) as Job[]
      for (const job of jobs) {
        failedJobs.push({
          id: job.id,
          name: job.name,
          queue: label,
          data: job.data,
          failedReason: job.failedReason,
          stacktrace: job.stacktrace,
          attemptsMade: job.attemptsMade,
          failedAt: job.processedOn ? new Date(job.processedOn) : undefined,
        })
      }
    }

    // Sort by failed date (newest first)
    failedJobs.sort((a, b) => {
      if (!a.failedAt) return 1
      if (!b.failedAt) return -1
      return b.failedAt.getTime() - a.failedAt.getTime()
    })

    // Get total failed count
    const [webhookFailed, messageFailed, webhookOutboundFailed, documentFailed] = await Promise.all([
      webhookQueue.getJobCounts('failed'),
      messageQueue.getJobCounts('failed'),
      webhookOutboundQueue.getJobCounts('failed'),
      documentQueue.getJobCounts('failed'),
    ])

    const totalFailed = webhookFailed.failed + messageFailed.failed + webhookOutboundFailed.failed + documentFailed.failed

    return {
      failedJobs: failedJobs.slice(0, limit * queues.length),
      totalFailed
    }
  }

  /**
   * Retry a failed job
   * @param queueName - Queue name ('webhook' | 'message' | 'webhookOutbound' | 'document')
   * @param jobId - Job ID to retry
   */
  static async retryFailedJob(queueName: 'webhook' | 'message' | 'webhookOutbound' | 'document', jobId: string): Promise<boolean> {
    let queue
    switch (queueName) {
      case 'webhook':
        queue = webhookQueue
        break
      case 'message':
        queue = messageQueue
        break
      case 'webhookOutbound':
        queue = webhookOutboundQueue
        break
      case 'document':
        queue = documentQueue
        break
      default:
        throw new Error(`Invalid queue name: ${queueName}`)
    }

    const job = await queue.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${queueName}`)
    }

    await job.retry()
    return true
  }

  /**
   * Delete a failed job
   * @param queueName - Queue name ('webhook' | 'message' | 'webhookOutbound' | 'document')
   * @param jobId - Job ID to delete
   */
  static async deleteFailedJob(queueName: 'webhook' | 'message' | 'webhookOutbound' | 'document', jobId: string): Promise<boolean> {
    let queue
    switch (queueName) {
      case 'webhook':
        queue = webhookQueue
        break
      case 'message':
        queue = messageQueue
        break
      case 'webhookOutbound':
        queue = webhookOutboundQueue
        break
      case 'document':
        queue = documentQueue
        break
      default:
        throw new Error(`Invalid queue name: ${queueName}`)
    }

    const job = await queue.getJob(jobId)
    if (!job) {
      throw new Error(`Job ${jobId} not found in queue ${queueName}`)
    }

    await job.remove()
    return true
  }

  /**
   * Delete all failed jobs from all queues
   */
  static async deleteAllFailedJobs(): Promise<number> {
    const queues = [
      { name: 'webhook', queue: webhookQueue },
      { name: 'message', queue: messageQueue },
      { name: 'webhookOutbound', queue: webhookOutboundQueue },
      { name: 'document', queue: documentQueue },
    ]

    let totalDeleted = 0
    for (const { name, queue } of queues) {
      const jobs = await queue.getFailed(0, 1000)
      for (const job of jobs) {
        await job.remove()
        totalDeleted++
      }
    }

    return totalDeleted
  }
}
