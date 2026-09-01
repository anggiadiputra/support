/**
 * Facebook Messenger Types
 * Type definitions for Messenger API and webhook events
 */

// ============================================================================
// Webhook Event Types
// ============================================================================

export interface MessengerWebhookEvent {
  object: 'page'
  entry: MessengerWebhookEntry[]
}

export interface MessengerWebhookEntry {
  id: string // Page ID
  time: number
  messaging?: MessengerMessagingEvent[]
}

export interface MessengerMessagingEvent {
  sender: { id: string }    // PSID (Page-scoped User ID)
  recipient: { id: string } // Page ID
  timestamp: number
  message?: MessengerMessagePayload
  postback?: MessengerPostbackPayload
  read?: MessengerReadPayload
  delivery?: MessengerDeliveryPayload
  reaction?: MessengerReactionPayload
}

export interface MessengerMessagePayload {
  mid: string
  text?: string
  attachments?: MessengerAttachment[]
  quick_reply?: {
    payload: string
  }
  reply_to?: {
    mid: string
  }
  is_echo?: boolean
  app_id?: string
}

export interface MessengerAttachment {
  type: 'image' | 'video' | 'audio' | 'file' | 'template' | 'fallback'
  payload: {
    url?: string
    sticker_id?: number
    title?: string
  }
}

export interface MessengerPostbackPayload {
  mid?: string
  title: string
  payload: string
}

export interface MessengerReadPayload {
  watermark: number
}

export interface MessengerDeliveryPayload {
  mids?: string[]
  watermark: number
}

export interface MessengerReactionPayload {
  mid: string
  action: 'react' | 'unreact'
  reaction?: string // love, haha, wow, sad, angry, like
  emoji?: string
}

// ============================================================================
// Send API Types
// ============================================================================

export interface MessengerSendRequest {
  recipient: { id: string }
  message: MessengerSendMessage
  messaging_type: 'RESPONSE' | 'UPDATE' | 'MESSAGE_TAG'
  tag?: string
}

export interface MessengerSendMessage {
  text?: string
  attachment?: {
    type: 'image' | 'video' | 'audio' | 'file' | 'template'
    payload: {
      url?: string
      is_reusable?: boolean
      template_type?: string
      elements?: any[]
    }
  }
  quick_replies?: MessengerQuickReply[]
}

export interface MessengerQuickReply {
  content_type: 'text' | 'user_phone_number' | 'user_email'
  title?: string
  payload?: string
  image_url?: string
}

export interface MessengerSendResponse {
  recipient_id: string
  message_id: string
}

// ============================================================================
// Profile Types
// ============================================================================

export interface MessengerUserProfile {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  profile_pic?: string
}

// ============================================================================
// OAuth Types
// ============================================================================

export interface FacebookPageInfo {
  id: string
  name: string
  category?: string
  access_token: string
  picture?: {
    data: {
      url: string
    }
  }
}

export interface FacebookPagesResponse {
  data: FacebookPageInfo[]
  paging?: {
    cursors: {
      before: string
      after: string
    }
    next?: string
  }
}
