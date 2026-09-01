import { ILLMProvider } from './providers/ILLMProvider.js';
import { IVectorStore } from './vector/IVectorStore.js';
import { DocumentProcessor } from './knowledge/DocumentProcessor.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { PgVectorStore } from './vector/PgVectorStore.js';
import { AIChatMessage } from './types.js';
import { prisma } from '../../utils/database.js';
import { settingsCache, CACHE_KEYS, CACHE_TTL } from '../settings-cache.js';
import { logger, extractAxiosError } from '../../utils/logger.js';
import type { OpenAISettings } from '../../types/admin-settings.js';
import { assignmentService } from '../assignment-service.js';
import type { ConversationType } from '@prisma/client';
import { resolveAIConfig } from './resolve-ai-config.js';
import { createMemoryVectorStore, MemoryVectorStore, MemorySearchResult } from './memory/index.js';
import { isWithinWorkingHours, WorkingHours } from './working-hours.js';
import { checkEscalation, checkEscalationWithGroups, handleEscalationAssign, handleEscalationAssignToAgent } from './escalation.js';

/**
 * AIOrchestrator
 * 
 * Orchestrates AI operations including document processing and message handling.
 * 
 * Settings Priority:
 * 1. Database settings (cached with TTL)
 * 2. Environment variables (.env fallback)
 * 
 * Requirements: 6.3, 6.4 - Check database first, fallback to .env, cache with TTL
 */
// Default chat model when none is configured
const DEFAULT_CHAT_MODEL = 'gpt-4.1-nano-2025-04-14';

export class AIOrchestrator {
  private llmProvider: ILLMProvider | null = null;
  private vectorStore: IVectorStore;
  private docProcessor: DocumentProcessor;
  private lastApiKeyHash: string = '';
  private lastBaseUrl: string = '';
  private lastEmbeddingModel: string = '';
  private lastDefaultChatModel: string = DEFAULT_CHAT_MODEL;
  private memoryStore: MemoryVectorStore | null = null;

  constructor() {
    // Initialize with env API key as fallback, will be updated from DB on first use
    // Note: We don't set lastApiKeyHash here so DB settings will always be applied
    const apiKey = process.env.OPENAI_API_KEY;
    const baseUrl = process.env.OPENAI_BASE_URL;
    const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL;
    if (apiKey) {
      this.llmProvider = new OpenAIProvider(apiKey, baseUrl, embeddingModel);
      // Don't set lastApiKeyHash - let DB settings override on first refresh
    }
    this.vectorStore = new PgVectorStore();
    this.docProcessor = new DocumentProcessor();
  }

  /**
   * Generate a hash for API key comparison using full key
   */
  private hashKey(key: string): string {
    // Use simple hash of full key for accurate comparison
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString();
  }

  /**
   * Refresh OpenAI settings from database with caching
   * Requirements: 6.3, 6.4
   */
  private async refreshSettingsFromDb(): Promise<void> {
    try {
      // Check cache first
      const cachedSettings = settingsCache.get<OpenAISettings>(CACHE_KEYS.openai());
      
      if (cachedSettings) {
        console.log('🤖 AI Orchestrator: Using cached OpenAI settings');
        this.updateProvider(cachedSettings);
        return;
      }

      // Fetch from database using dynamic import to avoid circular dependency
      const { adminSettingsService } = await import('../admin/settings-service.js');
      const response = await adminSettingsService.getSettings<OpenAISettings>('openai', false);
      
      console.log('🤖 AI Orchestrator: Fetched OpenAI settings', {
        source: response.source,
        hasApiKey: !!response.data.apiKey,
        apiKeyPreview: response.data.apiKey ? response.data.apiKey.slice(0, 10) + '...' + response.data.apiKey.slice(-4) : 'none',
        baseUrl: response.data.baseUrl || 'default (OpenAI)',
        embeddingModel: response.data.embeddingModel || 'default (text-embedding-3-small)',
        defaultChatModel: response.data.defaultChatModel || 'default (gpt-4.1-nano-2025-04-14)'
      });
      
      // Cache the settings
      settingsCache.set(CACHE_KEYS.openai(), response.data, CACHE_TTL.settings);
      
      // Update provider with database settings (always prioritize DB over env)
      this.updateProvider(response.data, true);
      logger.info('OpenAI settings refreshed from database', { source: response.source });
    } catch (error) {
      logger.warn('Failed to refresh OpenAI settings from database, using current config', {
        error: extractAxiosError(error),
      });
      // Continue with existing provider (env fallback)
    }
  }

