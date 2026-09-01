import cron from 'node-cron'
import { logger } from '../utils/logger.js'
import { memoryQueue } from '../utils/queue.js'

/**
 * Memory Cleanup Cron Jobs
 * 
 * 1. Cleanup old memories - Runs daily at 3:00 AM
 *    Deletes memories older than 90 days
 * 
 * 2. Retry failed embeddings - Runs every 6 hours
 *    Re-queues memories with status=FAILED for embedding retry
 */

/**
 * Start memory cleanup cron jobs
 */
export function startMemoryCleanupJobs() {
  // 1. Cleanup old memories - Daily at 3:00 AM
  cron.schedule('0 3 * * *', async () => {
    try {
      logger.info('Starting memory cleanup job...')
      
      // Queue cleanup job to be processed by memory worker
      await memoryQueue.add('cleanup-old', {
        type: 'cleanup-old',
        olderThanDays: 90
      }, {
        removeOnComplete: true,
        removeOnFail: false
      })
      
      logger.info('Memory cleanup job queued')
    } catch (error) {
      logger.error('Error queueing memory cleanup job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
  
  logger.info('Memory cleanup cron job started (runs daily at 3:00 AM)')

  // 2. Retry failed embeddings - Every 6 hours (0:00, 6:00, 12:00, 18:00)
  cron.schedule('0 */6 * * *', async () => {
    try {
      logger.info('Starting retry failed embeddings job...')
      
      // Queue retry job to be processed by memory worker
      await memoryQueue.add('retry-failed', {
        type: 'retry-failed',
        limit: 100
      }, {
        removeOnComplete: true,
        removeOnFail: false
      })
      
      logger.info('Retry failed embeddings job queued')
    } catch (error) {
      logger.error('Error queueing retry failed job', {
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
  })
  
  logger.info('Retry failed embeddings cron job started (runs every 6 hours)')
}
