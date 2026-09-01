/**
 * Facebook Messenger OAuth Module
 * Handles Facebook Login for Pages and token management
 */

import axios, { AxiosInstance } from 'axios'
import { randomBytes } from 'crypto'
import { TokenEncryptionService } from '../../utils/tokenEncryption.js'
import { MessengerError, MessengerErrorCode } from './errors.js'
import { logger, extractAxiosError } from '../../utils/logger.js'
import type { FacebookPageInfo, FacebookPagesResponse } from './types.js'

// ============================================================================
// Types
// ============================================================================

export interface OAuthDependencies {
  client: AxiosInstance
  tokenEncryption: TokenEncryptionService
  appId: string
  appSecret: string
  redirectUri: string
}

export interface StateData {
  userId: string
  nonce: string
  timestamp: number
}

export interface AuthUrlResponse {
  authUrl: string
  state: string
  expiresAt: string
}

// ============================================================================
// OAuth Functions
// ============================================================================

/**
 * Generate Facebook OAuth authorization URL for Pages
 */
export async function generateAuthUrl(
  deps: OAuthDependencies,
  userId: string
): Promise<AuthUrlResponse> {
  try {
    const nonce = randomBytes(16).toString('hex')
    const timestamp = Date.now()

    const stateData: StateData = {
      userId,
      nonce,
      timestamp,
    }

    // Encrypt state parameter
    const encryptedState = deps.tokenEncryption.encrypt(JSON.stringify(stateData))
    const state = Buffer.from(JSON.stringify(encryptedState)).toString('base64url')

    // Build OAuth URL for Facebook Login
    const authUrl = new URL('https://www.facebook.com/v24.0/dialog/oauth')

    authUrl.searchParams.set('client_id', deps.appId)
    authUrl.searchParams.set('redirect_uri', deps.redirectUri)
    authUrl.searchParams.set('state', state)
    authUrl.searchParams.set('response_type', 'code')
    // Required scopes for Messenger - includes pages_read_engagement for user profile access
    authUrl.searchParams.set('scope', 'pages_show_list,pages_messaging,pages_manage_metadata,pages_read_engagement,public_profile')

    console.log('[MessengerOAuth] Generated OAuth URL')

    const expiresAt = new Date(timestamp + 10 * 60 * 1000).toISOString()

    return {
      authUrl: authUrl.toString(),
      state,
      expiresAt,
    }
  } catch (error) {
    throw new MessengerError(
      MessengerErrorCode.INTERNAL_ERROR,
      `Failed to generate auth URL: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    )
  }
}

/**
 * Exchange authorization code for user access token
 */
export async function exchangeCodeForToken(
  deps: OAuthDependencies,
  code: string,
  state: string
): Promise<{ accessToken: string; userId: string }> {
  try {
    // Decrypt and validate state
    const stateData = decryptState(deps.tokenEncryption, state)

    // Validate state timestamp (10 minutes)
    const stateAge = Date.now() - stateData.timestamp
    if (stateAge > 10 * 60 * 1000) {
      throw new MessengerError(
        MessengerErrorCode.STATE_EXPIRED,
        'State parameter expired',
        400,
        true,
        'Please try connecting again'
      )
    }

    // Exchange code for user access token
    const response = await deps.client.get('https://graph.facebook.com/v24.0/oauth/access_token', {
      params: {
        client_id: deps.appId,
        client_secret: deps.appSecret,
        redirect_uri: deps.redirectUri,
        code: code,
      },
    })

    const { access_token } = response.data

    return {
      accessToken: access_token,
      userId: stateData.userId,
    }
  } catch (error) {
    if (error instanceof MessengerError) throw error

    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error
      throw new MessengerError(
        MessengerErrorCode.TOKEN_EXCHANGE_FAILED,
        `Token exchange failed: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Please try connecting again',
        metaError
      )
    }

    throw new MessengerError(
      MessengerErrorCode.TOKEN_EXCHANGE_FAILED,
      `Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    )
  }
}

/**
 * Get list of Facebook Pages the user manages
 */
export async function getUserPages(
  deps: OAuthDependencies,
  userAccessToken: string
): Promise<FacebookPageInfo[]> {
  try {
    const response = await deps.client.get<FacebookPagesResponse>(
      'https://graph.facebook.com/v24.0/me/accounts',
      {
        params: {
          access_token: userAccessToken,
          fields: 'id,name,category,access_token,picture',
        },
      }
    )

    return response.data.data
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const metaError = error.response?.data?.error
      throw new MessengerError(
        MessengerErrorCode.API_ERROR,
        `Failed to get pages: ${metaError?.message || error.message}`,
        error.response?.status || 500,
        false,
        'Failed to retrieve your Facebook Pages'
      )
    }

    throw new MessengerError(
      MessengerErrorCode.INTERNAL_ERROR,
      `Failed to get pages: ${error instanceof Error ? error.message : 'Unknown error'}`,
      500,
      false
    )
  }
}

/**
 * Subscribe page to webhook events
 */
export async function subscribePageWebhook(
  deps: OAuthDependencies,
  pageId: string,
  pageAccessToken: string
): Promise<boolean> {
  try {
    const response = await deps.client.post(
      `https://graph.facebook.com/v24.0/${pageId}/subscribed_apps`,
      null,
      {
        params: {
          access_token: pageAccessToken,
          // Valid fields: messages, messaging_postbacks, message_deliveries, message_reads, message_reactions
          // Note: "messaging_reactions" is NOT valid - use "message_reactions" instead
          subscribed_fields: 'messages,messaging_postbacks,message_deliveries,message_reads,message_reactions',
        },
      }
    )

    console.log('[MessengerOAuth] Webhook subscription successful for page:', pageId)
    return response.data.success === true
  } catch (error) {
    logger.error('[MessengerOAuth] Failed to subscribe webhook', {
      error: extractAxiosError(error),
    })
    return false
  }
}

/**
 * Decrypt and validate state parameter
 */
export function decryptState(
  tokenEncryption: TokenEncryptionService,
  state: string
): StateData {
  try {
    const encryptedState = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'))
    return JSON.parse(tokenEncryption.decrypt(encryptedState))
  } catch (error) {
    throw new MessengerError(
      MessengerErrorCode.STATE_INVALID,
      'Invalid state parameter',
      400,
      true,
      'Please try connecting again'
    )
  }
}
