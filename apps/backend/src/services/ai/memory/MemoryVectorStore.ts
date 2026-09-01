import { PrismaClient, ConversationMemory, Prisma } from '@prisma/client';
import { OpenAIProvider } from '../providers/OpenAIProvider.js';
import { validateEmbeddingDimensions } from '../vector/PgVectorStore.js';
import { prisma } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';
import {
  CreateMemoryParams,
  SearchMemoriesParams,
  MemorySearchResult,
} from './types.js';

/**
 * Default number of memories to return in search
 */
const DEFAULT_SEARCH_LIMIT = 5;

/**
 * Default similarity threshold for memory search (0-1)
 */
const DEFAULT_SIMILARITY_THRESHOLD = 0.7;

/**
 * Default retention period in days
 */
const DEFAULT_RETENTION_DAYS = 90;

/**
 * MemoryVectorStore - Service for storing and retrieving conversation memories
 * using vector embeddings for semantic search.
 * 
 * Memories are stored per user + customer + whatsapp account combination,
 * enabling personalized AI responses based on past interactions.
 */
export class MemoryVectorStore {
  private client: PrismaClient;
  private openaiProvider: OpenAIProvider;

  constructor(prismaClient: PrismaClient, openaiProvider: OpenAIProvider) {
    this.client = prismaClient;
    this.openaiProvider = openaiProvider;
  }

  /**
   * Create a new memory record with PENDING status.
   * Embedding will be processed asynchronously by queue worker.
   */
  async createMemory(params: CreateMemoryParams): Promise<ConversationMemory> {
    const {
      userId,
      customerId,
      whatsappAccountId,
      aiAgentId,
      memoryType,
      customerMessage,
      responseMessage,
      inboundMessageId,
      outboundMessageId,
      metadata,
    } = params;

    const memory = await this.client.conversationMemory.create({
      data: {
        userId,
        customerId,
        whatsappAccountId,
        aiAgentId,
        memoryType,
        customerMessage,
        responseMessage,
        inboundMessageId,
        outboundMessageId,
        metadata: metadata ?? Prisma.JsonNull,
        status: 'PENDING',
        retryCount: 0,
      },
    });

    logger.debug(`📝 Created memory ${memory.id} for customer ${customerId}`);
    return memory;
  }

  /**
   * Generate embedding and store it for an existing memory record.
   * Called by the queue worker after memory is created.
   * 
   * Format: "Q: {customerMessage}\nA: {responseMessage}"
   */
  async storeEmbedding(memoryId: string): Promise<ConversationMemory> {
    // 1. Fetch memory by ID
    const memory = await this.client.conversationMemory.findUnique({
      where: { id: memoryId },
    });

    if (!memory) {
      throw new Error(`Memory not found: ${memoryId}`);
    }

    // Skip if already processed
    if (memory.status === 'COMPLETED') {
      logger.debug(`⏭️ Memory ${memoryId} already completed, skipping`);
      return memory;
    }

    // 2. Combine text for embedding
    const embeddingText = `Q: ${memory.customerMessage}\nA: ${memory.responseMessage}`;

    // 3. Generate embedding via OpenAI
    const embedding = await this.openaiProvider.generateEmbedding(embeddingText);
    
    // Validate embedding dimensions
    validateEmbeddingDimensions(embedding);

    // 4. Update record with embedding using raw SQL (for pgvector type)
    const vectorString = `[${embedding.join(',')}]`;
    
    await this.client.$executeRaw`
      UPDATE "ConversationMemory"
      SET 
        embedding = ${vectorString}::vector,
        "embeddingText" = ${embeddingText},
        status = 'COMPLETED'::"MemoryStatus",
        "updatedAt" = NOW()
      WHERE id = ${memoryId}
    `;

    logger.debug(`✅ Stored embedding for memory ${memoryId}`);

    // Return updated memory
    const updatedMemory = await this.client.conversationMemory.findUnique({
      where: { id: memoryId },
    });

    return updatedMemory!;
  }

