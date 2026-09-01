/**
 * Broadcast Recovery Cron Job
 * 
 * Detects and recovers stuck broadcast jobs that were interrupted
 * (e.g., due to server restart, crash, or deployment).
 * 
 * Runs on startup and periodically to ensure no broadcasts are left orphaned.
 */

import cron from 'node-cron'
import { bulkTemplateSendService } from '../services/bulk-template-send-service.js'
import { broadcastQueue } from '../utils/queue.js'
import { logger } from '../utils/logger.js'

/**
 * Timeout in minutes to consider a job as stuck
 * If a job hasn't updated its heartbeat in this time, it's considered orphaned
 */
const STUCK_JOB_TIMEOUT_MINUTES = 5

/**
 * Recover stuck broadcast jobs by adding them to the queue for processing
 */
async function recoverStuckBroadcasts(): Promise<void> {
    try {
        const stuckJobIds = await bulkTemplateSendService.findStuckJobs(STUCK_JOB_TIMEOUT_MINUTES)

        if (stuckJobIds.length === 0) {
            logger.debug('No stuck broadcast jobs found')
            return
        }

        logger.info('Found stuck broadcast jobs, initiating recovery', {
            count: stuckJobIds.length,
            jobIds: stuckJobIds,
        })

        // Add each stuck job to the queue for resumption
        for (const jobId of stuckJobIds) {
            try {
                // Check if job is already in queue to avoid duplicates
                const existingJobs = await broadcastQueue.getJobs(['waiting', 'active', 'delayed'])
                const alreadyQueued = existingJobs.some(
                    (job) => job.data.jobId === jobId && job.data.type === 'resume'
                )

                if (alreadyQueued) {
                    logger.debug('Job already in queue, skipping', { jobId })
                    continue
                }

                // Add to queue for resumption
                await broadcastQueue.add(
                    'resume-broadcast',
                    {
                        type: 'resume',
                        jobId,
                    },
                    {
                        // Use job ID as deduplication key
                        jobId: `resume-${jobId}`,
                        // Remove duplicates if already exists
                        removeOnComplete: true,
                    }
                )

                logger.info('Queued stuck broadcast for recovery', { jobId })
            } catch (error: any) {
                logger.error('Failed to queue stuck broadcast for recovery', {
                    jobId,
                    error: error.message,
                })
            }
        }
    } catch (error: any) {
        logger.error('Error in broadcast recovery cron', { error: error.message })
    }
}

/**
 * Start the broadcast recovery cron job
 * 
 * - Runs immediately on startup to recover any broadcasts interrupted by restart
 * - Then runs every 5 minutes to catch any new stuck jobs
 */
export function startBroadcastRecoveryJob(): void {
    // Run immediately on startup
    logger.info('Running initial broadcast recovery check on startup...')
    recoverStuckBroadcasts().catch((err) => {
        logger.error('Initial broadcast recovery failed', { error: err.message })
    })

    // Schedule periodic checks every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
        logger.debug('Running scheduled broadcast recovery check')
        await recoverStuckBroadcasts()
    })

    console.log('🔄 Broadcast recovery cron job started (runs every 5 minutes + on startup)')
}

/**
 * Manually trigger recovery (useful for admin endpoints)
 */
export async function triggerBroadcastRecovery(): Promise<{ recoveredCount: number; jobIds: string[] }> {
    const stuckJobIds = await bulkTemplateSendService.findStuckJobs(STUCK_JOB_TIMEOUT_MINUTES)
    
    if (stuckJobIds.length === 0) {
        return { recoveredCount: 0, jobIds: [] }
    }

    await recoverStuckBroadcasts()
    
    return { recoveredCount: stuckJobIds.length, jobIds: stuckJobIds }
}
