import { Queue, Worker, QueueEvents } from 'bullmq'
import { Redis } from 'ioredis'

// Redis connection configuration for Upstash
export const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    // Enable TLS for Upstash
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    // Upstash requires family 4 (IPv4)
    family: 4,
})

// Queue names
export const QUEUE_NAMES = {
    WEBHOOK: 'webhook-processing',
    MESSAGE: 'message-processing',
    WEBHOOK_OUTBOUND: 'webhook-outbound',
    MEMORY: 'memory-processing',
    BROADCAST: 'broadcast-processing',
    DOCUMENT: 'document-processing',
} as const

// Webhook Queue - for processing incoming webhooks
export const webhookQueue = new Queue(QUEUE_NAMES.WEBHOOK, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            count: 100, // Keep last 100 completed jobs
            age: 3600, // Remove after 1 hour
        },
        removeOnFail: {
            count: 500, // Keep last 500 failed jobs for debugging
        },
    },
})

// Message Queue - for processing outbound messages
export const messageQueue = new Queue(QUEUE_NAMES.MESSAGE, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: {
            count: 100,
            age: 3600,
        },
        removeOnFail: {
            count: 500,
        },
    },
})

// Webhook Outbound Queue - for delivering webhooks to external systems
// Retry delays: 1min, 5min, 30min, 2hr (as per requirements)
export const webhookOutboundQueue = new Queue(QUEUE_NAMES.WEBHOOK_OUTBOUND, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 5, // Initial attempt + 4 retries
        backoff: {
            type: 'custom',
        },
        removeOnComplete: {
            count: 1000,
            age: 86400, // 24 hours
        },
        removeOnFail: {
            count: 1000,
        },
    },
})

// Memory Queue - for processing conversation memory embeddings
export const memoryQueue = new Queue(QUEUE_NAMES.MEMORY, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000, // 1s, 2s, 4s
        },
        removeOnComplete: {
            count: 100,
            age: 3600, // Remove after 1 hour
        },
        removeOnFail: {
            count: 500, // Keep last 500 failed jobs for debugging
        },
    },
})

// Broadcast Queue - for processing bulk template sends with recovery support
export const broadcastQueue = new Queue(QUEUE_NAMES.BROADCAST, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 10s, 20s - longer delays for broadcast retries
        },
        removeOnComplete: {
            count: 100,
            age: 86400, // Keep for 24 hours (broadcasts are important)
        },
        removeOnFail: {
            count: 500,
        },
    },
})

// Document Queue - for processing knowledge base document uploads (PDF parsing + embeddings)
export const documentQueue = new Queue(QUEUE_NAMES.DOCUMENT, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 5000, // 5s, 10s, 20s - PDF processing can take time
        },
        removeOnComplete: {
            count: 100,
            age: 3600, // Remove after 1 hour
        },
        removeOnFail: {
            count: 500, // Keep failed jobs for debugging
        },
    },
})

// Queue Events for monitoring
export const webhookQueueEvents = new QueueEvents(QUEUE_NAMES.WEBHOOK, {
    connection: redisConnection,
})

export const messageQueueEvents = new QueueEvents(QUEUE_NAMES.MESSAGE, {
    connection: redisConnection,
})

export const webhookOutboundQueueEvents = new QueueEvents(QUEUE_NAMES.WEBHOOK_OUTBOUND, {
    connection: redisConnection,
})

export const memoryQueueEvents = new QueueEvents(QUEUE_NAMES.MEMORY, {
    connection: redisConnection,
})

export const broadcastQueueEvents = new QueueEvents(QUEUE_NAMES.BROADCAST, {
    connection: redisConnection,
})

export const documentQueueEvents = new QueueEvents(QUEUE_NAMES.DOCUMENT, {
    connection: redisConnection,
})

// Graceful shutdown
process.on('SIGTERM', async () => {
    console.log('📦 Closing queues...')
    await webhookQueue.close()
    await messageQueue.close()
    await webhookOutboundQueue.close()
    await memoryQueue.close()
    await broadcastQueue.close()
    await documentQueue.close()
    await webhookQueueEvents.close()
    await messageQueueEvents.close()
    await webhookOutboundQueueEvents.close()
    await memoryQueueEvents.close()
    await broadcastQueueEvents.close()
    await documentQueueEvents.close()
    await redisConnection.quit()
    console.log('✅ Queues closed')
})

// Error handling
webhookQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Webhook job ${jobId} failed:`, failedReason)
})

messageQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Message job ${jobId} failed:`, failedReason)
})

webhookOutboundQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Webhook outbound job ${jobId} failed:`, failedReason)
})

memoryQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Memory job ${jobId} failed:`, failedReason)
})

broadcastQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Broadcast job ${jobId} failed:`, failedReason)
})

// Success logging
webhookQueueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Webhook job ${jobId} completed`)
})

messageQueueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Message job ${jobId} completed`)
})

webhookOutboundQueueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Webhook outbound job ${jobId} completed`)
})

memoryQueueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Memory job ${jobId} completed`)
})

broadcastQueueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Broadcast job ${jobId} completed`)
})

documentQueueEvents.on('failed', ({ jobId, failedReason }) => {
    console.error(`❌ Document job ${jobId} failed:`, failedReason)
})

documentQueueEvents.on('completed', ({ jobId }) => {
    console.log(`✅ Document job ${jobId} completed`)
})
