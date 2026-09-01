import { Hono } from 'hono';
import { prisma } from '../../utils/database.js';
import { checkUsageLimit, checkFeatureAccess } from '../../middleware/subscription.js';
import { documentQueue } from '../../utils/queue.js';
import type { ProcessDocumentJobData } from '../../workers/documentWorker.js';
import { logger } from '../../utils/logger.js';

const app = new Hono();

// Error codes for knowledge base operations
const KNOWLEDGE_ERRORS = {
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Anda harus login untuk mengakses fitur ini',
  },
  NO_ACCESS: {
    code: 'NO_ACCESS',
    message: 'Upload dokumen tidak tersedia di paket langganan Anda',
  },
  LIMIT_REACHED: {
    code: 'LIMIT_REACHED',
    message: 'Batas dokumen tercapai untuk paket Anda',
  },
  NO_FILE: {
    code: 'NO_FILE',
    message: 'Tidak ada file yang diupload',
  },
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'Ukuran file terlalu besar (maksimal 10MB)',
  },
  QUEUE_FAILED: {
    code: 'QUEUE_FAILED',
    message: 'Gagal memproses dokumen. Silakan coba lagi.',
  },
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Dokumen tidak ditemukan',
  },
} as const;

// Helper to create consistent error response
function createErrorResponse(error: typeof KNOWLEDGE_ERRORS[keyof typeof KNOWLEDGE_ERRORS], details?: string) {
  return {
    error: {
      code: error.code,
      message: error.message,
      details,
    },
  };
}

app.post('/upload', async (c) => {
  const user = (c as any).user;
  if (!user) return c.json(createErrorResponse(KNOWLEDGE_ERRORS.UNAUTHORIZED), 401);

  // Check AI feature access first
  const hasAccess = await checkFeatureAccess(user.id, 'aiChatbot');
  if (!hasAccess) {
    return c.json(createErrorResponse(KNOWLEDGE_ERRORS.NO_ACCESS), 403);
  }

  // Check Document limits
  const limitCheck = await checkUsageLimit(user.id, 'maxKnowledgeDocs');
  if (!limitCheck.allowed) {
    return c.json(
      createErrorResponse(
        KNOWLEDGE_ERRORS.LIMIT_REACHED,
        `Maksimal ${limitCheck.limit} dokumen untuk paket Anda`
      ),
      403
    );
  }

  const body = await c.req.parseBody();
  const file = body['file'];

  if (!file || typeof file === 'string') {
    return c.json(createErrorResponse(KNOWLEDGE_ERRORS.NO_FILE), 400);
  }

  // Hono file object is Blob/File. We need ArrayBuffer -> Buffer.
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  // Check file size (max 10MB)
  if (buffer.length > 10 * 1024 * 1024) {
    return c.json(createErrorResponse(KNOWLEDGE_ERRORS.FILE_TOO_LARGE), 400);
  }

  const filename = file.name || 'document.pdf';
  const mimeType = file.type || 'application/pdf';

  // 1. Create Document Record
  const doc = await (prisma as any).knowledgeDocument.create({
    data: {
      userId: user.id,
      filename,
      fileSize: buffer.length,
      mimeType,
      status: 'PROCESSING',
    },
  });

  // 2. Queue document for async processing via BullMQ
  // This ensures processing survives server restarts and provides retry logic
  try {
    await documentQueue.add(
      'process-document',
      {
        type: 'process-document',
        documentId: doc.id,
        fileBase64: buffer.toString('base64'), // Serialize buffer for Redis
        mimeType,
      } as ProcessDocumentJobData,
      {
        jobId: `doc-${doc.id}`, // Prevent duplicate processing
      }
    );
    logger.info(`Document ${doc.id} queued for processing`);
  } catch (queueErr) {
    logger.error(`Failed to queue document ${doc.id}:`, {
      error: queueErr instanceof Error ? queueErr.message : 'Unknown error',
    });
    // Update status to FAILED if queueing fails
    await (prisma as any).knowledgeDocument.update({
      where: { id: doc.id },
      data: {
        status: 'FAILED',
        errorMessage: KNOWLEDGE_ERRORS.QUEUE_FAILED.message,
      },
    });
    return c.json(createErrorResponse(KNOWLEDGE_ERRORS.QUEUE_FAILED), 500);
  }

  return c.json({ 
    message: 'File uploaded, processing started',
    document: doc 
  }, 202);
});

app.get('/', async (c) => {
  const user = (c as any).user;
  if (!user) return c.json(createErrorResponse(KNOWLEDGE_ERRORS.UNAUTHORIZED), 401);

  const docs = await (prisma as any).knowledgeDocument.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      _count: {
        select: { chunks: true }
      }
    }
  });

  return c.json(docs);
});

app.delete('/:id', async (c) => {
  const user = (c as any).user;
  const id = c.req.param('id');
  if (!user) return c.json(createErrorResponse(KNOWLEDGE_ERRORS.UNAUTHORIZED), 401);

  // Verify ownership
  const doc = await (prisma as any).knowledgeDocument.findFirst({
    where: { id, userId: user.id },
  });

  if (!doc) return c.json(createErrorResponse(KNOWLEDGE_ERRORS.NOT_FOUND), 404);

  // Delete document (cascade deletes chunks)
  await (prisma as any).knowledgeDocument.delete({
    where: { id },
  });
  
  // Also clean up vectors? 
  // Prisma cascade should handle related rows in DocumentChunk.
  // But Vectors in pgvector might need cleanup if stored separately? 
  // No, they are columns in DocumentChunk. So cascade delete works!

  return c.json({ message: 'Document deleted' });
});

export default app;