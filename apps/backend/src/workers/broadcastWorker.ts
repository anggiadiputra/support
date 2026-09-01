/**
 * Broadcast Worker
 * 
 * Processes broadcast jobs from the queue with recovery support.
 * Handles both new broadcasts and resuming interrupted broadcasts.
 */

import { Worker, Job } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUE_NAMES } from '../utils/queue.js'
import { bulkTemplateSendService } from '../services/bulk-template-send-service.js'
import { logger } from '../utils/logger.js'

console.log('📦 Loading broadcastWorker module...')

// Redis connection configuration for Upstash
const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    family: 4,
})

/**
 * Job data structure for broadcast processing
 */
interface BroadcastJobData {
    type: 'new' | 'resume'
    jobId: string
    userId?: string
    messageDelayMs?: number
    senderPhoneNumberId?: string
}

/**
 * Broadcast Worker
 * 
 * Handles two types of jobs:
 * 1. 'new' - Start processing a new broadcast
 * 2. 'resume' - Resume an interrupted broadcast
 */
const broadcastWorker = new Worker<BroadcastJobData>(
    QUEUE_NAMES.BROADCAST,
    async (job: Job<BroadcastJobData>) => {
        const { type, jobId, userId, messageDelayMs, senderPhoneNumberId } = job.data

        logger.info('Processing broadcast job', {
            type,
            jobId,
            userId,
            senderPhoneNumberId,
            queueJobId: job.id,
        })

        try {
            if (type === 'resume') {
                // Resume an interrupted broadcast
                await bulkTemplateSendService.resumeBulkSend(jobId)
                logger.info('Broadcast resumed successfully', { jobId })
            } else if (type === 'new' && userId) {
                // Process a new broadcast
                await bulkTemplateSendService.processBulkSend(
                    jobId,
                    userId,
                    messageDelayMs || 1000,
                    senderPhoneNumberId
                )
                logger.info('Broadcast completed successfully', { jobId })
            } else {
                throw new Error(`Invalid broadcast job: type=${type}, userId=${userId}`)
            }
        } catch (error: any) {
            logger.error('Broadcast job failed', {
                type,
                jobId,
                error: error.message,
                stack: error.stack,
            })
            throw error // Re-throw to trigger retry
        }
    },
    {
        connection: redisConnection,
        concurrency: 10, // Process up to 10 broadcasts concurrently (across different accounts)
    }
)

// Event handlers
broadcastWorker.on('completed', (job) => {
    logger.info('Broadcast worker job completed', {
        jobId: job.id,
        broadcastJobId: job.data.jobId,
        type: job.data.type,
    })
})

broadcastWorker.on('failed', (job, err) => {
    logger.error('Broadcast worker job failed', {
        jobId: job?.id,
        broadcastJobId: job?.data.jobId,
        type: job?.data.type,
        error: err.message,
        attempts: job?.attemptsMade,
    })
})

broadcastWorker.on('error', (err) => {
    logger.error('Broadcast worker error', { error: err.message })
})

console.log('✅ Broadcast worker initialized')

export { broadcastWorker }
