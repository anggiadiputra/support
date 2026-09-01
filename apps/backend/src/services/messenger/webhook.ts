/**
 * Facebook Messenger Webhook Service
 * Handles webhook signature verification and challenge response
 */

import { createHmac } from 'crypto'
import { adminSettingsService } from '../admin/settings-service.js'
import type { MessengerSettings } from '../../types/admin-settings.js'

// Cache for settings
let cachedAppSecret: string | null = null
let cachedVerifyToken: string | null = null

/**
 * Get Facebook App Secret from settings
 */
async function getAppSecret(): Promise<string> {
  if (cachedAppSecret) {
    return cachedAppSecret
  }

  const response = await adminSettingsService.getSettings<MessengerSettings>('messenger', false)
  if (response.data?.appSecret) {
    cachedAppSecret = response.data.appSecret
    console.log('[MessengerWebhook] App secret loaded and cached')
    return cachedAppSecret
  }

  throw new Error('Messenger app secret not configured')
}

/**
 * Get Webhook Verify Token from settings
 */
async function getVerifyToken(): Promise<string> {
  if (cachedVerifyToken) return cachedVerifyToken

  const response = await adminSettingsService.getSettings<MessengerSettings>('messenger', false)
  if (response.data?.webhookVerifyToken) {
    cachedVerifyToken = response.data.webhookVerifyToken
    return cachedVerifyToken
  }

  throw new Error('Messenger webhook verify token not configured')
}

/**
 * Verify webhook challenge (GET request from Facebook)
 */
export async function verifyWebhookChallenge(
  mode: string,
  token: string,
  challenge: string
): Promise<string | null> {
  if (mode !== 'subscribe') {
    return null
  }

  try {
    const verifyToken = await getVerifyToken()
    if (token === verifyToken) {
      return challenge
    }
  } catch (error) {
    console.error('[MessengerWebhook] Failed to get verify token')
  }

  return null
}

/**
 * Verify webhook signature (POST request from Facebook)
 */
export async function verifyWebhookSignature(
  rawBody: string | Buffer,
  signature: string | undefined
): Promise<boolean> {
  if (!signature) {
    console.warn('[MessengerWebhook] Signature header missing')
    return false
  }

  try {
    const appSecret = await getAppSecret()
    const expectedSignature = 'sha256=' + createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')

    const isValid = signature === expectedSignature

    if (!isValid) {
      // Minimal logging for signature mismatch - no sensitive data
      console.warn('[MessengerWebhook] Signature mismatch - possible duplicate webhook or wrong app')
    }

    return isValid
  } catch (error) {
    console.error('[MessengerWebhook] Signature verification failed')
    return false
  }
}

/**
 * Clear cached settings (call when settings are updated)
 */
export function clearCache(): void {
  cachedAppSecret = null
  cachedVerifyToken = null
  console.log('[MessengerWebhook] Cache cleared')
}