  /**
   * Semantic search for relevant memories using cosine similarity.
   * Returns memories sorted by similarity score.
   */
  async searchMemories(params: SearchMemoriesParams): Promise<MemorySearchResult[]> {
    const {
      userId,
      customerId,
      whatsappAccountId,
      query,
      limit = DEFAULT_SEARCH_LIMIT,
      similarityThreshold = DEFAULT_SIMILARITY_THRESHOLD,
    } = params;

    // Validate parameters
    if (!query || query.trim().length === 0) {
      return [];
    }

    if (limit < 1 || limit > 100) {
      throw new Error('Limit must be between 1 and 100');
    }

    if (similarityThreshold < 0 || similarityThreshold > 1) {
      throw new Error('Similarity threshold must be between 0 and 1');
    }

    // 1. Generate embedding for the query
    const queryEmbedding = await this.openaiProvider.generateEmbedding(query);
    validateEmbeddingDimensions(queryEmbedding);

    // 2. Construct vector string
    const vectorString = `[${queryEmbedding.join(',')}]`;

    // 3. Raw SQL with cosine similarity search
    // Uses pgvector's <=> operator (cosine distance)
    // Similarity = 1 - distance
    const results = await this.client.$queryRaw<
      Array<{
        id: string;
        userId: string;
        customerId: string;
        whatsappAccountId: string;
        aiAgentId: string | null;
        memoryType: string;
        customerMessage: string;
        responseMessage: string;
        embeddingText: string | null;
        status: string;
        retryCount: number;
        inboundMessageId: string | null;
        outboundMessageId: string | null;
        metadata: any;
        createdAt: Date;
        updatedAt: Date;
        similarity: number;
      }>
    >`
      SELECT
        cm.id,
        cm."userId",
        cm."customerId",
        cm."whatsappAccountId",
        cm."aiAgentId",
        cm."memoryType",
        cm."customerMessage",
        cm."responseMessage",
        cm."embeddingText",
        cm.status,
        cm."retryCount",
        cm."inboundMessageId",
        cm."outboundMessageId",
        cm.metadata,
        cm."createdAt",
        cm."updatedAt",
        (1 - (cm.embedding <=> ${vectorString}::vector)) as similarity
      FROM "ConversationMemory" cm
      WHERE cm."userId" = ${userId}
        AND cm."customerId" = ${customerId}
        AND cm."whatsappAccountId" = ${whatsappAccountId}
        AND cm.status = 'COMPLETED'
        AND cm.embedding IS NOT NULL
        AND (1 - (cm.embedding <=> ${vectorString}::vector)) > ${similarityThreshold}
      ORDER BY similarity DESC
      LIMIT ${limit}
    `;

    logger.debug(
      `🔍 Memory search: found ${results.length} memories. Top score: ${results[0]?.similarity ?? 'N/A'}`
    );

    // Map to MemorySearchResult format
    return results.map((row) => ({
      memory: {
        id: row.id,
        userId: row.userId,
        customerId: row.customerId,
        whatsappAccountId: row.whatsappAccountId,
        aiAgentId: row.aiAgentId,
        memoryType: row.memoryType as any,
        customerMessage: row.customerMessage,
        responseMessage: row.responseMessage,
        embeddingText: row.embeddingText,
        status: row.status as any,
        retryCount: row.retryCount,
        inboundMessageId: row.inboundMessageId,
        outboundMessageId: row.outboundMessageId,
        metadata: row.metadata,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        embedding: null, // Not included in search results
      } as ConversationMemory,
      similarity: Number(row.similarity),
    }));
  }

  /**
   * Delete all memories for a specific WhatsApp account.
   * Used when user wants to clear AI memory for a specific phone number.
   * 
   * @param userId The user's ID (for authorization)
   * @param whatsappAccountId The WhatsApp account ID to clear memories for
   * @returns Number of deleted memories
   */
  async deleteByWhatsAppAccountId(userId: string, whatsappAccountId: string): Promise<number> {
    const result = await this.client.conversationMemory.deleteMany({
      where: {
        userId,
        whatsappAccountId,
      },
    });

    logger.info(`🗑️ Deleted ${result.count} memories for WhatsApp account ${whatsappAccountId}`);
    return result.count;
  }

  /**
   * Get count of memories for a specific WhatsApp account.
   * 
   * @param userId The user's ID
   * @param whatsappAccountId The WhatsApp account ID
   * @returns Count of memories
   */
  async getCountByWhatsAppAccountId(userId: string, whatsappAccountId: string): Promise<number> {
    return this.client.conversationMemory.count({
      where: {
        userId,
        whatsappAccountId,
      },
    });
  }

  /**
   * Delete all memories for a specific customer within a WhatsApp account.
   * Used when user wants to clear AI memory for a specific customer.
   * 
   * @param userId The user's ID (for authorization)
   * @param whatsappAccountId The WhatsApp account ID
   * @param customerId The customer ID to clear memories for
   * @returns Number of deleted memories
   */
  async deleteByCustomerId(userId: string, whatsappAccountId: string, customerId: string): Promise<number> {
    const result = await this.client.conversationMemory.deleteMany({
      where: {
        userId,
        whatsappAccountId,
        customerId,
      },
    });

    logger.info(`🗑️ Deleted ${result.count} memories for customer ${customerId}`);
    return result.count;
  }

