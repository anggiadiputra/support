/**
 * WhatsApp Insights Service
 * 
 * Fetches and processes analytics data from Meta Graph API.
 * Implements caching to avoid rate limiting.
 * Uses user's specific WABA access token for API calls.
 * 
 * Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.5, 3.1, 3.3, 7.1, 7.2, 7.4
 */

import { WhatsAppAPI } from '../utils/whatsapp.js';
import { settingsCache } from './settings-cache.js';
import { logger } from '../utils/logger.js';
import { prisma } from '../utils/database.js';
import { TokenEncryptionService } from '../utils/tokenEncryption.js';
import type {
  MessageAnalyticsParams,
  MessageAnalyticsData,
  ConversationAnalyticsParams,
  ConversationAnalyticsData,
  TemplatePerformanceParams,
  TemplatePerformanceData,
  InsightsOverviewParams,
  InsightsOverviewData,
  IInsightsService,
  InsightsError,
  InsightsErrorCode,
  MetaMessageAnalyticsResponse,
  MetaConversationAnalyticsResponse,
  MetaTemplatePerformanceResponse,
} from '../types/insights.js';

// Re-import cache config and key generator
import {
  INSIGHTS_CACHE_CONFIG as cacheConfig,
  generateInsightsCacheKey as generateCacheKey,
} from '../types/insights.js';

/**
 * Custom error class for insights-related errors
 * Requirements: 1.4, 2.5, 3.3, 7.4
 */
export class InsightsServiceError extends Error {
  public code: InsightsErrorCode;
  public details?: InsightsError['details'];
  public cachedData?: unknown;

  constructor(code: InsightsErrorCode, message: string, details?: InsightsError['details'], cachedData?: unknown) {
    super(message);
    this.name = 'InsightsServiceError';
    this.code = code;
    this.details = details;
    this.cachedData = cachedData;
  }

  toJSON(): InsightsError {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }
}

/**
 * Insights Service Implementation
 * Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 2.5, 3.1, 3.3, 7.1, 7.2, 7.4
 */
class InsightsService implements IInsightsService {
  private tokenEncryption: TokenEncryptionService | null = null;