  /**
   * Update LLM provider with new API key, base URL, and/or embedding model if changed
   * Also updates the default chat model setting
   * @param settings - OpenAI settings
   * @param forceUpdate - Force update even if hash matches (for DB priority)
   */
  private updateProvider(settings: OpenAISettings, forceUpdate: boolean = false): void {
    const apiKey = settings.apiKey;
    const baseUrl = settings.baseUrl || '';
    const embeddingModel = settings.embeddingModel || '';
    const defaultChatModel = settings.defaultChatModel || DEFAULT_CHAT_MODEL;

    // Always update the default chat model (even if API key is masked)
    this.lastDefaultChatModel = defaultChatModel;

    if (!apiKey || apiKey.includes('****')) {
      // No valid API key in settings, keep current provider
      return;
    }

    const newHash = this.hashKey(apiKey);
    const baseUrlChanged = baseUrl !== this.lastBaseUrl;
    const embeddingModelChanged = embeddingModel !== this.lastEmbeddingModel;

    // Always update if forceUpdate is true (DB settings should override env)
    // Or update if hash is different, baseUrl changed, or embedding model changed
    if (forceUpdate || newHash !== this.lastApiKeyHash || baseUrlChanged || embeddingModelChanged) {
      console.log('🤖 AI Orchestrator: Updating provider with new settings', {
        forceUpdate,
        hashChanged: newHash !== this.lastApiKeyHash,
        baseUrlChanged,
        embeddingModelChanged,
        apiKeyPreview: apiKey.slice(0, 10) + '...' + apiKey.slice(-4),
        baseUrl: baseUrl || 'default (OpenAI)',
        embeddingModel: embeddingModel || 'default (text-embedding-3-small)',
        defaultChatModel: defaultChatModel
      });
      this.llmProvider = new OpenAIProvider(apiKey, baseUrl || undefined, embeddingModel || undefined);
      this.lastApiKeyHash = newHash;
      this.lastBaseUrl = baseUrl;
      this.lastEmbeddingModel = embeddingModel;
      logger.info('OpenAI provider updated with new settings');
    }
  }

  /**
   * Ensure LLM provider is initialized with latest settings
   */
  private async ensureProvider(): Promise<ILLMProvider> {
    await this.refreshSettingsFromDb();

    if (!this.llmProvider) {
      // Last resort: try env
      const apiKey = process.env.OPENAI_API_KEY;
      const baseUrl = process.env.OPENAI_BASE_URL;
      const embeddingModel = process.env.OPENAI_EMBEDDING_MODEL;
      if (!apiKey) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      this.llmProvider = new OpenAIProvider(apiKey, baseUrl, embeddingModel);
      this.lastApiKeyHash = this.hashKey(apiKey);
      this.lastBaseUrl = baseUrl || '';
      this.lastEmbeddingModel = embeddingModel || '';
    }

    return this.llmProvider;
  }

  /**
   * Ensure memory store is initialized
   */
  private async ensureMemoryStore(): Promise<MemoryVectorStore> {
    if (!this.memoryStore) {
      const provider = await this.ensureProvider();
      this.memoryStore = createMemoryVectorStore(provider as OpenAIProvider);
    }
    return this.memoryStore;
  }

  /**
   * Invalidate settings cache (call when settings are updated)
   */
  invalidateCache(): void {
    settingsCache.invalidate(CACHE_KEYS.openai());
    logger.info('OpenAI settings cache invalidated');
  }

  /**
   * Format memory search results for inclusion in system prompt
   */
  private formatMemoriesForPrompt(memories: MemorySearchResult[]): string {
    if (memories.length === 0) return '';

    return memories
      .map((m, i) => `[Memory ${i + 1}]
Customer asked: ${m.memory.customerMessage}
Response was: ${m.memory.responseMessage}`)
      .join('\n\n');
  }

