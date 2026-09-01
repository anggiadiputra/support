/**
 * Facebook Messenger Messaging Service
 * Handles sending messages, typing indicators, and user profile fetching
 */

import axios, { AxiosInstance } from 'axios'
import { MessengerError, MessengerErrorCode } from './errors.js'
import { logger, extractAxiosError } from '../../utils/logger.js'
import type {
  MessengerSendRequest,
  MessengerSendResponse,
  MessengerUserProfile,
  MessengerQuickReply,
} from './types.js'

const GRAPH_API_URL = 'https://graph.facebook.com/v24.0'

// ============================================================================
// Send Messages
// ============================================================================

/**
 * Send a text message
 */
export async function sendTextMessage(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  recipientPsid: string,
  text: string,
  quickReplies?: MessengerQuickReply[]
): Promise<MessengerSendResponse> {
  const payload: MessengerSendRequest = {
    recipient: { id: recipientPsid },
    message: {
      text,
      quick_replies: quickReplies,
    },
    messaging_type: 'RESPONSE',
  }

  return sendMessage(client, pageId, pageAccessToken, payload)
}

/**
 * Send an attachment (image, video, audio, file)
 */
export async function sendAttachment(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  recipientPsid: string,
  type: 'image' | 'video' | 'audio' | 'file',
  url: string
): Promise<MessengerSendResponse> {
  const payload: MessengerSendRequest = {
    recipient: { id: recipientPsid },
    message: {
      attachment: {
        type,
        payload: {
          url,
          is_reusable: true,
        },
      },
    },
    messaging_type: 'RESPONSE',
  }

  return sendMessage(client, pageId, pageAccessToken, payload)
}

/**
 * Send a reaction to a message
 * Facebook Messenger supports: love, haha, wow, sad, angry, like, dislike
 */
export async function sendReaction(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  recipientPsid: string,
  messageId: string,
  reaction: 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'like' | 'dislike'
): Promise<MessengerSendResponse> {
  try {
    const response = await client.post<MessengerSendResponse>(
      `${GRAPH_API_URL}/${pageId}/messages`,
      {
        recipient: { id: recipientPsid },
        sender_action: 'react',
        payload: {
          message_id: messageId,
          reaction,
        },
      },
      {
        params: { access_token: pageAccessToken },
      }
    )

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error

      throw new MessengerError(
        MessengerErrorCode.MESSAGE_SEND_FAILED,
        `Failed to send reaction: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Failed to send reaction',
        metaError
      )
    }

    throw new MessengerError(
      MessengerErrorCode.MESSAGE_SEND_FAILED,
      `Failed to send reaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    )
  }
}

/**
 * Remove a reaction from a message
 */
export async function removeReaction(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  recipientPsid: string,
  messageId: string
): Promise<MessengerSendResponse> {
  try {
    const response = await client.post<MessengerSendResponse>(
      `${GRAPH_API_URL}/${pageId}/messages`,
      {
        recipient: { id: recipientPsid },
        sender_action: 'unreact',
        payload: {
          message_id: messageId,
        },
      },
      {
        params: { access_token: pageAccessToken },
      }
    )

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error

      throw new MessengerError(
        MessengerErrorCode.MESSAGE_SEND_FAILED,
        `Failed to remove reaction: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Failed to remove reaction',
        metaError
      )
    }

    throw new MessengerError(
      MessengerErrorCode.MESSAGE_SEND_FAILED,
      `Failed to remove reaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    )
  }
}

/**
 * Core send message function
 */
async function sendMessage(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  payload: MessengerSendRequest
): Promise<MessengerSendResponse> {
  try {
    const response = await client.post<MessengerSendResponse>(
      `${GRAPH_API_URL}/${pageId}/messages`,
      payload,
      {
        params: { access_token: pageAccessToken },
      }
    )

    return response.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error

      // Check for 24-hour window closed
      if (metaError?.code === 10 || metaError?.error_subcode === 2018278) {
        throw new MessengerError(
          MessengerErrorCode.WINDOW_CLOSED,
          'Cannot send message - 24-hour window has closed',
          400,
          false,
          'The messaging window has expired. Wait for the user to send a new message.',
          metaError
        )
      }

      throw new MessengerError(
        MessengerErrorCode.MESSAGE_SEND_FAILED,
        `Failed to send message: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Failed to send message',
        metaError
      )
    }

    throw new MessengerError(
      MessengerErrorCode.MESSAGE_SEND_FAILED,
      `Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    )
  }
}

// ============================================================================
// Sender Actions
// ============================================================================

/**
 * Send typing indicator
 */
export async function sendTypingOn(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  recipientPsid: string
): Promise<void> {
  try {
    await client.post(
      `${GRAPH_API_URL}/${pageId}/messages`,
      {
        recipient: { id: recipientPsid },
        sender_action: 'typing_on',
      },
      {
        params: { access_token: pageAccessToken },
      }
    )
  } catch (error) {
    // Don't throw - typing indicator is not critical
    logger.error('[MessengerMessaging] Failed to send typing indicator', {
      error: extractAxiosError(error),
    })
  }
}

/**
 * Mark message as seen
 */
export async function markSeen(
  client: AxiosInstance,
  pageId: string,
  pageAccessToken: string,
  recipientPsid: string
): Promise<void> {
  try {
    await client.post(
      `${GRAPH_API_URL}/${pageId}/messages`,
      {
        recipient: { id: recipientPsid },
        sender_action: 'mark_seen',
      },
      {
        params: { access_token: pageAccessToken },
      }
    )
  } catch (error) {
    logger.error('[MessengerMessaging] Failed to mark seen', {
      error: extractAxiosError(error),
    })
  }
}

// ============================================================================
// User Profile
// ============================================================================

/**
 * Get user profile by PSID
 * Note: Requires pages_messaging permission and user must have interacted with page
 * Facebook may restrict access to user profile data for privacy reasons
 */
export async function getUserProfile(
  client: AxiosInstance,
  pageAccessToken: string,
  psid: string
): Promise<MessengerUserProfile | null> {
  try {
    const response = await client.get<MessengerUserProfile>(
      `${GRAPH_API_URL}/${psid}`,
      {
        params: {
          access_token: pageAccessToken,
          fields: 'id,name,first_name,last_name,profile_pic',
        },
      }
    )

    console.log('[MessengerMessaging] User profile fetched:', {
      psid,
      name: response.data.name,
      hasProfilePic: !!response.data.profile_pic,
    })

    return response.data
  } catch (error: any) {
    // Log detailed error for debugging
    const errorMessage = error?.response?.data?.error?.message || error?.message || 'Unknown error'
    const errorCode = error?.response?.data?.error?.code
    const errorSubcode = error?.response?.data?.error?.error_subcode

    console.error('[MessengerMessaging] Failed to get user profile:', {
      psid,
      errorMessage,
      errorCode,
      errorSubcode,
      status: error?.response?.status,
    })

    // Return null - profile fetch is not critical
    return null
  }
}
