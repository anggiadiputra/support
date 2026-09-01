const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export interface InteractiveHeader {
    type: 'text' | 'image' | 'video'
    text?: string
    image?: { link?: string; id?: string }
    video?: { link?: string; id?: string }
}

export interface InteractiveReplyButton {
    type: 'reply'
    reply: {
        id: string
        title: string
    }
}

export interface InteractiveQuickReplyButton {
    type: 'quick_reply'
    quick_reply: {
        id: string
        title: string
    }
}

export interface InteractiveSection {
    title?: string
    rows: Array<{
        id: string
        title: string
        description?: string
    }>
}

export interface InteractiveCarouselCard {
    card_index: number
    type: 'cta_url'
    header: {
        type: 'image' | 'video'
        image?: { link?: string; id?: string }
        video?: { link?: string; id?: string }
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
              buttons: InteractiveQuickReplyButton[]
          }
}

export interface InteractiveMessage {
    type: 'cta_url' | 'button' | 'list' | 'carousel'
    header?: InteractiveHeader
    body?: { text: string }
    footer?: { text: string }
    action: {
        name?: 'cta_url'
        parameters?: {
            display_text: string
            url: string
        }
        buttons?: Array<InteractiveReplyButton | InteractiveQuickReplyButton>
        button?: string
        sections?: InteractiveSection[]
        cards?: InteractiveCarouselCard[]
    }
}

export interface SendMessageRequest {
    userId: string
    customerId?: string
    phoneNumber?: string
    type: 'text' | 'template' | 'image' | 'document' | 'interactive'
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
        language: { code: string }
        components?: any[]
    }
    variableValues?: Record<string, string>
    image?: {
        link?: string
        caption?: string
    }
    document?: {
        link: string
        filename?: string
        caption?: string
    }
    interactive?: InteractiveMessage
}

/**
 * Pagination info for cursor-based pagination
 */
export interface PaginationInfo {
    hasMore: boolean
    nextCursor: string | null
    limit: number
}

/**
 * Response type for GET /messages endpoint
 * Includes unreadCounts per customer for WhatsApp unread tracking
 * Requirements: 5.1
 */
export interface MessagesListResponse {
    success: boolean
    data: Message[]
    /** Unread counts per customer ID - count of INBOUND messages with status NOT READ */
    unreadCounts: Record<string, number>
    /** Assignment data per customer ID (conversationId) - supports both HUMAN and AI_AGENT types */
    assignments: Record<string, {
        assigneeId: string | null
        assigneeName: string | null
        assigneeImage: string | null
        assigneeType: 'HUMAN' | 'AI_AGENT'
        aiAgentId: string | null
        aiAgentName: string | null
        assignedAt: string
    }>
    /** Pagination info for infinite scroll */
    pagination?: PaginationInfo
}

/**
 * Message source type - indicates where the message originated from
 * - API: Sent from dashboard/inbox by human
 * - AI_BOT: Sent automatically by AI bot
 * - WHATSAPP_APP: Sent from WhatsApp Business App on phone (coexistence)
 * - INSTAGRAM: Sent from Instagram
 */
export type MessageSource = 'API' | 'AI_BOT' | 'WHATSAPP_APP' | 'INSTAGRAM'

/**
 * Message type from the API response
 */
export interface Message {
    id: string
    waMessageId?: string
    /** WhatsApp message ID (wamId) - used for reactions and replies */
    wamId?: string
    userId: string
    customerId: string
    direction: 'INBOUND' | 'OUTBOUND'
    type: string
    content: string
    status: string
    timestamp: string
    source?: MessageSource
    /** Error message when status is FAILED */
    errorMessage?: string
    /** Error code when status is FAILED */
    errorCode?: string
    customer?: {
        id: string
        phoneNumber: string
        name?: string
    }
    user?: {
        id: string
        name: string
        email: string
    }
    template?: {
        id: string
        templateName: string
        category: string
    }
    interactive?: InteractiveMessage
}

/**
 * Response type for POST /messages/read endpoint
 * Requirements: 2.1, 2.2
 */
export interface MarkAsReadResponse {
    success: boolean
    message?: string
    updatedCount?: number
    unreadCount?: number
    error?: string
}

