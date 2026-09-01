import axios, { AxiosInstance } from 'axios'
import https from 'https'
import { logger, extractAxiosError } from './logger.js'
import type {
  Granularity,
  ConversationCategory,
  ConversationType,
  ConversationDirection,
  MetaMessageAnalyticsResponse,
  MetaConversationAnalyticsResponse,
  MetaTemplatePerformanceResponse,
} from '../types/insights.js'
import { toConversationGranularity } from '../types/insights.js'

// Create HTTPS agent that forces IPv4 (fixes ETIMEDOUT on some servers)
const httpsAgent = new https.Agent({
  family: 4, // Force IPv4
  rejectUnauthorized: true,
})

interface WhatsAppConfig {
  accessToken: string
  apiVersion?: string
}

interface SendMessageParams {
  phoneNumberId: string
  /** Phone number (E.164 format) - prioritized if both provided */
  to?: string
  /** BSUID - used if phone number not provided (May 2026+) */
  recipient?: string
  type: 'text' | 'template' | 'image' | 'document' | 'audio' | 'video' | 'interactive'
  /** Context for reply-to-specific-message (quoted reply) */
  context?: {
    message_id: string  // wamId of the message being replied to
  }
  text?: {
    body: string
    preview_url?: boolean
  }
  template?: {
    name: string
    language: {
      code: string
    }
    components?: any[]
  }
  image?: {
    link?: string
    id?: string
    caption?: string
  }
  document?: {
    link?: string
    id?: string
    caption?: string
    filename?: string
  }
  audio?: {
    link?: string
    id?: string
  }
  video?: {
    link?: string
    id?: string
    caption?: string
  }
  interactive?: {
    type: 'cta_url' | 'button' | 'list' | 'carousel'
    header?: {
      type: 'text' | 'image' | 'video' | 'document'
      text?: string
      image?: { id?: string; link?: string }
      video?: { id?: string; link?: string }
      document?: { id?: string; link?: string }
    }
    body?: { text: string }
    footer?: { text: string }
    action: {
      // For cta_url
      name?: string
      parameters?: {
        display_text: string
        url: string
      }
      // For button (reply buttons)
      buttons?: Array<{
        type: 'reply'
        reply: {
          id: string
          title: string
        }
      }>
      // For list message
      button?: string
      sections?: Array<{
        title?: string
        rows: Array<{
          id: string
          title: string
          description?: string
        }>
      }>
      cards?: Array<{
        card_index: number
        type: 'cta_url'
        header: {
          type: 'image' | 'video'
          image?: { link: string }
          video?: { link: string }
        }
        body?: { text: string }
        action:
          | {
              name: 'cta_url'
              parameters: {
                display_text: string
                url: string
              }
            }
          | {
              buttons: Array<{
                type: 'quick_reply'
                quick_reply: {
                  id: string
                  title: string
                }
              }>
            }
      }>
    }
  }
}

interface TemplateComponent {
  type: string
  format?: string
  text?: string
  buttons?: any[]
  example?: any
}

interface CreateTemplateParams {
  wabaId: string
  name: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  language: string
  components: TemplateComponent[]
}

export class WhatsAppAPI {
  private client: AxiosInstance
  private accessToken: string
  private apiVersion: string

  constructor(config: WhatsAppConfig) {
    this.accessToken = config.accessToken
    this.apiVersion = config.apiVersion || 'v24.0'
    this.client = this.createClient()
  }

  // Create axios client with fresh token
  private createClient() {
    return axios.create({
      baseURL: `https://graph.facebook.com/${this.apiVersion}`,
      headers: {
        'Content-Type': 'application/json'
      },
      params: {
        access_token: this.getAccessToken() // Use query param instead of header
      },
      timeout: 60000, // Increased to 60s for slow connections
      httpsAgent, // Force IPv4 to avoid ETIMEDOUT on IPv6
    })
  }

  // Get access token - must be provided in constructor (per-account token)
  private getAccessToken(): string {
    return this.accessToken
  }

  /**
   * @deprecated No longer needed - each WhatsAppAPI instance uses per-account token
   */
  async refreshSettingsFromDb(): Promise<void> {
    // No-op: per-account tokens are provided in constructor
    logger.debug('refreshSettingsFromDb is deprecated - using per-account token')
  }

  /**
   * @deprecated No longer needed - each WhatsAppAPI instance uses per-account token
   */
  invalidateCache(): void {
    // No-op: per-account tokens don't use global cache
    logger.debug('invalidateCache is deprecated - using per-account token')
  }

