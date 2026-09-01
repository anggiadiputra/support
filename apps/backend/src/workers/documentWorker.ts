console.log('Loading documentWorker module...')

import { Worker, Job } from 'bullmq'
import { Redis } from 'ioredis'
import { QUEUE_NAMES } from '../utils/queue.js'
import { AIOrchestrator } from '../services/ai/AIOrchestrator.js'
import { prisma } from '../utils/database.js'
import { logger } from '../utils/logger.js'

console.log('documentWorker imports loaded')

// =============================================================================
// Job Types & Interfaces
// =============================================================================

export type DocumentJobType = 'process-document'

export interface ProcessDocumentJobData {
    type: 'process-document'
    documentId: string
    fileBase64: string // File content as base64 (Buffer can't be serialized to Redis)
    mimeType: string
}

export type DocumentJobData = ProcessDocumentJobData

// =============================================================================
// Constants
// =============================================================================

const MAX_RETRY_COUNT = 3

// =============================================================================
// User-Friendly Error Messages
// =============================================================================

/**
 * Map of known error patterns to user-friendly messages.
 * Technical errors are sanitized to prevent exposing internal details.
 */
const ERROR_MESSAGES: Record<string, string> = {
    // PDF parsing errors (from DocumentProcessor.ts and pdf2json)
    'password': 'File PDF dilindungi password. Silakan upload file tanpa password.',
    'encrypted': 'File PDF terenkripsi. Silakan upload file tanpa enkripsi.',
    'unsupported encryption': 'File PDF terenkripsi. Silakan upload file tanpa enkripsi.',
    'corrupt': 'File PDF rusak atau tidak valid. Silakan upload file yang valid.',
    'invalid pdf': 'Format file tidak valid. Pastikan file adalah PDF yang valid.',
    'no text content': 'Tidak dapat mengekstrak teks dari PDF. Pastikan PDF berisi teks (bukan gambar scan).',
    'no text': 'Tidak dapat mengekstrak teks dari PDF. Pastikan PDF berisi teks (bukan gambar scan).',
    'invalid count value': 'Format PDF tidak didukung. Silakan coba export ulang PDF atau gunakan format yang lebih sederhana.',
    'infinity': 'Format PDF tidak didukung. Silakan coba export ulang PDF.',
    'unsupported formatting': 'Format PDF tidak didukung. Silakan coba export ulang PDF atau gunakan format yang lebih sederhana.',
    'pdfparser': 'Gagal membaca file PDF. Pastikan file tidak rusak.',
    'parsererror': 'Gagal membaca file PDF. Pastikan file tidak rusak.',
    
    // File type errors (from AIOrchestrator.ts)
    'unsupported mime': 'Tipe file tidak didukung. Saat ini hanya PDF yang didukung.',
    'unsupported file': 'Tipe file tidak didukung. Saat ini hanya PDF yang didukung.',
    
    // OpenAI/Embedding errors (from OpenAIProvider.ts)
    'embedding': 'Gagal memproses dokumen dengan AI. Silakan coba lagi.',
    'openai': 'Layanan AI tidak tersedia. Silakan coba lagi nanti.',
    'openai_api_key': 'Konfigurasi AI belum lengkap. Hubungi administrator.',
    'api key': 'Konfigurasi AI belum lengkap. Hubungi administrator.',
    'invalid_api_key': 'Konfigurasi AI tidak valid. Hubungi administrator.',
    'rate_limit': 'Terlalu banyak permintaan. Silakan tunggu sebentar dan coba lagi.',
    'rate limit': 'Terlalu banyak permintaan. Silakan tunggu sebentar dan coba lagi.',
    'insufficient_quota': 'Kuota layanan AI tercapai. Hubungi administrator.',
    'quota': 'Kuota layanan AI tercapai. Hubungi administrator.',
    'billing': 'Masalah billing layanan AI. Hubungi administrator.',
    'context_length': 'Dokumen terlalu panjang untuk diproses. Coba pecah menjadi beberapa file.',
    'max_tokens': 'Dokumen terlalu panjang untuk diproses. Coba pecah menjadi beberapa file.',
    
    // Database errors
    'database': 'Gagal menyimpan data. Silakan coba lagi.',
    'prisma': 'Gagal menyimpan data. Silakan coba lagi.',
    'unique constraint': 'Dokumen sudah pernah diupload sebelumnya.',
    'foreign key': 'Data terkait tidak ditemukan. Silakan coba lagi.',
    
    // Network/Connection errors
    'timeout': 'Waktu pemrosesan habis. Silakan coba dengan file yang lebih kecil.',
    'timedout': 'Waktu pemrosesan habis. Silakan coba dengan file yang lebih kecil.',
    'network': 'Koneksi terputus. Silakan coba lagi.',
    'econnrefused': 'Layanan tidak tersedia. Silakan coba lagi nanti.',
    'econnreset': 'Koneksi terputus. Silakan coba lagi.',
    'enotfound': 'Layanan tidak dapat dihubungi. Silakan coba lagi nanti.',
    'socket hang up': 'Koneksi terputus. Silakan coba lagi.',
    'fetch failed': 'Gagal menghubungi layanan AI. Silakan coba lagi.',
    
    // Memory/Resource errors
    'out of memory': 'File terlalu besar untuk diproses. Coba dengan file yang lebih kecil.',
    'heap': 'File terlalu besar untuk diproses. Coba dengan file yang lebih kecil.',
    'memory': 'File terlalu besar untuk diproses. Coba dengan file yang lebih kecil.',
}

