/**
 * Facebook Messenger API Client
 * Handles all Messenger integration API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export interface FacebookPage {
  id: string
  pageId: string
  pageName: string
  pageCategory: string | null
  profilePicUrl: string | null
  connectionStatus: "connected" | "disconnected" | "requires_reauth"
  connectedAt: string
  lastSyncAt: string | null
  webhookSubscribed: boolean
  conversationCount?: number
}

export interface MessengerConversation {
  id: string
  participantPsid: string
  participantName: string | null
  participantEmail: string | null
  participantProfilePic: string | null
  lastInboundAt: string | null
  windowExpiresAt: string | null
  isWindowActive: boolean
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  facebookPageId: string
  customerId: string | null
  page?: {
    id: string
    pageName: string
    profilePicUrl: string | null
  }
  // Assignment fields
  assigneeId?: string | null
  assigneeName?: string | null
  assigneeImage?: string | null
  assigneeType?: 'HUMAN' | 'AI_AGENT'
  aiAgentId?: string | null
  aiAgentName?: string | null
  assignedAt?: string | null
}

export interface MessengerMessage {
  id: string
  mid: string | null
  direction: "INBOUND" | "OUTBOUND"
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "FILE" | "STICKER" | "TEMPLATE" | "QUICK_REPLY" | "REACTION"
  text: string | null
  mediaUrl: string | null
  mediaType: string | null
  fileName: string | null
  stickerUrl: string | null
  quickReplyPayload: string | null
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
  errorCode: string | null
  errorMessage: string | null
  reaction: string | null
  readAt: string | null
  deliveredAt: string | null
  timestamp: string
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    hasMore: boolean
    nextCursor: string | null
  }
}

/**
 * Meta/Facebook API Error structure
 */
export interface MetaApiError {
  code: number
  message: string
  type: string
  subcode?: number
  fbtrace_id?: string
}

/**
 * Messenger API Error with detailed information
 */
export class MessengerApiError extends Error {
  code: string
  userMessage: string
  isRetryable: boolean
  metaError?: MetaApiError
  statusCode: number

  constructor(
    code: string,
    message: string,
    userMessage: string,
    statusCode: number,
    isRetryable: boolean = false,
    metaError?: MetaApiError
  ) {
    super(message)
    this.name = 'MessengerApiError'
    this.code = code
    this.userMessage = userMessage
    this.isRetryable = isRetryable
    this.metaError = metaError
    this.statusCode = statusCode
  }

  /**
   * Get user-friendly error message based on Meta error codes
   */
  getUserFriendlyMessage(): string {
    // Handle specific Meta error codes
    if (this.metaError) {
      const { code, subcode } = this.metaError

      // Rate limiting
      if (code === 4 || code === 17 || code === 32 || code === 613) {
        return "Terlalu banyak permintaan. Silakan tunggu beberapa menit dan coba lagi."
      }

      // Permission errors
      if (code === 10 || code === 200 || code === 230 || code === 190) {
        return "Akses ditolak. Silakan hubungkan ulang akun Facebook Anda."
      }

      // 24-hour window closed
      if (code === 10 || subcode === 2018278) {
        return "Jendela pesan 24 jam telah berakhir. Tunggu pengguna mengirim pesan baru."
      }

      // User blocked the page
      if (subcode === 2018001) {
        return "Pengguna telah memblokir halaman Anda atau membatasi pesan."
      }

      // Message failed to send
      if (code === 100) {
        if (subcode === 2018109) {
          return "Pengguna tidak dapat menerima pesan saat ini."
        }
        return "Pesan gagal dikirim. Parameter tidak valid."
      }

      // Page not published
      if (code === 210) {
        return "Halaman Facebook belum dipublikasikan."
      }

      // Session expired
      if (code === 102 || code === 190) {
        return "Sesi telah berakhir. Silakan hubungkan ulang akun Facebook Anda."
      }
    }

    // Handle our custom error codes
    switch (this.code) {
      case 'MESSENGER_WINDOW_CLOSED':
        return "Jendela pesan 24 jam telah berakhir. Tunggu pengguna mengirim pesan baru."
      case 'MESSENGER_RATE_LIMITED':
        return "Terlalu banyak permintaan. Silakan tunggu beberapa menit."
      case 'MESSENGER_INVALID_TOKEN':
        return "Token tidak valid. Silakan hubungkan ulang akun Facebook."
      case 'MESSENGER_PAGE_NOT_FOUND':
        return "Halaman Facebook tidak ditemukan."
      case 'WindowClosed':
        return "Jendela pesan 24 jam telah berakhir. Tunggu pengguna mengirim pesan baru."
      default:
        return this.userMessage || this.message || "Terjadi kesalahan. Silakan coba lagi."
    }
  }
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: "Request failed" }))
    
    // Parse structured error from backend
    const error = errorData.error || errorData
    const code = error.code || 'UNKNOWN_ERROR'
    const message = error.message || "Request failed"
    const userMessage = error.userMessage || message
    const isRetryable = error.isRetryable || false
    const metaError = error.metaError

    throw new MessengerApiError(
      code,
      message,
      userMessage,
      response.status,
      isRetryable,
      metaError
    )
  }

  return response.json()
}