  // Refresh client (no longer refreshes token, just recreates axios instance)
  private refreshClient() {
    this.client = this.createClient()
  }

  // Send message
  async sendMessage(params: SendMessageParams) {
    // Refresh client to get latest token from .env
    this.refreshClient()
    
    const { phoneNumberId, to, recipient, type, context, ...messageData } = params

    // Validate: must have either phone number or BSUID
    if (!to && !recipient) {
      throw new Error('Either "to" (phone number) or "recipient" (BSUID) is required')
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      type
    }

    // Add recipient identifiers (phone takes priority per Meta docs)
    if (to) {
      payload.to = to
    }
    if (recipient) {
      payload.recipient = recipient
    }

    // Add context for reply-to-specific-message (quoted reply)
    if (context?.message_id) {
      payload.context = {
        message_id: context.message_id
      }
    }

    if (type === 'text' && messageData.text) {
      payload.text = messageData.text
    } else if (type === 'template' && messageData.template) {
      payload.template = messageData.template
    } else if (type === 'image' && messageData.image) {
      payload.image = messageData.image
    } else if (type === 'document' && messageData.document) {
      payload.document = messageData.document
    } else if (type === 'audio' && messageData.audio) {
      payload.audio = messageData.audio
    } else if (type === 'video' && messageData.video) {
      payload.video = messageData.video
    } else if (type === 'interactive' && messageData.interactive) {
      payload.interactive = messageData.interactive
    }

    const response = await this.client.post(`/${phoneNumberId}/messages`, payload)
    
    // Log BSUID in response for monitoring
    const contacts = response.data?.contacts
    if (contacts?.[0]?.user_id) {
      logger.info('Message sent with BSUID in response', {
        input: contacts[0].input,
        wa_id: contacts[0].wa_id,
        user_id: contacts[0].user_id,
      })
    }
    
    return response.data
  }

  // Send reaction to a message
  async sendReaction(params: {
    phoneNumberId: string
    to?: string
    recipient?: string
    messageId: string  // wamId of message to react to
    emoji: string      // emoji or "" to unreact
  }) {
    this.refreshClient()

    const { phoneNumberId, to, recipient, messageId, emoji } = params

    // Validate: must have either phone number or BSUID
    if (!to && !recipient) {
      throw new Error('Either "to" (phone number) or "recipient" (BSUID) is required')
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      type: 'reaction',
      reaction: {
        message_id: messageId,
        emoji: emoji
      }
    }

    // Add recipient identifiers (phone takes priority per Meta docs)
    if (to) {
      payload.to = to
    }
    if (recipient) {
      payload.recipient = recipient
    }

    const response = await this.client.post(`/${phoneNumberId}/messages`, payload)
    return response.data
  }

  // Mark message as read (and optionally show typing indicator)
  async markAsRead(phoneNumberId: string, messageId: string, showTyping: boolean = false) {
    const payload: any = {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    }

    // Add typing indicator if requested (Based on Meta documentation v24.0+)
    if (showTyping) {
      payload.typing_indicator = {
        type: 'text'
      }
    }

    const response = await this.client.post(`/${phoneNumberId}/messages`, payload)
    return response.data
  }

  // Get WhatsApp Business Profile for a phone number
  async getBusinessProfile(phoneNumberId: string) {
    this.refreshClient()
    const response = await this.client.get(`/${phoneNumberId}/whatsapp_business_profile`, {
      params: {
        fields: 'about,address,description,email,profile_picture_url,websites,vertical'
      }
    })
    // Meta returns { data: [{ ...profile }] }
    const data = response.data?.data?.[0] || {}
    return {
      about: data.about || null,
      address: data.address || null,
      description: data.description || null,
      email: data.email || null,
      profilePictureUrl: data.profile_picture_url || null,
      websites: data.websites || [],
      vertical: data.vertical || null,
    }
  }

  // Get business phone number info
  async getPhoneNumber(phoneNumberId: string) {
    const response = await this.client.get(`/${phoneNumberId}`, {
      params: {
        fields: 'id,verified_name,display_phone_number,quality_rating,code_verification_status,messaging_limit_tier'
      }
    })
    return response.data
  }

  // Get WABA info
  async getWABA(wabaId: string) {
    const response = await this.client.get(`/${wabaId}`, {
      params: {
        fields: 'id,name,timezone_id,message_template_namespace,on_behalf_of_business_info,account_review_status'
      }
    })
    return response.data
  }

