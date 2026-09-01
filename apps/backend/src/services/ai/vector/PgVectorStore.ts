import { PrismaClient, Prisma } from '@prisma/client';
import { IVectorStore } from './IVectorStore.js';
import { SearchResult } from '../types.js';
import { prisma } from '../../../utils/database.js';
import { logger } from '../../../utils/logger.js';

/**
 * Expected embedding dimension for OpenAI text-embedding-3-small model
 * This should match the vector column dimension in the database
 */
const EXPECTED_EMBEDDING_DIMENSION = 1536;

/**
 * Validates that an embedding vector has the correct dimensions
 * @param vector - The embedding vector to validate
 * @throws Error if dimensions are invalid
 */
export function validateEmbeddingDimensions(vector: number[]): void {
  if (!Array.isArray(vector)) {
    throw new Error('Embedding must be an array');
  }
  
  if (vector.length === 0) {
    throw new Error('Embedding cannot be empty');
  }
  
  if (vector.length !== EXPECTED_EMBEDDING_DIMENSION) {
    throw new Error(
      `Invalid embedding dimension: expected ${EXPECTED_EMBEDDING_DIMENSION}, got ${vector.length}`
    );
  }
  
  // Validate all elements are valid numbers
  for (let i = 0; i < vector.length; i++) {
    if (typeof vector[i] !== 'number' || !Number.isFinite(vector[i])) {
      throw new Error(`Invalid embedding value at index ${i}: must be a finite number`);
    }
  }
}

/**
 * Escapes SQL special characters in a string to prevent SQL injection
 * @param input - The string to escape
 * @returns The escaped string
 */
export function escapeSqlString(input: string): string {
  if (typeof input !== 'string') {
    throw new Error('Input must be a string');
  }
  
  // Escape single quotes by doubling them (SQL standard)
  // Also escape backslashes for PostgreSQL
  return input
    .replace(/\\/g, '\\\\')  // Escape backslashes first
    .replace(/'/g, "''")     // Escape single quotes
    .replace(/\0/g, '')      // Remove null bytes
    .replace(/\x1a/g, '');   // Remove SUB character (Ctrl+Z)
}

/**
 * Validates and sanitizes a document ID
 * @param documentId - The document ID to validate
 * @returns The sanitized document ID
 * @throws Error if the document ID is invalid
 */
export function validateDocumentId(documentId: string): string {
  if (typeof documentId !== 'string') {
    throw new Error('Document ID must be a string');
  }
  
  if (documentId.length === 0) {
    throw new Error('Document ID cannot be empty');
  }
  
  if (documentId.length > 255) {
    throw new Error('Document ID exceeds maximum length of 255 characters');
  }
  
  // UUID format validation (common format for document IDs)
  // Allow alphanumeric, hyphens, and underscores
  const validIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validIdPattern.test(documentId)) {
    throw new Error('Document ID contains invalid characters');
  }
  
  return documentId;
}

export class PgVectorStore implements IVectorStore {
  private client: PrismaClient;

  constructor() {
    this.client = prisma;
  }

  async addDocument(
    documentId: string,
    content: string,
    vector: number[],
    metadata?: Record<string, any>
  ): Promise<void> {
    // Validate inputs
    const validatedDocId = validateDocumentId(documentId);
    validateEmbeddingDimensions(vector);
    
    // We use raw SQL because Prisma schema has Unsupported("vector")
    // and we need to cast the array to vector type
    // Using parameterized query for safety
    const vectorString = `[${vector.join(',')}]`;
    
    // Calculate tokens approximately (or pass it in) - simplistic approx
    const tokenCount = Math.ceil(content.length / 4);
    
    // Auto-increment index for the document
    const lastChunk = await (this.client as any).documentChunk.findFirst({
      where: { documentId: validatedDocId },
      orderBy: { chunkIndex: 'desc' },
      select: { chunkIndex: true },
    });
    
    const newIndex = (lastChunk?.chunkIndex ?? -1) + 1;

    // Use $executeRaw with tagged template literal for parameterized query
    // Note: vectorString is safe because it's constructed from validated numbers
    await this.client.$executeRaw`
      INSERT INTO "DocumentChunk" ("id", "documentId", "content", "chunkIndex", "tokenCount", "embedding", "createdAt")
      VALUES (
        gen_random_uuid(), 
        ${validatedDocId}, 
        ${content}, 
        ${newIndex}, 
        ${tokenCount}, 
        ${vectorString}::vector, 
        NOW()
      )
    `;
  }

  async similaritySearch(
    queryVector: number[],
    limit: number,
    threshold: number = 0.25,
    documentIds?: string[]
  ): Promise<SearchResult[]> {
    // Validate embedding dimensions
    validateEmbeddingDimensions(queryVector);
    
    // Validate limit
    if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
      throw new Error('Limit must be an integer between 1 and 1000');
    }
    
    // Validate threshold
    if (typeof threshold !== 'number' || threshold < 0 || threshold > 1) {
      throw new Error('Threshold must be a number between 0 and 1');
    }
    
    // Construct vector string from validated numbers (safe - no user input)
    const vectorString = `[${queryVector.join(',')}]`;

    let results: any[];
    
    if (documentIds && documentIds.length > 0) {
      // Validate all document IDs
      const validatedIds = documentIds.map(id => validateDocumentId(id));
      
      // Use Prisma.sql with Prisma.join for safe IN clause
      // This properly parameterizes the document IDs
      results = await this.client.$queryRaw`
        SELECT
          dc.id,
          dc."documentId",
          dc.content,
          (1 - (dc.embedding <=> ${vectorString}::vector)) as similarity
        FROM "DocumentChunk" dc
        WHERE (1 - (dc.embedding <=> ${vectorString}::vector)) > ${threshold}
          AND dc."documentId" IN (${Prisma.join(validatedIds)})
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
    } else {
      // Query without document filter
      results = await this.client.$queryRaw`
        SELECT
          dc.id,
          dc."documentId",
          dc.content,
          (1 - (dc.embedding <=> ${vectorString}::vector)) as similarity
        FROM "DocumentChunk" dc
        WHERE (1 - (dc.embedding <=> ${vectorString}::vector)) > ${threshold}
        ORDER BY similarity DESC
        LIMIT ${limit}
      `;
    }

    logger.debug(`🔍 Vector Search: Found ${results.length} chunks. Top score: ${results[0]?.similarity}`);

    // Map raw results to SearchResult interface
    return results.map((row) => ({
      documentId: row.documentId,
      content: row.content,
      score: Number(row.similarity),
      metadata: {}, // Fetch extra metadata if needed from row
    }));
  }

  async deleteDocumentVectors(documentId: string): Promise<void> {
    // Validate document ID
    const validatedDocId = validateDocumentId(documentId);
    
    await (this.client as any).documentChunk.deleteMany({
      where: { documentId: validatedDocId },
    });
  }
}