export const messengerApi = {
  // Connection
  async getAuthUrl(): Promise<{ url: string }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/messenger/auth/url`)
    return { url: response.data?.authUrl || response.authUrl }
  },

  async getConnectionStatus(): Promise<{ connected: boolean; pageCount: number }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/messenger/connection/status`)
    return response.data || response
  },

  async getPages(): Promise<FacebookPage[]> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/messenger/connection/pages`)
    return response.data || []
  },

  async disconnectPage(pageId: string): Promise<void> {
    await fetchWithAuth(`${API_URL}/api/v1/messenger/connection/pages/${pageId}`, {
      method: "DELETE",
    })
  },

  // Conversations
  async getConversations(params?: { pageId?: string; limit?: number; cursor?: string }): Promise<PaginatedResponse<MessengerConversation>> {
    const searchParams = new URLSearchParams()
    if (params?.pageId) searchParams.set("pageId", params.pageId)
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.cursor) searchParams.set("cursor", params.cursor)
    
    const url = `${API_URL}/api/v1/messenger/conversations${searchParams.toString() ? `?${searchParams}` : ""}`
    const response = await fetchWithAuth(url)
    return response
  },

  async getConversation(id: string, params?: { limit?: number; cursor?: string }): Promise<{
    conversation: MessengerConversation
    messages: MessengerMessage[]
    pagination: { hasMore: boolean; nextCursor: string | null }
  }> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.cursor) searchParams.set("cursor", params.cursor)
    
    const url = `${API_URL}/api/v1/messenger/conversations/${id}${searchParams.toString() ? `?${searchParams}` : ""}`
    const response = await fetchWithAuth(url)
    return response.data || response
  },

  async markAsRead(conversationId: string): Promise<void> {
    await fetchWithAuth(`${API_URL}/api/v1/messenger/conversations/${conversationId}/read`, {
      method: "POST",
    })
  },

  // Messages
  async sendMessage(conversationId: string, data: {
    type: "text" | "image" | "video" | "audio" | "file"
    text?: string
    mediaUrl?: string
  }): Promise<{ id: string; mid: string; status: string }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/messenger/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    })
    return response.data || response
  },

  async sendTypingIndicator(conversationId: string): Promise<void> {
    await fetchWithAuth(`${API_URL}/api/v1/messenger/conversations/${conversationId}/typing`, {
      method: "POST",
    })
  },

  // Reactions
  async sendReaction(messageId: string, reaction: "love" | "haha" | "wow" | "sad" | "angry" | "like" | "dislike"): Promise<{ success: boolean }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/messenger/messages/${messageId}/reaction`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    })
    return response
  },

  async removeReaction(messageId: string): Promise<{ success: boolean }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/messenger/messages/${messageId}/reaction`, {
      method: "DELETE",
    })
    return response
  },

  // Media Upload
  async uploadMedia(file: File): Promise<{ url: string; mimeType: string; filename: string; size: number }> {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("target", "messenger")

    const response = await fetch(`${API_URL}/api/v1/media/upload`, {
      method: "POST",
      credentials: "include",
      body: formData,
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Upload failed" }))
      throw new Error(error.message || error.error?.message || "Upload failed")
    }

    const result = await response.json()
    return result.data || result
  },
}