  // Register phone number
  async registerPhoneNumber(phoneNumberId: string, pin: string) {
    const response = await this.client.post(`/${phoneNumberId}/register`, {
      messaging_product: 'whatsapp',
      pin
    })
    return response.data
  }

  // Get WABA details
  async getWABADetails(wabaId: string) {
    const response = await this.client.get(`/${wabaId}`, {
      params: {
        fields: 'id,name,message_template_namespace,timezone_id,currency,account_review_status'
      }
    })
    return response.data
  }

  // Create message template
  async createTemplate(params: CreateTemplateParams) {
    const { wabaId, name, category, language, components } = params

    const payload: any = {
      name,
      category,
      language,
      components
    }

    // For MARKETING category, need to set allow_category_change
    if (category === 'MARKETING') {
      payload.allow_category_change = true
    }

    // Removed sensitive logging (template payloads may contain business data)
    // console.log('Creating template with payload:', JSON.stringify(payload, null, 2))
    // console.log('Using Phone/WABA ID:', wabaId)
    // console.log('Full URL:', `https://graph.facebook.com/v23.0/${wabaId}/message_templates`)

    const response = await this.client.post(`/${wabaId}/message_templates`, payload)
    return response.data
  }

  // Get template status
  async getTemplate(wabaId: string, templateName: string) {
    const response = await this.client.get(`/${wabaId}/message_templates`, {
      params: {
        name: templateName
      }
    })
    return response.data
  }

  // List all templates from WABA
  async listTemplates(wabaId: string, limit: number = 10) {
    const response = await this.client.get(`/${wabaId}/message_templates`, {
      params: {
        limit,
        fields: 'id,name,status,category'
      }
    })
    return response.data
  }

  // Delete template
  async deleteTemplate(wabaId: string, templateName: string) {
    const response = await this.client.delete(`/${wabaId}/message_templates`, {
      params: {
        name: templateName
      }
    })
    return response.data
  }

  // Get template analytics
  async getTemplateAnalytics(wabaId: string, templateName: string) {
    const response = await this.client.get(`/${wabaId}/template_analytics`, {
      params: {
        name: templateName
      }
    })
    return response.data
  }

  // Get phone number quality rating
  async getQualityRating(phoneNumberId: string) {
    const response = await this.client.get(`/${phoneNumberId}`, {
      params: {
        fields: 'quality_rating,messaging_limit_tier'
      }
    })
    return response.data
  }

