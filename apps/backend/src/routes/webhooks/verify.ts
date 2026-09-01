import { Hono } from 'hono'
import type { Context } from 'hono'
import { timingSafeEqual } from 'crypto'
import { prisma } from '../../utils/database.js'
import { settingsCache, CACHE_KEYS, CACHE_TTL } from '../../services/settings-cache.js'
import type { WhatsAppSettings } from '../../types/admin-settings.js'

const app = new Hono()

/**
 * Get verify token from database or environment
 * Requirements: 6.3, 6.4 - Check database first, fallback to .env
 */
async function getVerifyToken(): Promise<string | undefined> {
  try {
    // Check cache first
    const cachedSettings = settingsCache.get<WhatsAppSettings>(CACHE_KEYS.whatsapp())
    if (cachedSettings?.verifyToken && !cachedSettings.verifyToken.includes('****')) {
      return cachedSettings.verifyToken
    }

    // Fetch from database
    const { adminSettingsService } = await import('../../services/admin/settings-service.js')
    const response = await adminSettingsService.getSettings<WhatsAppSettings>('whatsapp', false)
    
    // Cache the settings
    settingsCache.set(CACHE_KEYS.whatsapp(), response.data, CACHE_TTL.settings)
    
    if (response.data.verifyToken && !response.data.verifyToken.includes('****')) {
      return response.data.verifyToken
    }
  } catch (error) {
    console.warn('Failed to get verify token from database, using env')
  }

  // Fallback to env
  return process.env.META_VERIFY_TOKEN
}

/**
 * Check if the token matches any manual login account's webhook verify token
 * This allows per-account verify tokens for manual login users
 */
async function matchManualLoginVerifyToken(token: string): Promise<boolean> {
  try {
    // Find any manual login account with matching verify token
    const account = await prisma.whatsAppAccount.findFirst({
      where: {
        webhookVerifyToken: token,
        // Only check manual login accounts
        // Note: isManualLogin field added via migration
      }
    })

    // Check if account exists and is manual login
    if (account && (account as any).isManualLogin) {
      return true
    }

    return false
  } catch (error) {
    console.warn('Error checking manual login verify token:', error)
    return false
  }
}

// GET /api/v1/webhooks - Webhook verification
app.get('/', async (c: Context) => {
  try {
    const mode = c.req.query('hub.mode')
    const token = c.req.query('hub.verify_token')
    const challenge = c.req.query('hub.challenge')

    if (!mode || !token || !challenge) {
      console.warn('❌ Webhook verification failed - missing parameters')
      return c.json({ error: 'Missing parameters' }, 400)
    }

    if (mode !== 'subscribe') {
      console.warn('❌ Webhook verification failed - invalid mode:', mode)
      return c.json({ error: 'Verification failed' }, 403)
    }

    // First, check if token matches any manual login account's verify token
    const isManualLoginToken = await matchManualLoginVerifyToken(token)
    if (isManualLoginToken) {
      console.log('✅ Webhook verified successfully (manual login account)')
      return c.text(challenge)
    }

    // If not manual login, check system verify token (embedded signup)
    const verifyToken = await getVerifyToken()

    if (!verifyToken) {
      console.error('❌ CRITICAL: META_VERIFY_TOKEN not configured and no manual login match!')
      return c.json({ error: 'Server misconfigured' }, 500)
    }

    // SECURITY: Use timing-safe comparison to prevent timing attacks
    try {
      const tokenBuffer = Buffer.from(token)
      const verifyBuffer = Buffer.from(verifyToken)

      // Check length first (not secret)
      if (tokenBuffer.length !== verifyBuffer.length) {
        console.warn('❌ Webhook verification failed - token length mismatch')
        return c.json({ error: 'Verification failed' }, 403)
      }

      // Constant-time comparison
      if (timingSafeEqual(tokenBuffer, verifyBuffer)) {
        console.log('✅ Webhook verified successfully (system token)')
        return c.text(challenge)
      }
    } catch (err) {
      console.error('❌ Webhook verification comparison error:', err)
      return c.json({ error: 'Verification failed' }, 403)
    }

    console.warn('❌ Webhook verification failed - token mismatch')
    return c.json({ error: 'Verification failed' }, 403)
  } catch (error) {
    console.error('❌ Webhook verification error:', error)
    return c.json({ error: 'Verification error' }, 500)
  }
})

export default app
