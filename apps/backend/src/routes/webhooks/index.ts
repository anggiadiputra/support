import { Hono } from 'hono'
import type { Context } from 'hono'
import { createHmac, timingSafeEqual } from 'crypto'
import { prisma } from '../../utils/database.js'
import { webhookMonitor } from '../../services/monitoring/index.js'
import verifyWebhook from './verify.js'
import { handleIncomingMessage } from './incoming-message.js'
import { handleMessageStatus } from './message-status.js'
import { handleTemplateStatus } from './template-status.js'
import { handleHistorySync } from './history-sync.js'
import { handleContactsSync } from './contacts-sync.js'
import { handleMessageEchoes } from './message-echoes.js'
import { handleAccountUpdate } from './account-update.js'
import { handleUserPreferences } from './user-preferences.js'
import { settingsCache, CACHE_KEYS, CACHE_TTL } from '../../services/settings-cache.js'
import { getWhatsAppAccountByPhoneNumberId } from '../../utils/whatsapp-account-helper.js'
import type { WhatsAppSettings } from '../../types/admin-settings.js'

const app = new Hono()

/**
 * Get app secret from database or environment
 * Requirements: 6.3, 6.4 - Check database first, fallback to .env
 */
async function getAppSecret(): Promise<string | undefined> {
  try {
    // Check cache first
    const cachedSettings = settingsCache.get<WhatsAppSettings>(CACHE_KEYS.whatsapp())
    if (cachedSettings?.appSecret && !cachedSettings.appSecret.includes('****')) {
      return cachedSettings.appSecret
    }

    // Fetch from database
    const { adminSettingsService } = await import('../../services/admin/settings-service.js')
    const response = await adminSettingsService.getSettings<WhatsAppSettings>('whatsapp', false)
    
    // Cache the settings
    settingsCache.set(CACHE_KEYS.whatsapp(), response.data, CACHE_TTL.settings)
    
    if (response.data.appSecret && !response.data.appSecret.includes('****')) {
      return response.data.appSecret
    }
  } catch (error) {
    console.warn('Failed to get app secret from database, using env')
  }

  // Fallback to env
  return process.env.META_APP_SECRET
}

/**
 * Check if the webhook is from a manual login account (skip signature verification)
 * Manual login accounts don't use our app secret, so we can't verify signature
 */
async function isManualLoginAccount(body: any): Promise<boolean> {
  try {
    if (body.object !== 'whatsapp_business_account') {
      return false
    }

    // Get WABA ID from the entry
    for (const entry of body.entry || []) {
      const wabaId = entry.id
      if (wabaId) {
        const account = await prisma.whatsAppAccount.findUnique({
          where: { wabaId },
        })
        // Type assertion for isManualLogin field (added via migration)
        if ((account as any)?.isManualLogin) {
          return true
        }
      }
    }

    return false
  } catch (error) {
    console.warn('Error checking manual login status:', error)
    return false
  }
}

// Webhook verification
app.route('/', verifyWebhook)

// GET /api/v1/webhooks/test - Test endpoint to verify webhook is accessible
app.get('/test', async (c: Context) => {
  console.log('📡 Webhook test endpoint hit')
  return c.json({ 
    success: true, 
    message: 'Webhook endpoint is accessible',
    timestamp: new Date().toISOString()
  })
})