  // Upload media to WhatsApp Cloud API
  // Note: Media upload should use WABA ID or phone number ID depending on API version
  // For v23.0+, use phone number ID
  async uploadMedia(phoneNumberId: string, file: Buffer | Blob, mimeType: string, filename?: string) {
    try {
      // Refresh token before upload
      this.refreshClient()

      const formData = new FormData()
      formData.append('messaging_product', 'whatsapp')

      // Create a proper File-like blob with filename
      // Create a proper File-like blob with filename
      const blob = file instanceof Buffer ? new Blob([file as any], { type: mimeType }) : (file as any)
      formData.append('file', blob, filename || 'file')
      formData.append('file', blob, filename || 'file')

      const response = await this.client.post(`/${phoneNumberId}/media`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        },
        // Override default timeout for large files
        timeout: 60000 // 60 seconds
      })
      return response.data
    } catch (error: any) {
      console.error('Meta API Error Response:', error.response?.data)
      throw error
    }
  }

  // Get media URL
  async getMediaUrl(mediaId: string) {
    const response = await this.client.get(`/${mediaId}`)
    return response.data
  }

  // Download media
  async downloadMedia(mediaUrl: string) {
    const response = await axios.get(mediaUrl, {
      headers: {
        'Authorization': `Bearer ${this.accessToken}`
      },
      responseType: 'arraybuffer'
    })
    return response.data
  }

  /**
   * Get message analytics from Meta Graph API
   * Endpoint: /{waba_id}?fields=analytics.start(X).end(Y).granularity(Z).phone_numbers([...])
   * Requirements: 1.1, 1.2, 1.5
   */
  async getAnalytics(
    wabaId: string,
    params: {
      startDate: number;
      endDate: number;
      granularity: Granularity;
      phoneNumbers?: string[];
    }
  ): Promise<MetaMessageAnalyticsResponse> {
    this.refreshClient()

    // Build the analytics field parameter
    let analyticsField = `analytics.start(${params.startDate}).end(${params.endDate}).granularity(${params.granularity})`
    
    if (params.phoneNumbers && params.phoneNumbers.length > 0) {
      const phoneNumbersParam = params.phoneNumbers.map(p => `"${p}"`).join(',')
      analyticsField += `.phone_numbers([${phoneNumbersParam}])`
    }

    const response = await this.client.get(`/${wabaId}`, {
      params: {
        fields: analyticsField,
      },
    })

    return response.data
  }

  /**
   * Get conversation analytics from Meta Graph API
   * Endpoint: /{waba_id}?fields=conversation_analytics.start(X).end(Y).granularity(Z)...
   * 
   * Per Meta docs (analitik.md):
   * - analytics uses: HALF_HOUR, DAY, MONTH
   * - conversation_analytics uses: HALF_HOUR, DAILY, MONTHLY
   * - dimensions: CONVERSATION_CATEGORY, CONVERSATION_DIRECTION, CONVERSATION_TYPE, COUNTRY, PHONE
   * - If no dimensions specified, returns aggregated data without breakdown
   */
  async getConversationAnalytics(
    wabaId: string,
    params: {
      startDate: number;
      endDate: number;
      granularity: Granularity;
      phoneNumbers?: string[];
      conversationCategories?: ConversationCategory[];
      conversationTypes?: ConversationType[];
      conversationDirections?: ConversationDirection[];
    }
  ): Promise<MetaConversationAnalyticsResponse> {
    this.refreshClient()

    // Convert granularity for conversation_analytics endpoint
    // analytics uses: HALF_HOUR, DAY, MONTH
    // conversation_analytics uses: HALF_HOUR, DAILY, MONTHLY
    const conversationGranularity = toConversationGranularity(params.granularity)

    // Build the conversation_analytics field parameter
    // Per docs: .dimensions(["CONVERSATION_CATEGORY"]) format with quotes inside array
    let analyticsField = `conversation_analytics.start(${params.startDate}).end(${params.endDate}).granularity(${conversationGranularity}).dimensions(["CONVERSATION_CATEGORY"])`
    
    if (params.phoneNumbers && params.phoneNumbers.length > 0) {
      const phoneNumbersParam = params.phoneNumbers.map(p => `"${p}"`).join(',')
      analyticsField += `.phone_numbers([${phoneNumbersParam}])`
    }

    if (params.conversationCategories && params.conversationCategories.length > 0) {
      const categoriesParam = params.conversationCategories.map(c => `"${c}"`).join(',')
      analyticsField += `.conversation_categories([${categoriesParam}])`
    }

    if (params.conversationTypes && params.conversationTypes.length > 0) {
      const typesParam = params.conversationTypes.map(t => `"${t}"`).join(',')
      analyticsField += `.conversation_types([${typesParam}])`
    }

    if (params.conversationDirections && params.conversationDirections.length > 0) {
      const directionsParam = params.conversationDirections.map(d => `"${d}"`).join(',')
      analyticsField += `.conversation_directions([${directionsParam}])`
    }

    const response = await this.client.get(`/${wabaId}`, {
      params: {
        fields: analyticsField,
      },
    })

    return response.data
  }

  /**
   * Enable template analytics for WABA
   * Must be called before fetching template analytics
   * POST /{WABA_ID}?is_enabled_for_insights=true
   */
  async enableTemplateInsights(wabaId: string): Promise<{ id: string }> {
    this.refreshClient()
    
    const response = await this.client.post(`/${wabaId}`, null, {
      params: {
        is_enabled_for_insights: true,
      },
    })
    
    return response.data
  }

  /**
   * Get template performance metrics from Meta Graph API
   * Endpoint: /{waba_id}/template_analytics?start=X&end=Y&granularity=DAILY&template_ids=[...]
   * 
   * Per Meta docs (analitik.md):
   * - template_ids is REQUIRED (max 10) - format: [id1,id2,id3] without quotes
   * - granularity must be DAILY (lowercase in query param)
   * - metric_types: COST, CLICKED, DELIVERED, READ, SENT
   * - COST may not be available for partner-billed businesses
   * - This endpoint may not be available in EU/Japan regions
   * 
   * IMPORTANT: Template analytics must be enabled first via enableTemplateInsights()
   */
  async getTemplatePerformanceMetrics(
    wabaId: string,
    params: {
      startDate: number;
      endDate: number;
      templateIds?: string[];
    }
  ): Promise<MetaTemplatePerformanceResponse> {
    this.refreshClient()

    // template_ids is required by Meta API
    if (!params.templateIds || params.templateIds.length === 0) {
      return { data: [] }
    }

    // Limit to max 10 template IDs as per Meta API docs
    const limitedTemplateIds = params.templateIds.slice(0, 10)

    // Build the full URL manually exactly like the curl example in docs:
    // curl -g 'https://graph.facebook.com/v24.0/109259195336416/template_analytics?start=1718064000&end=1718122745&granularity=daily&template_ids=[1421988012088524,2632273056924580]'
    const templateIdsStr = limitedTemplateIds.join(',')
    const fullUrl = `https://graph.facebook.com/${this.apiVersion}/${wabaId}/template_analytics?start=${params.startDate}&end=${params.endDate}&granularity=daily&template_ids=[${templateIdsStr}]&access_token=${this.accessToken}`
    
    logger.debug('Template Analytics Request', {
      wabaId,
      templateIds: limitedTemplateIds,
      start: params.startDate,
      end: params.endDate,
      url: fullUrl.replace(this.accessToken, '***'),
    })

    try {
      // Use axios directly with the full URL to avoid any encoding issues
      const response = await axios.get(fullUrl, {
        httpsAgent,
        timeout: 60000,
      })

      logger.debug('Template Analytics Response', { data: response.data })

      return response.data
    } catch (error) {
      logger.error('Template Analytics Error', { error: extractAxiosError(error) })
      throw error
    }
  }

  // Verify webhook
  static verifyWebhook(mode: string, token: string, challenge: string, verifyToken: string) {
    if (mode === 'subscribe' && token === verifyToken) {
      return challenge
    }
    return null
  }
}