  async processAndStoreDocument(
    documentId: string,
    fileBuffer: Buffer,
    mimeType: string
  ): Promise<void> {
    // Ensure provider is initialized with latest settings
    const provider = await this.ensureProvider();

    // 1. Extract Text
    let chunks: string[] = [];
    if (mimeType === 'application/pdf') {
      chunks = await this.docProcessor.processPdf(fileBuffer);
    } else {
      throw new Error(`Unsupported mime type: ${mimeType}`);
    }

    // 2. Generate Embeddings & Store (Batched)
    try {
      // Process in batches of 20 to avoid hitting rate limits too hard but still faster than sequential
      const BATCH_SIZE = 20;

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        // Check if document still exists before each batch (handles deletion during processing)
        const docExists = await (prisma as any).knowledgeDocument.findUnique({
          where: { id: documentId },
          select: { id: true },
        });

        if (!docExists) {
          console.log(`Document ${documentId} was deleted during processing, aborting`);
          return; // Document was deleted, stop processing
        }

        const batch = chunks.slice(i, i + BATCH_SIZE);

        // Generate embeddings for the batch
        const vectors = await provider.generateEmbeddings(batch);

        // Store each document in the batch (sequentially for DB stability, or parallel if safe)
        // Parallelizing DB inserts
        await Promise.all(batch.map((content, index) => {
          return this.vectorStore.addDocument(documentId, content, vectors[index], {
            chunkIndex: i + index,
          });
        }));
      }
    } catch (error) {
      logger.error('Error generating/storing embeddings', { error: extractAxiosError(error) });
      throw error;
    }

    // 3. Update Document Status - check if document still exists first
    const docExists = await (prisma as any).knowledgeDocument.findUnique({
      where: { id: documentId },
      select: { id: true },
    });

    if (!docExists) {
      console.log(`Document ${documentId} was deleted, skipping status update`);
      return;
    }