/**
 * API Error with recovery action
 */
export interface APIError extends Error {
    code?: string
    category?: string
    retryable?: boolean
    recoveryAction?: string
}

/**
 * Create an API error with additional details
 */
function createAPIError(errorData: {
    message?: string
    code?: string
    category?: string
    retryable?: boolean
    recoveryAction?: string
}): APIError {
    const error = new Error(errorData.message || 'An error occurred') as APIError
    error.code = errorData.code
    error.category = errorData.category
    error.retryable = errorData.retryable
    error.recoveryAction = errorData.recoveryAction
    return error
}

export const messagesApi = {
    async getMessages(
        userId?: string, 
        customerId?: string,
        options?: { cursor?: string; limit?: number }
    ): Promise<MessagesListResponse> {
        const params = new URLSearchParams()
        if (userId) params.append('userId', userId)
        if (customerId) params.append('customerId', customerId)
        if (options?.cursor) params.append('cursor', options.cursor)
        if (options?.limit) params.append('limit', options.limit.toString())

        // Send cookies directly, Better Auth will handle session
        const response = await fetch(`${API_URL}/api/v1/messages?${params}`, {
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // This sends cookies automatically
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            console.error('API Error:', error)
            throw new Error(error.error?.message || 'Failed to fetch messages')
        }

        const result = await response.json()
        
        // Ensure unreadCounts, assignments, and pagination are always present (backward compatibility)
        return {
            success: result.success,
            data: result.data || [],
            unreadCounts: result.unreadCounts || {},
            assignments: result.assignments || {},
            pagination: result.pagination || { hasMore: false, nextCursor: null, limit: 200 }
        }
    },

    async sendMessage(data: SendMessageRequest) {
        // Send cookies directly, Better Auth will handle session
        const response = await fetch(`${API_URL}/api/v1/messages/send`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include', // This sends cookies automatically
            body: JSON.stringify(data),
        })

        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}))
            console.error('API Error:', errorResult)
            
            // Create rich error with recovery action
            const errorData = errorResult.error || {}
            throw createAPIError({
                message: errorData.message || 'Failed to send message',
                code: errorData.code,
                category: errorData.category,
                retryable: errorData.retryable,
                recoveryAction: errorData.recoveryAction,
            })
        }

        return response.json()
    },

    /**
     * Mark messages from a customer as read
     * Called when user opens a chat in the inbox
     * Requirements: 2.1, 2.2
     */
    async markAsRead(customerId: string): Promise<MarkAsReadResponse> {
        const response = await fetch(`${API_URL}/api/v1/messages/read`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ customerId }),
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            console.error('Mark as read error:', error)
            // Don't throw - this is a non-critical operation
            return { success: false, error: error.error?.message }
        }

        return response.json()
    },

    /**
     * Send typing indicator to customer
     * Fire-and-forget - non-critical, silent fail
     * Backend has 3s rate limit per customer
     */
    async sendTypingIndicator(customerId: string, channel?: "whatsapp" | "instagram"): Promise<void> {
        try {
            await fetch(`${API_URL}/api/v1/conversations/${customerId}/typing`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify(channel ? { channel } : {}),
            })
            // Silent success - no need to check response
        } catch {
            // Silent fail - non-critical feature
        }
    },

    /**
     * Send reaction to a WhatsApp message
     * @param messageId - Internal message ID (not wamId)
     * @param emoji - Emoji to react with, or "" to remove reaction
     */
    async sendReaction(messageId: string, emoji: string): Promise<{ success: boolean; data?: any }> {
        const response = await fetch(`${API_URL}/api/v1/messages/${messageId}/react`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'include',
            body: JSON.stringify({ emoji }),
        })

        if (!response.ok) {
            const errorResult = await response.json().catch(() => ({}))
            console.error('Reaction API Error:', errorResult)
            
            const errorData = errorResult.error || {}
            throw createAPIError({
                message: errorData.message || 'Failed to send reaction',
                code: errorData.code,
                category: errorData.category,
                retryable: errorData.retryable,
                recoveryAction: errorData.recoveryAction,
            })
        }

        return response.json()
    },
}
