console.log('Loading memoryWorker module...')

import { Worker, Job } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUE_NAMES, memoryQueue } from '../utils/queue.js'
import { createMemoryVectorStore, MemoryVectorStore } from '../services/ai/memory/index.js'
import { OpenAIProvider } from '../services/ai/providers/OpenAIProvider.js'
import { logger } from '../utils/logger.js'
import { adminSettingsService } from '../services/admin/settings-service.js'
import type { OpenAISettings } from '../types/admin-settings.js'

console.log('memoryWorker imports loaded')

// =============================================================================
// Job Types & Interfaces
// =============================================================================

export type MemoryJobType = 'embed-memory' | 'cleanup-old' | 'retry-failed'

export interface EmbedMemoryJobData {
    type: 'embed-memory'
    memoryId: string
}

export interface CleanupOldJobData {
    type: 'cleanup-old'
    olderThanDays?: number // default 90
}

export interface RetryFailedJobData {
    type: 'retry-failed'
    limit?: number // default 100
}

export type MemoryJobData = EmbedMemoryJobData | CleanupOldJobData | RetryFailedJobData

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRY_COUNT = 3
const DEFAULT_CLEANUP_DAYS = 90
const DEFAULT_RETRY_LIMIT = 100

// =============================================================================
// Redis Connection (same pattern as webhookWorker)
// =============================================================================

const redisConnection = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
    family: 4,
})

// =============================================================================
// Service Instances
// =============================================================================

let memoryVectorStore: MemoryVectorStore | null = null
let lastApiKeyHash: string | null = null

/**
 * Simple hash for API key comparison
 */
function hashKey(key: string): string {
    let hash = 0
    for (let i = 0; i < key.length; i++) {
        const char = key.charCodeAt(i)
        hash = ((hash << 5) - hash) + char
        hash = hash & hash
    }
    return hash.toString()
}

/**
 * Get or create the MemoryVectorStore instance.
 * Fetches API key from database (admin settings), falls back to env.
 */
async function getMemoryVectorStore(): Promise<MemoryVectorStore> {
    try {
        // Try to get API key from database first
        const response = await adminSettingsService.getSettings<OpenAISettings>('openai', false)
        const dbApiKey = response.data.apiKey
        const baseUrl = response.data.baseUrl
        const embeddingModel = response.data.embeddingModel

        if (dbApiKey && !dbApiKey.includes('****')) {
            const newHash = hashKey(dbApiKey)
            
            // Recreate if API key changed or not initialized
            if (!memoryVectorStore || newHash !== lastApiKeyHash) {
                const openaiProvider = new OpenAIProvider(dbApiKey, baseUrl || undefined, embeddingModel || undefined)
                memoryVectorStore = createMemoryVectorStore(openaiProvider)
                lastApiKeyHash = newHash
                logger.info('MemoryVectorStore initialized with database API key')
            }
            
            return memoryVectorStore
        }
    } catch (error) {
        logger.warn('Failed to get OpenAI settings from database, falling back to env', {
            error: error instanceof Error ? error.message : 'Unknown error'
        })
    }

    // Fallback to environment variable
    if (!memoryVectorStore) {
        const apiKey = process.env.OPENAI_API_KEY
        if (!apiKey) {
            throw new Error('OPENAI_API_KEY not found in database or environment variables')
        }

        const openaiProvider = new OpenAIProvider(apiKey)
        memoryVectorStore = createMemoryVectorStore(openaiProvider)
        lastApiKeyHash = hashKey(apiKey)
        logger.info('MemoryVectorStore initialized with env API key')
    }
    
    return memoryVectorStore
}

// =============================================================================
// Job Processors
// =============================================================================

/**
 * Process embed-memory job: Generate and store embedding for a memory record.
 */