/**
 * Sanitize error message to be user-friendly.
 * Matches error patterns and returns appropriate message.
 */
function sanitizeErrorMessage(error: unknown): string {
    const rawMessage = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
    
    // Check for known error patterns
    for (const [pattern, friendlyMessage] of Object.entries(ERROR_MESSAGES)) {
        if (rawMessage.includes(pattern)) {
            return friendlyMessage
        }
    }
    
    // Default fallback message - don't expose raw error
    return 'Gagal memproses dokumen. Silakan coba lagi atau hubungi support.'
}

// =============================================================================
// Redis Connection (same pattern as other workers)
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

const orchestrator = new AIOrchestrator()

// =============================================================================
// Job Processors
// =============================================================================

/**
 * Process document job: Parse PDF and generate embeddings for knowledge base.
 */
async function processDocument(data: ProcessDocumentJobData): Promise<void> {
    const { documentId, fileBase64, mimeType } = data

    logger.info(`Starting document processing for ${documentId}`)

    try {
        // Check if document still exists (handles deletion during queue wait)
        const doc = await prisma.knowledgeDocument.findUnique({
            where: { id: documentId },
            select: { id: true, status: true },
        })

        if (!doc) {
            logger.info(`Document ${documentId} was deleted before processing started, skipping`)
            return
        }

        // Convert base64 back to Buffer
        const fileBuffer = Buffer.from(fileBase64, 'base64')

        // Process the document (extract text, generate embeddings, store chunks)
        await orchestrator.processAndStoreDocument(documentId, fileBuffer, mimeType)

        logger.info(`Document ${documentId} processed successfully`)
    } catch (error) {
        const rawError = error instanceof Error ? error.message : 'Unknown error'
        const userFriendlyMessage = sanitizeErrorMessage(error)
        
        // Log raw error for debugging (internal only)
        logger.error(`Error processing document ${documentId}:`, {
            error: rawError,
            sanitized: userFriendlyMessage,
        })

        // Update document status to FAILED with sanitized message
        try {
            await prisma.knowledgeDocument.update({
                where: { id: documentId },
                data: {
                    status: 'FAILED',
                    errorMessage: userFriendlyMessage,
                },
            })
        } catch (updateErr: any) {
            // Document was deleted, ignore
            if (updateErr.code === 'P2025') {
                logger.info(`Document ${documentId} was deleted, skipping error update`)
            } else {
                logger.error(`Failed to update document ${documentId} status:`, {
                    error: updateErr instanceof Error ? updateErr.message : 'Unknown error',
                })
            }
        }

        // Re-throw to trigger BullMQ retry
        throw error
    }
}

// =============================================================================
// Main Job Processor
// =============================================================================

/**
 * Process document queue jobs based on type.
 */
async function processDocumentJob(job: Job<DocumentJobData>): Promise<void> {
    const { data } = job

    logger.debug(`Processing document job ${job.id}, type: ${data.type}`)

    switch (data.type) {
        case 'process-document':
            await processDocument(data as ProcessDocumentJobData)
            break

        default:
            logger.error(`Unknown document job type: ${(data as any).type}`)
            throw new Error(`Unknown document job type: ${(data as any).type}`)
    }
}

// =============================================================================
// Worker Instance
// =============================================================================

let documentWorker: Worker<DocumentJobData> | null = null

/**
 * Start the document worker.
 * @returns The worker instance
 */
export function startDocumentWorker(): Worker<DocumentJobData> {
    if (documentWorker) {
        logger.warn('Document worker already started')
        return documentWorker
    }

    documentWorker = new Worker<DocumentJobData>(
        QUEUE_NAMES.DOCUMENT,
        processDocumentJob,
        {
            connection: redisConnection,
            concurrency: 2, // Process up to 2 documents concurrently (CPU/memory intensive)
        }
    )

    // Worker event handlers
    documentWorker.on('completed', (job) => {
        logger.debug(`Document worker completed job ${job.id}`)
    })

    documentWorker.on('failed', (job, err) => {
        logger.error(`Document worker failed job ${job?.id}: ${err.message}`)
    })

    documentWorker.on('error', (err) => {
        logger.error(`Document worker error: ${err.message}`)
    })

    logger.info('Document worker started')
    console.log('Document worker started')

    return documentWorker
}

// =============================================================================
// Graceful Shutdown
// =============================================================================

process.on('SIGTERM', async () => {
    console.log('Closing document worker...')
    if (documentWorker) {
        await documentWorker.close()
    }
    await redisConnection.quit()
    console.log('Document worker closed')
})

// =============================================================================
// Auto-start when imported (same pattern as other workers)
// =============================================================================

// Start worker immediately when this module is imported
startDocumentWorker()

export { documentWorker }