  /**
   * Get list of customers with memory count for a WhatsApp account (paginated).
   * Used for displaying which customers have AI memories.
   * 
   * @param userId The user's ID
   * @param whatsappAccountId The WhatsApp account ID
   * @param options Pagination and search options
   * @returns Paginated list of customers with their memory counts
   */
  async getCustomersWithMemory(
    userId: string, 
    whatsappAccountId: string,
    options: {
      page?: number;
      limit?: number;
      search?: string;
    } = {}
  ): Promise<{
    customers: {
      customerId: string;
      customerName: string | null;
      customerPhone: string | null;
      memoryCount: number;
      lastMemoryAt: Date;
    }[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = Math.max(1, options.page || 1);
    const limit = Math.min(100, Math.max(1, options.limit || 20));
    const search = options.search?.trim() || '';

    // First, get all customer IDs with memory (we need this for total count and search)
    const allResults = await this.client.conversationMemory.groupBy({
      by: ['customerId'],
      where: {
        userId,
        whatsappAccountId,
        status: 'COMPLETED',
      },
      _count: {
        id: true,
      },
      _max: {
        createdAt: true,
      },
      orderBy: {
        _max: {
          createdAt: 'desc',
        },
      },
    });

    // Get all customer details for search filtering
    const allCustomerIds = allResults.map(r => r.customerId);
    const allCustomers = await this.client.customer.findMany({
      where: {
        id: { in: allCustomerIds },
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
      },
    });

    const customerMap = new Map(allCustomers.map(c => [c.id, c]));

    // Map and filter results
    let mappedResults = allResults.map(r => {
      const customer = customerMap.get(r.customerId);
      return {
        customerId: r.customerId,
        customerName: customer?.name || null,
        customerPhone: customer?.phoneNumber || null,
        memoryCount: r._count.id,
        lastMemoryAt: r._max.createdAt!,
      };
    });

    // Apply search filter if provided
    if (search) {
      const searchLower = search.toLowerCase();
      mappedResults = mappedResults.filter(c => 
        c.customerName?.toLowerCase().includes(searchLower) ||
        c.customerPhone?.toLowerCase().includes(searchLower)
      );
    }

    const total = mappedResults.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;

    // Paginate
    const paginatedResults = mappedResults.slice(offset, offset + limit);

    return {
      customers: paginatedResults,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  /**
   * Delete memories older than the specified number of days.
   * Default: 90 days retention period.
   * 
   * @returns Number of deleted memories
   */
  async deleteOldMemories(olderThanDays: number = DEFAULT_RETENTION_DAYS): Promise<number> {
    if (olderThanDays < 1) {
      throw new Error('olderThanDays must be at least 1');
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const result = await this.client.conversationMemory.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    logger.info(`🗑️ Deleted ${result.count} memories older than ${olderThanDays} days`);
    return result.count;
  }

  /**
   * Get failed memories for retry processing.
   * 
   * @param limit Maximum number of failed memories to return (default: 100)
   */
  async getFailedMemories(limit: number = 100): Promise<ConversationMemory[]> {
    return this.client.conversationMemory.findMany({
      where: {
        status: 'FAILED',
      },
      orderBy: {
        createdAt: 'asc', // Process oldest first
      },
      take: limit,
    });
  }

  /**
   * Mark a memory as failed after exhausting retries.
   */
  async markAsFailed(memoryId: string): Promise<void> {
    await this.client.conversationMemory.update({
      where: { id: memoryId },
      data: {
        status: 'FAILED',
      },
    });

    logger.warn(`❌ Marked memory ${memoryId} as FAILED`);
  }

  /**
   * Increment the retry count for a memory.
   * 
   * @returns The new retry count
   */
  async incrementRetryCount(memoryId: string): Promise<number> {
    const updated = await this.client.conversationMemory.update({
      where: { id: memoryId },
      data: {
        retryCount: {
          increment: 1,
        },
      },
    });

    return updated.retryCount;
  }

  /**
   * Reset a failed memory to PENDING status for re-processing.
   * Also resets retry count to 0.
   */
  async resetForRetry(memoryId: string): Promise<ConversationMemory> {
    const updated = await this.client.conversationMemory.update({
      where: { id: memoryId },
      data: {
        status: 'PENDING',
        retryCount: 0,
      },
    });

    logger.debug(`🔄 Reset memory ${memoryId} for retry`);
    return updated;
  }

  /**
   * Get count of memories by status for a user.
   * Useful for monitoring and analytics.
   */
  async getMemoryStats(userId: string): Promise<{
    pending: number;
    completed: number;
    failed: number;
    total: number;
  }> {
    const stats = await this.client.conversationMemory.groupBy({
      by: ['status'],
      where: { userId },
      _count: true,
    });

    const result = {
      pending: 0,
      completed: 0,
      failed: 0,
      total: 0,
    };

    for (const stat of stats) {
      const count = stat._count;
      result.total += count;
      
      switch (stat.status) {
        case 'PENDING':
          result.pending = count;
          break;
        case 'COMPLETED':
          result.completed = count;
          break;
        case 'FAILED':
          result.failed = count;
          break;
      }
    }

    return result;
  }
}

/**
 * Create a MemoryVectorStore instance with default dependencies
 */
export function createMemoryVectorStore(openaiProvider: OpenAIProvider): MemoryVectorStore {
  return new MemoryVectorStore(prisma, openaiProvider);
}
