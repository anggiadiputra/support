/**
 * Instagram API Client
 * Handles all Instagram DM integration API calls
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export interface InstagramAccount {
  id: string
  igId: string
  igUserId: string
  username: string
  profilePicUrl: string | null
  connectionStatus: "connected" | "disconnected" | "requires_reauth"
  connectedAt: string
  tokenExpiresAt: string
  lastSyncAt: string | null
}

export interface IGConversation {
  id: string
  participantIgsid: string
  participantUsername: string | null
  participantName: string | null
  participantProfilePic: string | null
  followerCount: number | null
  isFollower: boolean
  isFollowing: boolean
  lastInboundAt: string | null
  windowExpiresAt: string | null
  isWindowActive: boolean
  unreadCount: number
  lastMessageAt: string | null
  lastMessagePreview: string | null
  folder: "primary" | "requests" | "general"
  customerId: string | null
  // Multi-account fields
  instagramAccountId?: string | null
  instagramAccount?: {
    id: string
    username: string
  } | null
}

export interface IGMessage {
  id: string
  igMessageId: string | null
  direction: "INBOUND" | "OUTBOUND"
  messageType: "TEXT" | "IMAGE" | "VIDEO" | "AUDIO" | "STICKER" | "STORY_REPLY" | "STORY_MENTION" | "MEDIA_SHARE" | "REACTION"
  text: string | null
  mediaUrl: string | null
  mediaType: string | null
  storyId: string | null
  sharedPostUrl: string | null
  status: "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED"
  errorMessage: string | null
  reaction: string | null
  timestamp: string
  readAt: string | null
}

export interface TokenStatus {
  expiresAt: string
  daysUntilExpiry: number
  status: "valid" | "healthy" | "expiring_soon" | "expired" | "requires_reauth"
  lastRefreshed: string | null
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
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
    const errorMessage = errorData.message || 
      (typeof errorData.error === 'string' ? errorData.error : errorData.error?.message) || 
      "Request failed"
    throw new Error(errorMessage)
  }

  return response.json()
}

export const instagramApi = {
  // Connection
  async getAuthUrl(): Promise<{ url: string }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/auth/url`)
    return { url: response.data?.authUrl || response.authUrl }
  },

  async getConnectionStatus(): Promise<{ connected: boolean; account: InstagramAccount | null; accounts: InstagramAccount[] }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/connection/status`)
    const data = response.data || response
    
    // Map accounts array from backend response
    const accounts: InstagramAccount[] = (data.accounts || []).map((acc: any) => ({
      id: acc.id,
      igId: acc.igId,
      igUserId: acc.igUserId || acc.igId,
      username: acc.username,
      profilePicUrl: acc.profilePicUrl,
      connectionStatus: acc.connectionStatus,
      connectedAt: acc.connectedAt,
      tokenExpiresAt: acc.tokenExpiresAt,
      lastSyncAt: acc.lastSyncAt,
    }))
    
    // For backward compatibility, also return primary account
    const primaryAccount = data.connected ? {
      id: data.id,
      igId: data.igId,
      igUserId: data.igUserId || data.igId,
      username: data.username,
      profilePicUrl: data.profilePicUrl,
      connectionStatus: data.connectionStatus,
      connectedAt: data.connectedAt,
      tokenExpiresAt: data.tokenExpiresAt,
      lastSyncAt: data.lastSyncAt,
    } : null
    
    return { 
      connected: data.connected || false, 
      account: primaryAccount,
      accounts: accounts.length > 0 ? accounts : (primaryAccount ? [primaryAccount] : [])
    }
  },

  async disconnect(mode: "soft" | "hard" = "soft", accountId?: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/connection`, {
      method: "DELETE",
      body: JSON.stringify({ mode, accountId }),
    })
  },

  // Webhook Subscriptions
  async enableWebhookSubscriptions(): Promise<{ success: boolean; webhookSubscriptionEnabled: boolean; message: string }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/connection/webhooks/subscribe`, {
      method: "POST",
    })
    return response.data || response
  },

  async getWebhookStatus(): Promise<{ 
    igId: string
    username: string
    subscribedFields: string[]
    isMessagesSubscribed: boolean 
  }> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/connection/webhooks/status`)
    return response.data || response
  },

  // Token Management
  async getTokenStatus(): Promise<TokenStatus> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/tokens/status`)
    const data = response.data || response
    // Map backend response to frontend TokenStatus format
    return {
      expiresAt: data.tokenExpiresAt || data.expiresAt,
      daysUntilExpiry: data.daysUntilExpiry || 0,
      status: data.tokenStatus || data.status || "healthy",
      lastRefreshed: data.tokenLastRefresh || data.lastRefreshed || null,
    }
  },

  async refreshToken(): Promise<{ success: boolean; expiresAt: string }> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/tokens/refresh`, {
      method: "POST",
    })
  },

  // Conversations
  async getConversations(params?: {
    page?: number
    limit?: number
    folder?: string
  }): Promise<PaginatedResponse<IGConversation>> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", params.page.toString())
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    if (params?.folder) searchParams.set("folder", params.folder)
    
    const query = searchParams.toString()
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/conversations${query ? `?${query}` : ""}`)
    
    // Handle different response formats
    return {
      data: response.data?.conversations || response.data || response.conversations || [],
      pagination: response.data?.pagination || response.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 1
      }
    }
  },

  async getConversation(conversationId: string): Promise<IGConversation> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/conversations/${conversationId}`)
  },

  async searchConversations(query: string): Promise<IGConversation[]> {
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/conversations/search?q=${encodeURIComponent(query)}`)
    return response.data?.conversations || response.data || response.conversations || []
  },

  // Messages
  async getMessages(conversationId: string, params?: {
    page?: number
    limit?: number
  }): Promise<PaginatedResponse<IGMessage>> {
    const searchParams = new URLSearchParams()
    if (params?.page) searchParams.set("page", params.page.toString())
    if (params?.limit) searchParams.set("limit", params.limit.toString())
    
    const query = searchParams.toString()
    const response = await fetchWithAuth(`${API_URL}/api/v1/ig/conversations/${conversationId}/messages${query ? `?${query}` : ""}`)
    
    // Handle different response formats - backend returns { success, data: { messages, pagination } }
    return {
      data: response.data?.messages || response.messages || response.data || [],
      pagination: response.data?.pagination || response.pagination || {
        page: 1,
        limit: 50,
        total: 0,
        totalPages: 1
      }
    }
  },

  async sendMessage(conversationId: string, data: {
    type: "text" | "image" | "video" | "audio" | "sticker"
    text?: string
    mediaUrl?: string
  }): Promise<IGMessage> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/conversations/${conversationId}/messages`, {
      method: "POST",
      body: JSON.stringify(data),
    })
  },

  async sendReaction(messageId: string, reaction: "love"): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/messages/${messageId}/react`, {
      method: "POST",
      body: JSON.stringify({ reaction }),
    })
  },

  async markAsRead(conversationId: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/conversations/${conversationId}/read`, {
      method: "POST",
    })
  },

  // Customer Linking
  async linkCustomer(conversationId: string, customerId: string): Promise<{ success: boolean }> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/conversations/${conversationId}/link-customer`, {
      method: "POST",
      body: JSON.stringify({ customerId }),
    })
  },

  async getSuggestedCustomers(conversationId: string): Promise<{ customers: any[] }> {
    return fetchWithAuth(`${API_URL}/api/v1/ig/conversations/${conversationId}/suggested-customers`)
  },

  // Media Upload
  async uploadMedia(file: File): Promise<{ url: string; mimeType: string; filename: string; size: number }> {
    const formData = new FormData()
    formData.append("file", file)
    formData.append("target", "instagram")

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
