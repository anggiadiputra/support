/**
 * WhatsApp Insights API Client
 * 
 * Provides methods for fetching WhatsApp analytics from Meta Graph API
 * through the backend insights service.
 * 
 * Requirements: 1.1, 2.1, 3.1
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

// =============================================================================
// Types
// =============================================================================

// Meta API granularity values (must match exactly what Meta expects)
export type Granularity = 'HALF_HOUR' | 'DAY' | 'MONTH'
export type ConversationCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE'

export type InsightsErrorCode =
  | 'NO_WABA_CONNECTED'
  | 'META_API_ERROR'
  | 'RATE_LIMITED'
  | 'REGION_RESTRICTED'
  | 'UNAUTHORIZED'
  | 'INVALID_PARAMS'

export interface InsightsError {
  code: InsightsErrorCode
  message: string
  details?: {
    metaErrorCode?: number
    metaErrorMessage?: string
    retryAfter?: number
  }
}

export interface InsightsApiResponse<T> {
  success: boolean
  data: T
  cached?: boolean
  error?: InsightsError
}

// Message Analytics Types
export interface MessageAnalyticsParams {
  startDate: number
  endDate: number
  granularity?: Granularity
  phoneNumbers?: string[]
  wabaAccountId?: string
}

export interface MessageAnalyticsDataPoint {
  start: number
  end: number
  sent: number
  delivered: number
}

export interface MessageAnalyticsData {
  phoneNumbers: string[]
  countryCodes: string[]
  granularity: Granularity
  dataPoints: MessageAnalyticsDataPoint[]
  totals: {
    sent: number
    delivered: number
    deliveryRate: number
  }
}

// Conversation Analytics Types
export interface ConversationAnalyticsParams {
  startDate: number
  endDate: number
  granularity?: Granularity
  phoneNumbers?: string[]
  categories?: ConversationCategory[]
  wabaAccountId?: string
}

export interface ConversationDataPoint {
  start: number
  end: number
  conversation: number
  phoneNumber: string
  country: string
  conversationType: string
  conversationDirection: string
  conversationCategory: string
  cost: number
}

export interface ConversationAnalyticsData {
  dataPoints: ConversationDataPoint[]
  totals: {
    totalConversations: number
    totalCost: number
    byCategory: {
      marketing: number
      utility: number
      authentication: number
      service: number
    }
    costByCategory: {
      marketing: number
      utility: number
      authentication: number
      service: number
    }
  }
}

// Template Performance Types
export interface TemplatePerformanceParams {
  startDate: number
  endDate: number
  templateIds?: string[]
  wabaAccountId?: string
}

export interface TemplatePerformanceItem {
  templateId: string
  templateName?: string
  sent: number
  delivered: number
  read: number
  clicked?: number
  replied?: number
  deliveryRate: number
  readRate: number
  clickRate?: number
}

export interface TemplatePerformanceData {
  templates: TemplatePerformanceItem[]
}

// Overview Types
export interface InsightsOverviewParams {
  startDate: number
  endDate: number
  granularity?: Granularity
  phoneNumbers?: string[]
  wabaAccountId?: string
}

export interface InsightsOverviewData {
  messages: {
    totalSent: number
    totalDelivered: number
    deliveryRate: number
  }
  conversations: {
    total: number
    estimatedCost: number
    byCategory: {
      marketing: number
      utility: number
      authentication: number
      service: number
    }
  }
  period: {
    start: number
    end: number
    granularity: Granularity
  }
}

// =============================================================================
// Error Class
// =============================================================================

export class InsightsApiError extends Error {
  code: InsightsErrorCode
  details?: InsightsError['details']

  constructor(error: InsightsError) {
    super(error.message)
    this.name = 'InsightsApiError'
    this.code = error.code
    this.details = error.details
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

function buildQueryString(params: Record<string, unknown>): string {
  const searchParams = new URLSearchParams()
  
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      if (Array.isArray(value)) {
        searchParams.set(key, JSON.stringify(value))
      } else {
        searchParams.set(key, String(value))
      }
    }
  })
  
  return searchParams.toString()
}

async function handleResponse<T>(response: Response): Promise<T> {
  const result: InsightsApiResponse<T> = await response.json()
  
  // If success is true, return data (even if there's a rate limit warning with cached data)
  if (result.success) {
    return result.data
  }
  
  // If we have an error, throw it
  if (result.error) {
    throw new InsightsApiError(result.error)
  }
  
  // Fallback error
  throw new InsightsApiError({
    code: 'META_API_ERROR',
    message: 'An unexpected error occurred',
  })
}

// =============================================================================
// API Methods
// =============================================================================

export const insightsApi = {
  /**
   * Get message analytics from Meta Graph API
   * Requirements: 1.1
   */
  async getMessageAnalytics(params: MessageAnalyticsParams): Promise<MessageAnalyticsData> {
    const queryString = buildQueryString({
      startDate: params.startDate,
      endDate: params.endDate,
      granularity: params.granularity || 'DAY',
      phoneNumbers: params.phoneNumbers,
      wabaAccountId: params.wabaAccountId,
    })

    const response = await fetch(`${API_URL}/api/v1/insights/messages?${queryString}`, {
      method: 'GET',
      credentials: 'include',
    })

    return handleResponse<MessageAnalyticsData>(response)
  },

  /**
   * Get conversation analytics from Meta Graph API
   * Requirements: 2.1
   */
  async getConversationAnalytics(params: ConversationAnalyticsParams): Promise<ConversationAnalyticsData> {
    const queryString = buildQueryString({
      startDate: params.startDate,
      endDate: params.endDate,
      granularity: params.granularity || 'DAY',
      phoneNumbers: params.phoneNumbers,
      categories: params.categories,
      wabaAccountId: params.wabaAccountId,
    })

    const response = await fetch(`${API_URL}/api/v1/insights/conversations?${queryString}`, {
      method: 'GET',
      credentials: 'include',
    })

    return handleResponse<ConversationAnalyticsData>(response)
  },

  /**
   * Get template performance metrics from Meta Graph API
   * Requirements: 3.1
   */
  async getTemplatePerformance(params: TemplatePerformanceParams): Promise<TemplatePerformanceData> {
    const queryString = buildQueryString({
      startDate: params.startDate,
      endDate: params.endDate,
      templateIds: params.templateIds,
      wabaAccountId: params.wabaAccountId,
    })

    const response = await fetch(`${API_URL}/api/v1/insights/templates?${queryString}`, {
      method: 'GET',
      credentials: 'include',
    })

    return handleResponse<TemplatePerformanceData>(response)
  },

  /**
   * Get combined insights overview
   * Requirements: 1.1, 2.1, 3.1
   */
  async getOverview(params: InsightsOverviewParams): Promise<InsightsOverviewData> {
    const queryString = buildQueryString({
      startDate: params.startDate,
      endDate: params.endDate,
      granularity: params.granularity || 'DAY',
      phoneNumbers: params.phoneNumbers,
      wabaAccountId: params.wabaAccountId,
    })

    const response = await fetch(`${API_URL}/api/v1/insights/overview?${queryString}`, {
      method: 'GET',
      credentials: 'include',
    })

    return handleResponse<InsightsOverviewData>(response)
  },
}
