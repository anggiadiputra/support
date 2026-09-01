/**
 * Facebook Messenger Service
 * Main entry point for Messenger integration
 */

import axios from 'axios'
import { TokenEncryptionService } from '../../utils/tokenEncryption.js'
import { adminSettingsService } from '../admin/settings-service.js'
import { prisma } from '../../utils/database.js'
import * as oauth from './oauth.js'
import * as messaging from './messaging.js'
import * as webhook from './webhook.js'
import { MessengerError, MessengerErrorCode } from './errors.js'
import type { OAuthDependencies } from './oauth.js'
import type { MessengerSettings } from '../../types/admin-settings.js'

// Re-export types and errors
export * from './types.js'
export * from './errors.js'

// HTTP client
const httpClient = axios.create({
  timeout: 30000,
})

// Token encryption
const tokenEncryption = new TokenEncryptionService()

/**
 * Get OAuth dependencies from settings
 */
async function getOAuthDeps(): Promise<OAuthDependencies> {
  // IMPORTANT: Use false to get unmasked/decrypted values for actual API calls
  const response = await adminSettingsService.getSettings<MessengerSettings>('messenger', false)

  if (!response.data?.appId || !response.data?.appSecret) {
    throw new MessengerError(
      MessengerErrorCode.INTERNAL_ERROR,
      'Messenger app credentials not configured',
      500,
      false
    )
  }

  // Debug logging (shows only partial info for security)
  console.log('[Messenger] OAuth deps loaded:', {
    appId: response.data.appId,
    appSecretLength: response.data.appSecret?.length || 0,
    appSecretConfigured: !!response.data.appSecret && response.data.appSecret.length > 20,
    redirectUri: `${process.env.BACKEND_URL}/api/v1/messenger/auth/callback`,
  })

  return {
    client: httpClient,
    tokenEncryption,
    appId: response.data.appId,
    appSecret: response.data.appSecret,
    redirectUri: `${process.env.BACKEND_URL}/api/v1/messenger/auth/callback`,
  }
}

/**
 * Get decrypted page access token
 */
export async function getDecryptedToken(facebookPageId: string): Promise<string> {
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: {
      accessToken: true,
      accessTokenIV: true,
      accessTokenTag: true,
    },
  })

  if (!page) {
    throw new MessengerError(
      MessengerErrorCode.PAGE_NOT_FOUND,
      'Facebook page not found',
      404,
      false
    )
  }

  return tokenEncryption.decrypt({
    ciphertext: page.accessToken,
    iv: page.accessTokenIV,
    authTag: page.accessTokenTag,
    algorithm: 'aes-256-gcm',
  })
}

/**
 * Encrypt token for storage
 */
export function encryptToken(token: string) {
  return tokenEncryption.encrypt(token)
}

// ============================================================================
// OAuth Functions
// ============================================================================

export async function generateAuthUrl(userId: string) {
  const deps = await getOAuthDeps()
  return oauth.generateAuthUrl(deps, userId)
}

export async function exchangeCodeForToken(code: string, state: string) {
  const deps = await getOAuthDeps()
  return oauth.exchangeCodeForToken(deps, code, state)
}

export async function getUserPages(userAccessToken: string) {
  const deps = await getOAuthDeps()
  return oauth.getUserPages(deps, userAccessToken)
}

export async function subscribePageWebhook(pageId: string, pageAccessToken: string) {
  const deps = await getOAuthDeps()
  return oauth.subscribePageWebhook(deps, pageId, pageAccessToken)
}

export function decryptState(state: string) {
  return oauth.decryptState(tokenEncryption, state)
}

// ============================================================================
// Messaging Functions
// ============================================================================

export async function sendTextMessage(
  facebookPageId: string,
  recipientPsid: string,
  text: string
) {
  const token = await getDecryptedToken(facebookPageId)
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: { pageId: true },
  })
  if (!page) throw new MessengerError(MessengerErrorCode.PAGE_NOT_FOUND, 'Page not found', 404, false)
  
  return messaging.sendTextMessage(httpClient, page.pageId, token, recipientPsid, text)
}

export async function sendAttachment(
  facebookPageId: string,
  recipientPsid: string,
  type: 'image' | 'video' | 'audio' | 'file',
  url: string
) {
  const token = await getDecryptedToken(facebookPageId)
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: { pageId: true },
  })
  if (!page) throw new MessengerError(MessengerErrorCode.PAGE_NOT_FOUND, 'Page not found', 404, false)
  
  return messaging.sendAttachment(httpClient, page.pageId, token, recipientPsid, type, url)
}

export async function sendTypingOn(facebookPageId: string, recipientPsid: string) {
  const token = await getDecryptedToken(facebookPageId)
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: { pageId: true },
  })
  if (!page) return
  
  return messaging.sendTypingOn(httpClient, page.pageId, token, recipientPsid)
}

export async function getUserProfile(facebookPageId: string, psid: string) {
  const token = await getDecryptedToken(facebookPageId)
  return messaging.getUserProfile(httpClient, token, psid)
}

export async function sendReaction(
  facebookPageId: string,
  recipientPsid: string,
  messageId: string,
  reaction: 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'like' | 'dislike'
) {
  const token = await getDecryptedToken(facebookPageId)
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: { pageId: true },
  })
  if (!page) throw new MessengerError(MessengerErrorCode.PAGE_NOT_FOUND, 'Page not found', 404, false)
  
  return messaging.sendReaction(httpClient, page.pageId, token, recipientPsid, messageId, reaction)
}

export async function removeReaction(
  facebookPageId: string,
  recipientPsid: string,
  messageId: string
) {
  const token = await getDecryptedToken(facebookPageId)
  const page = await prisma.facebookPage.findUnique({
    where: { id: facebookPageId },
    select: { pageId: true },
  })
  if (!page) throw new MessengerError(MessengerErrorCode.PAGE_NOT_FOUND, 'Page not found', 404, false)
  
  return messaging.removeReaction(httpClient, page.pageId, token, recipientPsid, messageId)
}

// ============================================================================
// Webhook Functions
// ============================================================================

export const verifyWebhookChallenge = webhook.verifyWebhookChallenge
export const verifyWebhookSignature = webhook.verifyWebhookSignature
export const clearWebhookCache = webhook.clearCache