  /**
   * Get or create TokenEncryptionService instance
   * Lazy initialization to handle missing env vars gracefully
   */
  private getTokenEncryption(): TokenEncryptionService {
    if (!this.tokenEncryption) {
      try {
        this.tokenEncryption = new TokenEncryptionService();
      } catch (error) {
        logger.error('Failed to initialize TokenEncryptionService', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        throw new InsightsServiceError(
          'META_API_ERROR',
          'Server configuration error. Please contact support.'
        );
      }
    }
    return this.tokenEncryption;
  }

  /**
   * Get WhatsApp client with per-account WABA access token
   * @param wabaId - The WABA ID to get the client for
   * @returns WhatsApp API client configured with the account's access token
   */
  private async getClientForWaba(wabaId: string): Promise<WhatsAppAPI> {
    // Find WhatsApp account by WABA ID
    const whatsappAccount = await prisma.whatsAppAccount.findUnique({
      where: { wabaId },
      select: {
        accessToken: true,
        accessTokenIV: true,
        accessTokenTag: true,
        connectionStatus: true,
      },
    });

    if (!whatsappAccount) {
      throw new InsightsServiceError(
        'NO_WABA_CONNECTED',
        'No WhatsApp Business Account found with this WABA ID.'
      );
    }

    if (whatsappAccount.connectionStatus !== 'connected') {
      throw new InsightsServiceError(
        'NO_WABA_CONNECTED',
        'WhatsApp Business Account is not connected. Please reconnect your WABA.'
      );
    }

    if (!whatsappAccount.accessToken || !whatsappAccount.accessTokenIV || !whatsappAccount.accessTokenTag) {
      throw new InsightsServiceError(
        'UNAUTHORIZED',
        'No access token found for this WhatsApp Business Account. Please reconnect your WABA.'
      );
    }

    // Decrypt the access token from WhatsAppAccount
    try {
      const tokenEncryption = this.getTokenEncryption();
      const accessToken = tokenEncryption.decrypt({
        ciphertext: whatsappAccount.accessToken,
        iv: whatsappAccount.accessTokenIV,
        authTag: whatsappAccount.accessTokenTag,
        algorithm: 'aes-256-gcm',
      });

      return new WhatsAppAPI({ accessToken });
    } catch (error) {
      if (error instanceof InsightsServiceError) {
        throw error;
      }
      logger.error('Failed to decrypt WABA access token', {
        wabaId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new InsightsServiceError(
        'UNAUTHORIZED',
        'Failed to decrypt access token. Please reconnect your WhatsApp Business Account.'
      );
    }
  }

  /**
   * Get message analytics from Meta Graph API
   * Requirements: 1.1, 1.2, 1.4, 7.1, 7.2, 7.4
   */
  async getMessageAnalytics(params: MessageAnalyticsParams): Promise<MessageAnalyticsData> {
    const cacheKey = generateCacheKey('messageAnalytics', params.wabaId, {
      start: params.startDate,
      end: params.endDate,
      granularity: params.granularity,
      phoneNumbers: params.phoneNumbers,
    });

    // Check cache first
    const cached = settingsCache.get<MessageAnalyticsData>(cacheKey);
    if (cached) {
      logger.debug('Message analytics cache hit', { wabaId: params.wabaId });
      return cached;
    }

    try {
      const client = await this.getClientForWaba(params.wabaId);
      const response = await client.getAnalytics(params.wabaId, {
        startDate: params.startDate,
        endDate: params.endDate,
        granularity: params.granularity,
        phoneNumbers: params.phoneNumbers,
      });

      const data = this.processMessageAnalytics(response);

      // Cache the result
      settingsCache.set(cacheKey, data, cacheConfig.messageAnalytics.ttl);
      logger.debug('Message analytics fetched and cached', { wabaId: params.wabaId });

      return data;
    } catch (error) {
      // Re-throw InsightsServiceError as-is
      if (error instanceof InsightsServiceError) {
        throw error;
      }
      // Try to return cached data on rate limit (Requirement 7.4)
      const cachedFallback = settingsCache.get<MessageAnalyticsData>(cacheKey);
      throw this.handleMetaApiError(error, 'message analytics', cachedFallback);
    }
  }

  /**
   * Get conversation analytics from Meta Graph API
   * Requirements: 2.1, 2.2, 2.5, 7.1, 7.2, 7.4
   */
  async getConversationAnalytics(params: ConversationAnalyticsParams): Promise<ConversationAnalyticsData> {
    const cacheKey = generateCacheKey('conversationAnalytics', params.wabaId, {
      start: params.startDate,
      end: params.endDate,
      granularity: params.granularity,
      phoneNumbers: params.phoneNumbers,
      categories: params.conversationCategories,
    });

    // Check cache first
    const cached = settingsCache.get<ConversationAnalyticsData>(cacheKey);
    if (cached) {
      logger.debug('Conversation analytics cache hit', { wabaId: params.wabaId });
      return cached;
    }

    try {
      const client = await this.getClientForWaba(params.wabaId);
      
      logger.debug('Fetching conversation analytics from Meta API', {
        wabaId: params.wabaId,
        startDate: params.startDate,
        endDate: params.endDate,
        granularity: params.granularity,
      });

      const response = await client.getConversationAnalytics(params.wabaId, {
        startDate: params.startDate,
        endDate: params.endDate,
        granularity: params.granularity,
        phoneNumbers: params.phoneNumbers,
        conversationCategories: params.conversationCategories,
        conversationTypes: params.conversationTypes,
        conversationDirections: params.conversationDirections,
      });

      logger.debug('Meta API conversation analytics response received', {
        wabaId: params.wabaId,
        hasData: !!response?.conversation_analytics,
        dataLength: response?.conversation_analytics?.data?.length || 0,
      });

      const data = this.processConversationAnalytics(response);

      // Cache the result
      settingsCache.set(cacheKey, data, cacheConfig.conversationAnalytics.ttl);
      logger.debug('Conversation analytics fetched and cached', { wabaId: params.wabaId });

      return data;
    } catch (error) {
      logger.error('Error fetching conversation analytics', {
        wabaId: params.wabaId,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      
      // Re-throw InsightsServiceError as-is
      if (error instanceof InsightsServiceError) {
        throw error;
      }
      // Try to return cached data on rate limit (Requirement 7.4)
      const cachedFallback = settingsCache.get<ConversationAnalyticsData>(cacheKey);
      throw this.handleMetaApiError(error, 'conversation analytics', cachedFallback);
    }
  }

  /**
   * Get template performance metrics from Meta Graph API
   * Requirements: 3.1, 3.3, 7.1, 7.2, 7.4
   * Note: template_ids is required by Meta API. Fetches from Meta API if not provided.
   * 
   * IMPORTANT: Template analytics must be enabled on WABA first.
   * If not enabled, this will attempt to enable it automatically.
   */
  async getTemplatePerformance(params: TemplatePerformanceParams): Promise<TemplatePerformanceData> {
    let templateIds = params.templateIds;
    let client: WhatsAppAPI;

    try {
      client = await this.getClientForWaba(params.wabaId);
    } catch (error) {
      if (error instanceof InsightsServiceError) {
        throw error;
      }
      throw new InsightsServiceError(
        'META_API_ERROR',
        'Failed to get WhatsApp client for template analytics'
      );
    }

    // If no template IDs provided, fetch from Meta API directly
    if (!templateIds || templateIds.length === 0) {
      try {
        logger.debug('Fetching template list from Meta API', { wabaId: params.wabaId });
        
        const templatesResponse = await client.listTemplates(params.wabaId, 10);
        
        if (templatesResponse?.data && Array.isArray(templatesResponse.data)) {
          // Filter only APPROVED templates and get their IDs
          templateIds = templatesResponse.data
            .filter((t: any) => t.status === 'APPROVED' && t.id)
            .map((t: any) => t.id)
            .slice(0, 10); // Max 10 as per Meta API
          
          logger.debug('Fetched template IDs from Meta API', { 
            wabaId: params.wabaId, 
            count: templateIds.length,
            templateIds,
          });
        }
      } catch (error) {
        logger.warn('Failed to fetch template IDs from Meta API', {
          wabaId: params.wabaId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        
        // Re-throw InsightsServiceError (like NO_WABA_CONNECTED)
        if (error instanceof InsightsServiceError) {
          throw error;
        }
      }
    }

    // If still no template IDs, return empty result
    if (!templateIds || templateIds.length === 0) {
      logger.debug('No template IDs available, returning empty result', { wabaId: params.wabaId });
      return { templates: [] };
    }

    const cacheKey = generateCacheKey('templatePerformance', params.wabaId, {
      start: params.startDate,
      end: params.endDate,
      templateIds,
    });

    // Check cache first
    const cached = settingsCache.get<TemplatePerformanceData>(cacheKey);
    if (cached) {
      logger.debug('Template performance cache hit', { wabaId: params.wabaId });
      return cached;
    }

    try {
      logger.debug('Fetching template performance from Meta API', {
        wabaId: params.wabaId,
        templateIds,
        startDate: params.startDate,
        endDate: params.endDate,
      });

      const response = await client.getTemplatePerformanceMetrics(params.wabaId, {
        startDate: params.startDate,
        endDate: params.endDate,
        templateIds,
      });

      logger.debug('Meta API template performance response received', {
        wabaId: params.wabaId,
        hasData: !!response?.data,
        dataLength: response?.data?.length || 0,
      });

      const data = this.processTemplatePerformance(response);

      // Cache the result
      settingsCache.set(cacheKey, data, cacheConfig.templatePerformance.ttl);
      logger.debug('Template performance fetched and cached', { wabaId: params.wabaId });

      return data;
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      
      console.log('❌ Template Performance Error in Service:')
      console.log('   Meta Error Code:', metaError?.code)
      console.log('   Meta Error Subcode:', metaError?.error_subcode)
      console.log('   Meta Error Message:', metaError?.message)
      console.log('   Meta Error Data:', metaError?.error_data)

      // Check if template insights is not enabled (error_subcode 4182004)
      // Error: "Template Insights have not been enabled for this WhatsApp Business Account."
      if (metaError?.error_subcode === 4182004 || 
          metaError?.error_data?.toLowerCase().includes('not been enabled') ||
          metaError?.message?.toLowerCase().includes('not enabled')) {
        
        console.log('🔧 Template Insights not enabled, attempting to enable...')
        
        try {
          await client.enableTemplateInsights(params.wabaId);
          console.log('✅ Template Insights enabled successfully! Retrying request...')
          
          // Retry the request after enabling
          const response = await client.getTemplatePerformanceMetrics(params.wabaId, {
            startDate: params.startDate,
            endDate: params.endDate,
            templateIds,
          });

          const data = this.processTemplatePerformance(response);
          settingsCache.set(cacheKey, data, cacheConfig.templatePerformance.ttl);
          
          return data;
        } catch (enableError: any) {
          const enableErrorData = enableError?.response?.data?.error;
          console.error('❌ Failed to enable template insights:', enableErrorData || enableError?.message)
          
          // Check if it's SMB account limitation (code 10)
          // SMB accounts cannot enable template insights via API - must be done manually
          if (enableErrorData?.code === 10 || enableErrorData?.message?.includes('SMB')) {
            console.log('ℹ️ SMB account detected - Template Insights must be enabled manually via WhatsApp Manager')
            // Return empty result for SMB accounts - this is expected behavior
            return { templates: [] };
          }
          
          // For other errors, also return empty to not break the page
          console.log('ℹ️ Returning empty template analytics due to enable failure')
          return { templates: [] };
        }
      }

      // Re-throw InsightsServiceError as-is
      if (error instanceof InsightsServiceError) {
        throw error;
      }
      
      // Check for region restriction (EU/Japan) - Requirement 3.3
      if (this.isRegionRestricted(error)) {
        logger.warn('Template performance region restricted', { wabaId: params.wabaId });
        // Return empty for region restricted - don't break the page
        return { templates: [] };
      }
      
      // For other Meta API errors, return empty result to not break the insights page
      if (metaError) {
        console.log('ℹ️ Returning empty template analytics due to Meta API error:', metaError.message)
        return { templates: [] };
      }
      
      // Try to return cached data on rate limit (Requirement 7.4)
      const cachedFallback = settingsCache.get<TemplatePerformanceData>(cacheKey);
      throw this.handleMetaApiError(error, 'template performance', cachedFallback);
    }
  }

  /**
   * Get combined insights overview
   * Requirements: 1.1, 1.4, 2.1, 2.5, 7.1, 7.2, 7.4
   */
  async getInsightsOverview(params: InsightsOverviewParams): Promise<InsightsOverviewData> {
    const cacheKey = generateCacheKey('overview', params.wabaId, {
      start: params.startDate,
      end: params.endDate,
      granularity: params.granularity,
    });

    // Check cache first
    const cached = settingsCache.get<InsightsOverviewData>(cacheKey);
    if (cached) {
      logger.debug('Insights overview cache hit', { wabaId: params.wabaId });
      return cached;
    }

    try {
      // Fetch both message and conversation analytics in parallel
      const [messageData, conversationData] = await Promise.all([
        this.getMessageAnalytics({
          wabaId: params.wabaId,
          startDate: params.startDate,
          endDate: params.endDate,
          granularity: params.granularity,
          phoneNumbers: params.phoneNumbers,
        }),
        this.getConversationAnalytics({
          wabaId: params.wabaId,
          startDate: params.startDate,
          endDate: params.endDate,
          granularity: params.granularity,
          phoneNumbers: params.phoneNumbers,
        }),
      ]);

      const overview: InsightsOverviewData = {
        messages: {
          totalSent: messageData.totals.sent,
          totalDelivered: messageData.totals.delivered,
          deliveryRate: messageData.totals.deliveryRate,
        },
        conversations: {
          total: conversationData.totals.totalConversations,
          estimatedCost: conversationData.totals.totalCost,
          byCategory: conversationData.totals.byCategory,
        },
        period: {
          start: params.startDate,
          end: params.endDate,
          granularity: params.granularity,
        },
      };

      // Cache the result
      settingsCache.set(cacheKey, overview, cacheConfig.overview.ttl);
      logger.debug('Insights overview fetched and cached', { wabaId: params.wabaId });

      return overview;
    } catch (error) {
      if (error instanceof InsightsServiceError) {
        throw error;
      }
      // Try to return cached data on rate limit (Requirement 7.4)
      const cachedFallback = settingsCache.get<InsightsOverviewData>(cacheKey);
      throw this.handleMetaApiError(error, 'insights overview', cachedFallback);
    }
  }

  /**
   * Process raw message analytics response
   */
  private processMessageAnalytics(response: MetaMessageAnalyticsResponse): MessageAnalyticsData {
    const analytics = response.analytics;
    const dataPoints = analytics.data_points || [];

    // Calculate totals
    let totalSent = 0;
    let totalDelivered = 0;

    for (const point of dataPoints) {
      totalSent += point.sent || 0;
      totalDelivered += point.delivered || 0;
    }

    const deliveryRate = totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0;

    return {
      phoneNumbers: analytics.phone_numbers || [],
      countryCodes: analytics.country_codes || [],
      granularity: analytics.granularity as MessageAnalyticsData['granularity'],
      dataPoints: dataPoints.map(point => ({
        start: point.start,
        end: point.end,
        sent: point.sent || 0,
        delivered: point.delivered || 0,
      })),
      totals: {
        sent: totalSent,
        delivered: totalDelivered,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
      },
    };
  }

  /**
   * Process raw conversation analytics response
   */
  private processConversationAnalytics(response: MetaConversationAnalyticsResponse): ConversationAnalyticsData {
    const conversationAnalytics = response.conversation_analytics;
    const allDataPoints = conversationAnalytics?.data?.flatMap(d => d.data_points) || [];

    // Calculate totals
    let totalConversations = 0;
    let totalCost = 0;
    const byCategory = { marketing: 0, utility: 0, authentication: 0, service: 0 };
    const costByCategory = { marketing: 0, utility: 0, authentication: 0, service: 0 };

    for (const point of allDataPoints) {
      totalConversations += point.conversation || 0;
      totalCost += point.cost || 0;

      const category = point.conversation_category?.toLowerCase() as keyof typeof byCategory;
      if (category && category in byCategory) {
        byCategory[category] += point.conversation || 0;
        costByCategory[category] += point.cost || 0;
      }
    }

    return {
      dataPoints: allDataPoints.map(point => ({
        start: point.start,
        end: point.end,
        conversation: point.conversation || 0,
        phoneNumber: point.phone_number || '',
        country: point.country || '',
        conversationType: point.conversation_type || '',
        conversationDirection: point.conversation_direction || '',
        conversationCategory: point.conversation_category || '',
        cost: point.cost || 0,
      })),
      totals: {
        totalConversations,
        totalCost: Math.round(totalCost * 100) / 100,
        byCategory,
        costByCategory: {
          marketing: Math.round(costByCategory.marketing * 100) / 100,
          utility: Math.round(costByCategory.utility * 100) / 100,
          authentication: Math.round(costByCategory.authentication * 100) / 100,
          service: Math.round(costByCategory.service * 100) / 100,
        },
      },
    };
  }

  /**
   * Process raw template performance response
   * Meta API returns data in format:
   * {
   *   data: [{
   *     granularity: "DAILY",
   *     data_points: [{
   *       template_id: "123",
   *       start: 1718064000,
   *       end: 1718150400,
   *       sent: 1,
   *       delivered: 1,
   *       read: 1,
   *       clicked: [{ type: "url_button", count: 10 }],
   *       cost: [{ type: "amount_spent", value: 0.01 }]
   *     }]
   *   }]
   * }
   */
  private processTemplatePerformance(response: MetaTemplatePerformanceResponse): TemplatePerformanceData {
    // Handle the actual Meta API response format
    const dataArray = response.data || [];
    
    // Aggregate data points by template_id
    const templateMap = new Map<string, {
      sent: number;
      delivered: number;
      read: number;
      clicked: number;
    }>();

    for (const dataGroup of dataArray) {
      const dataPoints = (dataGroup as any).data_points || [];
      
      for (const point of dataPoints) {
        const templateId = point.template_id;
        if (!templateId) continue;

        const existing = templateMap.get(templateId) || {
          sent: 0,
          delivered: 0,
          read: 0,
          clicked: 0,
        };

        existing.sent += point.sent || 0;
        existing.delivered += point.delivered || 0;
        existing.read += point.read || 0;
        
        // Handle clicked array format
        if (Array.isArray(point.clicked)) {
          for (const click of point.clicked) {
            existing.clicked += click.count || 0;
          }
        } else if (typeof point.clicked === 'number') {
          existing.clicked += point.clicked;
        }

        templateMap.set(templateId, existing);
      }
    }

    // Convert map to array
    const templates = Array.from(templateMap.entries()).map(([templateId, stats]) => {
      const deliveryRate = stats.sent > 0 ? (stats.delivered / stats.sent) * 100 : 0;
      const readRate = stats.delivered > 0 ? (stats.read / stats.delivered) * 100 : 0;
      const clickRate = stats.clicked > 0 && stats.delivered > 0 
        ? (stats.clicked / stats.delivered) * 100 
        : undefined;

      return {
        templateId,
        sent: stats.sent,
        delivered: stats.delivered,
        read: stats.read,
        clicked: stats.clicked > 0 ? stats.clicked : undefined,
        deliveryRate: Math.round(deliveryRate * 100) / 100,
        readRate: Math.round(readRate * 100) / 100,
        clickRate: clickRate !== undefined ? Math.round(clickRate * 100) / 100 : undefined,
      };
    });

    return { templates };
  }

  /**
   * Check if error is due to region restriction (EU/Japan)
   * Requirement: 3.3
   */
  private isRegionRestricted(error: unknown): boolean {
    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { response?: { data?: { error?: { code?: number; message?: string } } } };
      const metaError = axiosError.response?.data?.error;
      // Meta returns specific error codes for region restrictions
      // Error code 100 with "not available" message indicates region restriction
      return metaError?.code === 100 && (
        metaError?.message?.toLowerCase().includes('not available') ||
        metaError?.message?.toLowerCase().includes('region') ||
        metaError?.message?.toLowerCase().includes('privacy')
      );
    }
    return false;
  }

  /**
   * Handle Meta API errors and convert to InsightsServiceError
   * Supports cached data fallback for rate limiting (Requirement 7.4)
   * Requirements: 1.4, 2.5, 7.4
   */
  private handleMetaApiError(error: unknown, context: string = 'insights', cachedData?: unknown): InsightsServiceError {
    logger.error(`Meta API error in ${context}`, {
      error: error instanceof Error ? error.message : 'Unknown error',
      context,
      hasCachedFallback: !!cachedData,
    });

    if (error && typeof error === 'object' && 'response' in error) {
      const axiosError = error as { 
        response?: { 
          status?: number; 
          data?: { error?: { code?: number; message?: string; error_subcode?: number } };
          headers?: { 'x-business-use-case-usage'?: string; 'retry-after'?: string };
        } 
      };
      const status = axiosError.response?.status;
      const metaError = axiosError.response?.data?.error;
      const headers = axiosError.response?.headers;

      // Rate limiting - return cached data if available (Requirement 7.4)
      if (status === 429 || metaError?.code === 4) {
        const retryAfter = headers?.['retry-after'] 
          ? parseInt(headers['retry-after'], 10) 
          : 60; // Default retry after 60 seconds

        logger.warn(`Rate limited on ${context}, retry after ${retryAfter}s`, {
          hasCachedData: !!cachedData,
        });

        return new InsightsServiceError(
          'RATE_LIMITED',
          cachedData 
            ? 'Meta API rate limit reached. Showing cached data. Please try again later.'
            : 'Meta API rate limit reached. Please try again later.',
          {
            metaErrorCode: metaError?.code,
            metaErrorMessage: metaError?.message || 'Rate limit exceeded',
            retryAfter,
          },
          cachedData
        );
      }

      // Unauthorized - invalid or expired token
      if (status === 401 || metaError?.code === 190) {
        logger.error('Unauthorized access to Meta API', {
          errorSubcode: metaError?.error_subcode,
        });

        return new InsightsServiceError(
          'UNAUTHORIZED',
          'Invalid or expired access token. Please reconnect your WhatsApp Business Account.',
          {
            metaErrorCode: metaError?.code,
            metaErrorMessage: metaError?.message,
          }
        );
      }

      // Permission denied
      if (status === 403 || metaError?.code === 10 || metaError?.code === 200) {
        return new InsightsServiceError(
          'META_API_ERROR',
          'Permission denied. Please ensure your WhatsApp Business Account has the required permissions.',
          {
            metaErrorCode: metaError?.code,
            metaErrorMessage: metaError?.message,
          }
        );
      }

      // Generic Meta API error with detailed message
      const errorMessage = metaError?.message || 'Failed to fetch data from Meta API';
      return new InsightsServiceError(
        'META_API_ERROR',
        `Error fetching ${context}: ${errorMessage}`,
        {
          metaErrorCode: metaError?.code,
          metaErrorMessage: metaError?.message,
        }
      );
    }

    // Network or unknown error
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new InsightsServiceError(
      'META_API_ERROR',
      `Error fetching ${context}: ${errorMessage}`
    );
  }
}

// Export singleton instance
export const insightsService = new InsightsService();
