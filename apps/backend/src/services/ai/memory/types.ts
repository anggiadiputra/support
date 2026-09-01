import { MemoryType, MemoryStatus, ConversationMemory } from '@prisma/client';

export interface CreateMemoryParams {
  userId: string;
  customerId: string;
  whatsappAccountId: string;
  aiAgentId?: string;
  memoryType: MemoryType;
  customerMessage: string;
  responseMessage: string;
  inboundMessageId?: string;
  outboundMessageId?: string;
  metadata?: Record<string, any>;
}

export interface SearchMemoriesParams {
  userId: string;
  customerId: string;
  whatsappAccountId: string;
  query: string;
  limit?: number;           // default: 5
  similarityThreshold?: number;  // default: 0.7
}

export interface MemorySearchResult {
  memory: ConversationMemory;
  similarity: number;
}

export type { MemoryType, MemoryStatus, ConversationMemory };