    await (prisma as any).knowledgeDocument.update({
      where: { id: documentId },
      data: { status: 'COMPLETED' },
    });
  }

  /**
   * Handle incoming message and generate AI response
   * 
   * @param userId - The business owner's user ID
   * @param userMessage - The incoming message content
   * @param customerId - Optional customer ID for conversation history
   * @param aiAgentIdOverride - Optional AI Agent ID to use instead of default active agent
   *                           When provided, uses this specific AI Agent's configuration
   *                           (system prompt, knowledge documents) for response generation
   * @param whatsappAccountId - Optional WhatsApp account ID for per-account config
   * @param isTestMode - Optional flag to bypass enabled/working hours/escalation checks
   *                     Used by test-chat endpoint to allow testing without enabling AI
   * @param testHistory - Optional conversation history for test mode context retention
   *                      When provided in test mode, uses this instead of fetching from database
   * Requirements: 3.3, 3.4
   */
  async handleMessage(
    userId: string,
    userMessage: string,
    customerId?: string,
    aiAgentIdOverride?: string,
    whatsappAccountId?: string,
    isTestMode?: boolean,
    testHistory?: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<string | null> {
    console.log(`🤖 AI Orchestrator: Handling message for user ${userId}`, {
      hasAiAgentOverride: !!aiAgentIdOverride,
      aiAgentIdOverride,
      whatsappAccountId,
      isTestMode,
    });

    // 1. Check Config (per-account config takes priority, falls back to user default)
    const config = await resolveAIConfig(userId, whatsappAccountId);

    if (!config) {
      console.log('🤖 AI Orchestrator: No config found for user');
      return null
    }

    // Skip enabled/working hours/escalation checks in test mode
    // This allows users to test their AI Agent before enabling it
    if (!isTestMode) {
      if (!config.enabled) {
        console.log('🤖 AI Orchestrator: AI disabled');
        return null
      }

      // 1.1 Check Working Hours
      console.log('🤖 AI Orchestrator: Working hours config:', {
        timezone: config.timezone,
        workingHours: config.workingHours,
        hasWorkingHours: !!config.workingHours,
      });
      if (!isWithinWorkingHours(config.workingHours as WorkingHours | null, config.timezone || 'Asia/Jakarta')) {
        console.log('🤖 AI Orchestrator: Outside working hours, AI will not respond');
        return null;
      }

      // 1.2 Check Escalation Keywords (with keyword groups support)
      // First check keyword groups (assigns to specific agent), then general keywords
      const escalationResult = whatsappAccountId
        ? await checkEscalationWithGroups(userMessage, config.escalationKeywords as string[] | null, whatsappAccountId, userId)
        : checkEscalation(userMessage, config.escalationKeywords as string[] | null);
      
      if (escalationResult.shouldEscalate) {
        console.log('🤖 AI Orchestrator: Escalation keyword detected:', escalationResult.matchedKeyword);
        
        if (customerId && whatsappAccountId) {
          try {
            // Check if this matched a keyword group (assigns to specific agent)
            if (escalationResult.matchedGroup && escalationResult.matchedKeyword) {
              logger.info('AI Orchestrator: Assigning to specific agent', {
                assignedAgentId: escalationResult.matchedGroup.assignedAgent?.id,
              });
              await handleEscalationAssignToAgent(
                customerId,
                'WHATSAPP',
                userId,
                escalationResult.matchedGroup,
                escalationResult.matchedKeyword
              );
            } else if (config.escalationAutoAssign) {
              // General escalation keyword - move to unassigned queue
              await handleEscalationAssign(customerId, 'WHATSAPP', userId);
            }
          } catch (error) {
            logger.warn('Failed to handle escalation assignment', { error });
          }
        }
        
        return null;
      }
    } else {
      console.log('🤖 AI Orchestrator: Test mode - skipping enabled/working hours/escalation checks');
    }

    // 1.4 Determine which AI Agent to use (Requirement 3.3, 3.4)
    // If aiAgentIdOverride is provided, use that specific AI Agent
    // Otherwise, use the default active agent from AIConfig
    const agentIdToUse = aiAgentIdOverride || config.activeAgentId;

    if (!agentIdToUse) {
      console.log('🤖 AI Orchestrator: No AI agent specified (no override and no active agent)');
      return null
    }

    // 1.5 Get the AI Agent (either override or default)
    // Only include knowledge documents with COMPLETED status (has chunks ready for search)
    const activeAgent = await prisma.aIAgent.findUnique({
      where: { id: agentIdToUse, userId },
      include: {
        knowledgeDocuments: {
          where: { status: "COMPLETED" },
          select: { id: true },
        },
      },
    })

    if (!activeAgent) {
      console.log(`🤖 AI Orchestrator: AI Agent with ID ${agentIdToUse} not found`, {
        isOverride: !!aiAgentIdOverride,
      });
      return null
    }

    logger.debug('AI Orchestrator: Using AI Agent', {
      agentId: activeAgent.id,
      isOverride: !!aiAgentIdOverride,
    });

    // 1.6 Check Filter Words
    if (config.filterWords && Array.isArray(config.filterWords) && config.filterWords.length > 0) {
      const lowerMessage = userMessage.toLowerCase();
      const hasForbiddenWord = (config.filterWords as string[]).some(word =>
        lowerMessage.includes(word.toLowerCase())
      );

      if (hasForbiddenWord) {
        console.log('🤖 AI Orchestrator: Message blocked by filter');
        // Optionally return a canned response or null to ignore.
        // Returning null ignores it (no reply).
        return null;
      }
    }

    // 1.7 Check Excluded Customers
    console.log('🤖 AI Orchestrator: Excluded customers config:', {
      hasExcludedCustomers: !!config.excludedCustomers,
      excludedCustomersCount: Array.isArray(config.excludedCustomers) ? config.excludedCustomers.length : 0,
      excludedCustomers: config.excludedCustomers,
    });

    if (config.excludedCustomers && Array.isArray(config.excludedCustomers) && config.excludedCustomers.length > 0) {
      // Get customer phone if customerId is available
      let customerPhone: string | null = null;
      if (customerId) {
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          select: { phoneNumber: true },
        });
        customerPhone = customer?.phoneNumber || null;
      }

      logger.debug('AI Orchestrator: Checking customer exclusion', {
        customerId,
        customerPhone, // masked by serializer (PII_PHONE_KEYS includes 'customerphone')
        excludedCount: config.excludedCustomers.length,
      });

      const excludedCustomers = config.excludedCustomers as Array<{ type: 'phone' | 'customerId'; value: string; label?: string }>;
      const isExcluded = excludedCustomers.some(excluded => {
        if (excluded.type === 'phone' && customerPhone) {
          // Normalize phone comparison (remove + and spaces)
          const normalizedExcluded = excluded.value.replace(/[\s+\-]/g, '');
          const normalizedCustomer = customerPhone.replace(/[\s+\-]/g, '');
          return normalizedExcluded === normalizedCustomer;
        } else if (excluded.type === 'customerId' && customerId) {
          return excluded.value === customerId;
        }
        return false;
      });

      if (isExcluded) {
        logger.info('AI Orchestrator: Customer excluded from AI responses', { customerId });
        return null;
      }
    }

    // Ensure provider is initialized with latest settings
    const provider = await this.ensureProvider();

    // 2. Retrieve Context (RAG)
    const documentIds = activeAgent.knowledgeDocuments.map(doc => doc.id)
    let contextText = ''

    logger.debug('AI Orchestrator: Knowledge docs available', {
      count: documentIds.length,
      documentIds,
    });

    if (documentIds.length > 0) {
      // Check if chunks exist for debugging
      const chunkCount = await prisma.documentChunk.count({
        where: { documentId: { in: documentIds } },
      })
      logger.debug('AI Orchestrator: Total chunks in database', { chunkCount });

      if (chunkCount === 0) {
        logger.warn('AI Orchestrator: No chunks found, document may still be processing or failed', { documentIds });
      } else {
        logger.debug('AI Orchestrator: Generating embedding for query');
        const queryEmbedding = await provider.generateEmbedding(userMessage);
        // Use very low threshold (0.2) to capture more potentially relevant content
        const relevantDocs = await this.vectorStore.similaritySearch(
          queryEmbedding,
          5,    // Get more results
          0.2,  // Very low threshold for better recall
          documentIds
        );

        logger.debug('AI Orchestrator: Similarity search results', {
          count: relevantDocs.length,
          topScores: relevantDocs.map(d => d.score),
        });

        // Knowledge base previews can contain customer PII the user has uploaded
        // (names, phones, emails). NEVER log the chunk content — only metadata.
        contextText = relevantDocs.map(d => d.content).join('\n\n');

        if (relevantDocs.length === 0) {
          logger.debug('AI Orchestrator: No relevant context found above threshold');
        }
      }
    } else {
      logger.debug('AI Orchestrator: No knowledge documents linked to this AI Agent');
    }

    // 2.5 Search Conversation Memory (if customerId and whatsappAccountId available)
    let memoryContext = '';
    if (customerId && whatsappAccountId) {
      try {
        const memoryStore = await this.ensureMemoryStore();
        const memories = await memoryStore.searchMemories({
          userId,
          customerId,
          whatsappAccountId,
          query: userMessage,
          limit: 5,
          similarityThreshold: 0.7,
        });

        logger.debug('AI Orchestrator: Found relevant memories', { count: memories.length });

        if (memories.length > 0) {
          memoryContext = this.formatMemoriesForPrompt(memories);
          // Memory snippets contain prior customer/agent messages — PII-heavy.
          // Do not log the content; only log that memory was used + length.
          logger.debug('AI Orchestrator: Memory context attached', {
            memoryContextLength: memoryContext.length,
          });
        }
      } catch (error) {
        logger.warn('Failed to search conversation memories', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue without memory context
      }
    }

    // 3. Construct Prompt - user's system prompt + context as reference info
    // Context is appended without additional instructions to not interfere with user's system prompt
    // Build system prompt with knowledge base and memory context
    let systemPrompt = activeAgent.systemPrompt;

    if (contextText.length > 0) {
      systemPrompt += `\n\n---\nKnowledge Base:\n${contextText}`;
    }

    if (memoryContext.length > 0) {
      systemPrompt += `\n\n---\nPast Conversations with This Customer:\n${memoryContext}`;
    }

    console.log('🤖 AI Orchestrator: System prompt length:', systemPrompt.length, 'chars');
    console.log('🤖 AI Orchestrator: Context length:', contextText.length, 'chars');
    console.log('🤖 AI Orchestrator: Memory context length:', memoryContext.length, 'chars');

    const messages: AIChatMessage[] = [
      { role: 'system', content: systemPrompt }
    ];

    // 3.5 Fetch Conversation History (Contextual AI)
    // In test mode with testHistory, use the provided history instead of fetching from database
    if (isTestMode && testHistory && testHistory.length > 0) {
      console.log(`🤖 AI Orchestrator: Using test mode history (${testHistory.length} messages)`);
      
      testHistory.forEach(msg => {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      });
    } else if (customerId) {
      console.log(`🤖 AI Orchestrator: Fetching conversation history for customer ${customerId}...`);

      const history = await prisma.message.findMany({
        where: {
          customerId,
          messageType: 'TEXT', // Only include text messages for context
          content: { not: null }, // Exclude messages without content
        },
        orderBy: { timestamp: 'desc' },
        take: 10, // Last 10 messages
      });

      console.log(`🤖 AI Orchestrator: Found ${history.length} historical messages`);

      // Format and add history messages (reverse to chronological order)
      history.reverse().forEach(msg => {
        if (msg.content) {
          messages.push({
            role: msg.direction === 'INBOUND' ? 'user' : 'assistant',
            content: msg.content,
          });
        }
      });
    } else {
      console.log('🤖 AI Orchestrator: No customerId provided, skipping conversation history');
    }

    // 4. Always add the current user message at the end
    messages.push({ role: 'user', content: userMessage });

    // Use admin-configured default chat model instead of user-level config.model
    const chatModel = this.lastDefaultChatModel || DEFAULT_CHAT_MODEL;
    console.log(`🤖 AI Orchestrator: Generating response using model ${chatModel}...`);

    // 5. Generate Response
    const response = await provider.generateResponse(messages, {
      temperature: config.temperature,
      model: chatModel,
    });

    console.log('🤖 AI Orchestrator: Response generated');
    return response;
  }

  /**
   * Handle incoming message with assignment check
   * 
   * Checks the conversation's assignment status before generating AI response.
   * - If assigned to human → return null (skip AI response)
   * - If assigned to AI Agent → use that AI Agent's configuration
   * - If unassigned with AI enabled → use default AI Agent
   * 
   * @param userId - The business owner's user ID
   * @param userMessage - The incoming message content
   * @param conversationId - The conversation ID (Customer ID for WhatsApp, IGConversation ID for Instagram)
   * @param conversationType - The conversation type (WHATSAPP or INSTAGRAM)
   * @param customerId - Optional customer ID for conversation history
   * @returns AI response or null if AI should not respond
   * Requirements: 6.1, 6.2, 6.3, 6.4, 6.5
   */
  async handleMessageWithAssignmentCheck(
    userId: string,
    userMessage: string,
    conversationId: string,
    conversationType: ConversationType,
    customerId?: string,
    whatsappAccountId?: string
  ): Promise<string | null> {
    console.log(`🤖 AI Orchestrator: Handling message with assignment check`, {
      userId,
      conversationId,
      conversationType,
      whatsappAccountId,
    });

    // 1. Check if AI should respond based on assignment status (Requirement 6.1)
    const decision = await assignmentService.shouldAIRespond(
      conversationId,
      conversationType,
      userId,
      whatsappAccountId
    );

    // 2. Log the decision for debugging (Requirement 6.5)
    logger.info('AI response decision', {
      conversationId,
      conversationType,
      shouldRespond: decision.shouldRespond,
      reason: decision.reason,
      aiAgentId: decision.aiAgentId,
      aiAgentName: decision.aiAgentName,
    });

    console.log(`🤖 AI Orchestrator: AI response decision`, {
      shouldRespond: decision.shouldRespond,
      reason: decision.reason,
      aiAgentId: decision.aiAgentId,
      aiAgentName: decision.aiAgentName,
    });

    // 3. If should not respond, return null (Requirement 6.2)
    if (!decision.shouldRespond) {
      console.log(`🤖 AI Orchestrator: Skipping AI response - ${decision.reason}`);
      return null;
    }

    // 4. If should respond, call handleMessage with aiAgentId (Requirement 6.3, 6.4)
    // Pass the aiAgentId from the decision to use the correct AI Agent configuration
    return this.handleMessage(
      userId,
      userMessage,
      customerId,
      decision.aiAgentId ?? undefined,
      whatsappAccountId
    );
  }
}