// POST /api/v1/webhooks - Receive webhook events
app.post('/', async (c: Context) => {
  console.log('📨 POST /api/v1/webhooks received')
  
  try {
    // Get raw body for signature verification
    const rawBody = await c.req.text()
    console.log('📦 Webhook raw body length:', rawBody.length)

    // SECURITY: Check body size limit (1MB max)
    if (rawBody.length > 1048576) {
      console.error('❌ Webhook payload too large:', rawBody.length)
      return c.json({ error: 'Payload too large' }, 413)
    }

    // Parse body first to check if it's a manual login account
    let body: any
    try {
      body = JSON.parse(rawBody)
    } catch (parseError) {
      console.error('❌ Webhook JSON parsing failed:', parseError)
      return c.json({ error: 'Invalid JSON' }, 400)
    }

    // Check if this is from a manual login account (skip signature verification)
    const isManualLogin = await isManualLoginAccount(body)

    if (isManualLogin) {
      console.log('✅ Webhook from manual login account - skipping signature verification')
    } else {
      // SECURITY: Verify webhook signature for non-manual accounts
      const signature = c.req.header('x-hub-signature-256')

      if (!signature) {
        console.error('❌ Webhook signature missing')
        return c.json({ error: 'Missing signature' }, 403)
      }

      // Verify signature using Meta App Secret (from database or env)
      const appSecret = await getAppSecret()
      if (!appSecret) {
        console.error('❌ META_APP_SECRET not configured')
        return c.json({ error: 'Server misconfigured' }, 500)
      }

      // Calculate expected signature
      const expectedSignature = 'sha256=' +
        createHmac('sha256', appSecret)
          .update(rawBody)
          .digest('hex')

      // Timing-safe comparison to prevent timing attacks
      try {
        const sigBuffer = Buffer.from(signature)
        const expectedBuffer = Buffer.from(expectedSignature)

        if (sigBuffer.length !== expectedBuffer.length) {
          console.error('❌ Webhook signature length mismatch')
          return c.json({ error: 'Invalid signature' }, 403)
        }

        if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
          console.error('❌ Webhook signature verification failed')
          return c.json({ error: 'Invalid signature' }, 403)
        }
      } catch (err) {
        console.error('❌ Webhook signature comparison error:', err)
        return c.json({ error: 'Invalid signature' }, 403)
      }

      console.log('✅ Webhook signature verified')
    }

    console.log('📥 WhatsApp webhook pesan diterima')

    // Respond immediately (Meta requires 200 OK within 20 seconds)
    c.status(200)

    // Process webhook asynchronously
    setImmediate(async () => {
      try {
        if (body.object === 'whatsapp_business_account') {
          for (const entry of body.entry || []) {
            for (const change of entry.changes || []) {
              const { field, value } = change

              // Get WhatsApp account from phone number ID in metadata
              const metaPhoneNumberId = value.metadata?.phone_number_id
              const phoneNumberRecord = metaPhoneNumberId
                ? await getWhatsAppAccountByPhoneNumberId(metaPhoneNumberId)
                : null

              const user = phoneNumberRecord?.user ?? null
              const whatsappAccount = phoneNumberRecord?.whatsappAccount ?? null

              try {
                // Handle different webhook types
                if (value.messages) {
                  for (const message of value.messages) {
                    await handleIncomingMessage(message, value.metadata, value.contacts, user, phoneNumberRecord, whatsappAccount)
                  }
                }

                if (value.statuses) {
                  for (const status of value.statuses) {
                    await handleMessageStatus(status, user)
                  }
                }

                if (value.message_template_status_update) {
                  await handleTemplateStatus(value.message_template_status_update, user)
                }

                // Coexistence webhook handlers
                if (field === 'history' && value.history) {
                  await handleHistorySync(value, user)
                }

                if (field === 'smb_app_state_sync' && value.state_sync) {
                  await handleContactsSync(value, user)
                }

                if (field === 'smb_message_echoes' && value.message_echoes) {
                  await handleMessageEchoes(value, user)
                }

                if (field === 'account_update' && value.event) {
                  await handleAccountUpdate(value, entry.id)
                }

                // Marketing opt-out / resume notifications from Meta
                if (field === 'user_preferences' && value.user_preferences) {
                  await handleUserPreferences(value, user)
                }
              } catch (err) {
                console.error('❌ Error processing webhook event:', err)
              }

              // Log webhook event
              if (user) {
                await webhookMonitor.logEvent(
                  user.id,
                  field,
                  value,
                  true
                )
              }
            }
          }
        }
      } catch (error) {
        console.error('❌ Webhook processing error:', error)
      }
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('❌ Webhook error:', error)
    return c.json({ error: 'Webhook processing failed' }, 500)
  }
})

export default app
