import { OpenAIEmbeddings, ChatOpenAI } from '@langchain/openai';
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages';
import { ILLMProvider } from './ILLMProvider.js';
import { AIChatMessage } from '../types.js';

export const DEFAULT_EMBEDDING_MODEL = 'text-embedding-3-small';

export class OpenAIProvider implements ILLMProvider {
  private embeddingModelInstance: OpenAIEmbeddings;
  private chatModel: ChatOpenAI;

  private apiKey: string;
  private baseUrl?: string;
  private embeddingModel: string;

  constructor(apiKey: string, baseUrl?: string, embeddingModel?: string) {
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    this.embeddingModel = embeddingModel || DEFAULT_EMBEDDING_MODEL;

    const baseConfig = {
      apiKey: apiKey,
      ...(baseUrl && { configuration: { baseURL: baseUrl } }),
    };

    this.embeddingModelInstance = new OpenAIEmbeddings({
      ...baseConfig,
      model: this.embeddingModel,
    });

    this.chatModel = new ChatOpenAI({
      ...baseConfig,
      model: 'gpt-4.1-nano-2025-04-14', // Default
    });
  }

  async generateResponse(
    messages: AIChatMessage[],
    config: { temperature: number; model: string }
  ): Promise<string> {
    // Create a model instance with specific config for this request
    // This is safer than trying to override call options which might change across versions
    const chat = new ChatOpenAI({
      apiKey: this.apiKey,
      model: config.model,
      temperature: config.temperature,
      ...(this.baseUrl && { configuration: { baseURL: this.baseUrl } }),
    });

    const formattedMessages = messages.map((msg) => {
      switch (msg.role) {
        case 'system':
          return new SystemMessage(msg.content);
        case 'user':
          return new HumanMessage(msg.content);
        case 'assistant':
          return new AIMessage(msg.content);
        default:
          throw new Error(`Unknown role: ${(msg as any).role}`);
      }
    });

    const response = await chat.invoke(formattedMessages);

    // Handle response content which can be string or MessageContentComplex[]
    if (typeof response.content === 'string') {
      return response.content;
    }
    
    // If content is array (e.g. multimodal), join text parts
    if (Array.isArray(response.content)) {
      return response.content
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text)
        .join('');
    }

    return String(response.content);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // Replace newlines to improve embedding quality
    const cleanText = text.replace(/\n/g, ' ');
    return await this.embeddingModelInstance.embedQuery(cleanText);
  }

  async generateEmbeddings(texts: string[]): Promise<number[][]> {
    // Replace newlines in all texts
    const cleanTexts = texts.map(text => text.replace(/\n/g, ' '));
    return await this.embeddingModelInstance.embedDocuments(cleanTexts);
  }
}