/**
 * @deprecated Use createWhatsAppApiForAccount() from whatsapp-account-helper.ts instead
 * This function is removed to enforce per-account token usage per Meta policy.
 * 
 * Migration: 
 * 1. Get credentials via resolveCredentialsForSending() or resolveCredentialsByPhoneNumber()
 * 2. Create client: new WhatsAppAPI({ accessToken: credentials.accessToken })
 */
export function getWhatsAppClient(): never {
  throw new Error(
    'getWhatsAppClient() is deprecated. Use new WhatsAppAPI({ accessToken }) with per-account credentials from resolveCredentialsForSending().'
  )
}

/**
 * @deprecated Use createWhatsAppApiForAccount() from whatsapp-account-helper.ts instead
 * This function is removed to enforce per-account token usage per Meta policy.
 * 
 * Migration:
 * 1. Get credentials via resolveCredentialsForSending() or resolveCredentialsByPhoneNumber()
 * 2. Create client: new WhatsAppAPI({ accessToken: credentials.accessToken })
 */
export async function getWhatsAppClientAsync(): Promise<never> {
  throw new Error(
    'getWhatsAppClientAsync() is deprecated. Use new WhatsAppAPI({ accessToken }) with per-account credentials from resolveCredentialsForSending().'
  )
}

/**
 * @deprecated No longer needed - singleton pattern removed for per-account tokens
 */
export function invalidateWhatsAppClientCache(): void {
  logger.debug('invalidateWhatsAppClientCache is deprecated - using per-account tokens')
}

/**
 * @deprecated No longer needed - singleton pattern removed for per-account tokens
 */
export async function initWhatsAppClient(): Promise<void> {
  logger.debug('initWhatsAppClient is deprecated - using per-account tokens')
}

/**
 * Convert standard markdown to WhatsApp-compatible markdown format
 * WhatsApp uses different formatting:
 * - Bold: *text* (instead of **text**)
 * - Italic: _text_ (instead of *text* or _text_)
 * - Strikethrough: ~text~ (instead of ~~text~~)
 * - Monospace: ```text``` (same as standard)
 */
export function convertToWhatsAppMarkdown(text: string): string {
  if (!text) return text

  let result = text

  // Convert **bold** to *bold* (WhatsApp format)
  result = result.replace(/\*\*([^*]+)\*\*/g, '*$1*')

  // Convert ~~strikethrough~~ to ~strikethrough~ (WhatsApp format)
  result = result.replace(/~~([^~]+)~~/g, '~$1~')

  // Convert markdown links [text](url) to "text: url" format (WhatsApp doesn't support links)
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1: $2')

  // Convert headers (# Header) to *Header* (bold)
  result = result.replace(/^#{1,6}\s+(.+)$/gm, '*$1*')

  // Convert bullet points (- item or * item) to • item
  result = result.replace(/^[\-\*]\s+/gm, '• ')

  // Convert numbered lists to keep them as is but ensure proper formatting
  result = result.replace(/^(\d+)\.\s+/gm, '$1. ')

  return result
}

export default WhatsAppAPI