async function processEmbedMemory(memoryId: string): Promise<void> {
    const store = await getMemoryVectorStore()

    try {
        await store.storeEmbedding(memoryId)
        logger.info(`Embedding stored for memory ${memoryId}`)
    } catch (error) {
        // Increment retry count in database
        const newRetryCount = await store.incrementRetryCount(memoryId)
        logger.warn(`Embedding failed for memory ${memoryId}, retry count: ${newRetryCount}`)

        // If max retries reached, mark as failed and don't throw
        if (newRetryCount >= MAX_RETRY_COUNT) {
            await store.markAsFailed(memoryId)
            logger.error(`Memory ${memoryId} marked as FAILED after ${MAX_RETRY_COUNT} retries`)
            return // Don't throw - job is complete (failed state)
        }

        // Throw to trigger BullMQ retry with exponential backoff
        throw error
    }
}

/**
 * Process cleanup-old job: Delete memories older than specified days.
 */
async function processCleanupOld(olderThanDays: number = DEFAULT_CLEANUP_DAYS): Promise<void> {
    const store = await getMemoryVectorStore()
    const deletedCount = await store.deleteOldMemories(olderThanDays)
    logger.info(`Cleaned up ${deletedCount} memories older than ${olderThanDays} days`)
}

/**
 * Process retry-failed job: Reset failed memories and re-queue them.
 */
async function processRetryFailed(limit: number = DEFAULT_RETRY_LIMIT): Promise<void> {
    const store = await getMemoryVectorStore()
    const failedMemories = await store.getFailedMemories(limit)

    if (failedMemories.length === 0) {
        logger.info('No failed memories to retry')
        return
    }

    logger.info(`Retrying ${failedMemories.length} failed memories`)

    for (const memory of failedMemories) {
        // Reset to PENDING status
        await store.resetForRetry(memory.id)

        // Add new embed-memory job to queue
        await memoryQueue.add('embed-memory', {
            type: 'embed-memory',
            memoryId: memory.id,
        } as EmbedMemoryJobData)
    }

    logger.info(`Queued ${failedMemories.length} memories for retry`)
}

// =============================================================================
// Main Job Processor
// =============================================================================

/**
 * Process memory queue jobs based on type.
 */
async function processMemoryJob(job: Job<MemoryJobData>): Promise<void> {
    const { data } = job

    logger.debug(`Processing memory job ${job.id}, type: ${data.type}`)

    switch (data.type) {
        case 'embed-memory':
            await processEmbedMemory((data as EmbedMemoryJobData).memoryId)
            break

        case 'cleanup-old':
            await processCleanupOld((data as CleanupOldJobData).olderThanDays)
            break

        case 'retry-failed':
            await processRetryFailed((data as RetryFailedJobData).limit)
            break

        default:
            logger.error(`Unknown memory job type: ${(data as any).type}`)
            throw new Error(`Unknown memory job type: ${(data as any).type}`)
    }
}

// =============================================================================
// Worker Instance
// =============================================================================

let memoryWorker: Worker<MemoryJobData> | null = null

/**
 * Start the memory worker.
 * @returns The worker instance
 */
export function startMemoryWorker(): Worker<MemoryJobData> {
    if (memoryWorker) {
        logger.warn('Memory worker already started')
        return memoryWorker
    }

    memoryWorker = new Worker<MemoryJobData>(
        QUEUE_NAMES.MEMORY,
        processMemoryJob,
        {
            connection: redisConnection,
            concurrency: 5, // Process up to 5 embedding jobs concurrently
        }
    )

    // Worker event handlers
    memoryWorker.on('completed', (job) => {
        logger.debug(`Memory worker completed job ${job.id}`)
    })

    memoryWorker.on('failed', (job, err) => {
        logger.error(`Memory worker failed job ${job?.id}: ${err.message}`)
    })

    memoryWorker.on('error', (err) => {
        logger.error(`Memory worker error: ${err.message}`)
    })

    logger.info('Memory worker started')
    console.log('Memory worker started')

    return memoryWorker
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

process.on('SIGTERM', async () => {
    console.log('Closing memory worker...')
    if (memoryWorker) {
        await memoryWorker.close()
    }
    await redisConnection.quit()
    console.log('Memory worker closed')
})

// =============================================================================
// Auto-start when imported (same pattern as webhookWorker)
// =============================================================================

// Start worker immediately when this module is imported
startMemoryWorker()

export { memoryWorker }
