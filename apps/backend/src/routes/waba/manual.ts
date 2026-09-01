/**
 * WABA Manual Login Routes
 * Allows users to connect WABA using their own access token and WABA ID
 * 
 * Features:
 * - User provides Access Token + WABA ID
 * - System validates token via Meta Graph API
 * - Generates unique webhook verify token per account
 * - No signature verification required (user manages their own app)
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { randomBytes } from 'crypto'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { TokenEncryptionService } from '../../utils/tokenEncryption.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

// Validation schemas
const manualConnectSchema = z.object({
  accessToken: z.string().min(10, 'Access token is required'),
  wabaId: z.string().min(1, 'WABA ID is required'),
})

/**
 * Generate a random verify token for webhook verification
 */
function generateVerifyToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Validate access token by calling Meta Graph API
 */
async function validateTokenAndFetchWABA(accessToken: string, wabaId: string) {
  // Fetch WABA details including messaging limit at WABA level
  const wabaResponse = await fetch(
    `https://graph.facebook.com/v22.0/${wabaId}?fields=id,name,timezone_id,currency,message_template_namespace,whatsapp_business_manager_messaging_limit&access_token=${accessToken}`
  )

  if (!wabaResponse.ok) {
    const error = await wabaResponse.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Invalid access token or WABA ID')
  }

  const wabaData = await wabaResponse.json() as {
    id: string
    name?: string
    timezone_id?: string
    currency?: string
    message_template_namespace?: string
    whatsapp_business_manager_messaging_limit?: string
  }

  // Fetch phone numbers for this WABA
  const phoneResponse = await fetch(
    `https://graph.facebook.com/v22.0/${wabaId}/phone_numbers?fields=id,display_phone_number,verified_name,quality_rating,messaging_limit_tier,code_verification_status,account_mode,name_status,status&access_token=${accessToken}`
  )

  if (!phoneResponse.ok) {
    const error = await phoneResponse.json().catch(() => ({}))
    throw new Error(error.error?.message || 'Failed to fetch phone numbers')
  }

  const phoneData = await phoneResponse.json() as {
    data: Array<{
      id: string
      display_phone_number: string
      verified_name?: string
      quality_rating?: string
      messaging_limit_tier?: string
      code_verification_status?: string
      account_mode?: string
      name_status?: string
      status?: string
    }>
  }

  return {
    waba: {
      id: wabaData.id,
      name: wabaData.name,
      timezoneId: wabaData.timezone_id,
      currency: wabaData.currency,
      messageTemplateNamespace: wabaData.message_template_namespace,
      messagingLimitTier: wabaData.whatsapp_business_manager_messaging_limit,
    },
    phoneNumbers: phoneData.data || [],
  }
}

// POST /manual/connect - Connect WABA manually with access token
app.post('/connect', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const body = await c.req.json().catch(() => ({}))
    const data = manualConnectSchema.parse(body)

    // Check if this WABA is already connected
    const existingAccount = await prisma.whatsAppAccount.findUnique({
      where: { wabaId: data.wabaId }
    })

    if (existingAccount && existingAccount.userId !== c.user.id) {
      return c.json({
        error: {
          code: 'WABA_ALREADY_CONNECTED',
          message: 'This WABA is already connected to another account'
        }
      }, 400)
    }

    // Validate token and fetch WABA data from Meta API
    let wabaData
    try {
      wabaData = await validateTokenAndFetchWABA(data.accessToken, data.wabaId)
    } catch (error: any) {
      logDetailedError(error, { action: 'validateManualToken', wabaId: data.wabaId })
      return c.json({
        error: {
          code: 'INVALID_TOKEN',
          message: error.message || 'Failed to validate access token'
        }
      }, 400)
    }

    // Encrypt access token
    const tokenEncryption = new TokenEncryptionService()
    const encryptedToken = tokenEncryption.encrypt(data.accessToken)

    // Generate unique verify token for this account
    const webhookVerifyToken = generateVerifyToken()

    // Create or update WhatsApp Account
    const whatsappAccount = await prisma.whatsAppAccount.upsert({
      where: { wabaId: data.wabaId },
      create: {
        wabaId: wabaData.waba.id,
        wabaName: wabaData.waba.name,
        accessToken: encryptedToken.ciphertext,
        accessTokenIV: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        tokenLastRefresh: new Date(),
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        connectionStatus: 'connected',
        timezoneId: wabaData.waba.timezoneId,
        currency: wabaData.waba.currency,
        messageTemplateNamespace: wabaData.waba.messageTemplateNamespace,
        messagingTier: wabaData.waba.messagingLimitTier,
        webhookVerifyToken: webhookVerifyToken,
        isManualLogin: true,
        userId: c.user.id,
      },
      update: {
        wabaName: wabaData.waba.name,
        accessToken: encryptedToken.ciphertext,
        accessTokenIV: encryptedToken.iv,
        accessTokenTag: encryptedToken.authTag,
        tokenLastRefresh: new Date(),
        connectedAt: new Date(),
        lastSyncAt: new Date(),
        connectionStatus: 'connected',
        timezoneId: wabaData.waba.timezoneId,
        currency: wabaData.waba.currency,
        messageTemplateNamespace: wabaData.waba.messageTemplateNamespace,
        messagingTier: wabaData.waba.messagingLimitTier,
        webhookVerifyToken: webhookVerifyToken,
        isManualLogin: true,
        userId: c.user.id,
      }
    })

    // Store phone numbers
    await prisma.phoneNumber.updateMany({
      where: { whatsappAccountId: whatsappAccount.id },
      data: { isPrimary: false }
    })

    const phoneNumbers = await Promise.all(
      wabaData.phoneNumbers.map(async (pn) => {
        return prisma.phoneNumber.upsert({
          where: { phoneNumberId: pn.id },
          create: {
            phoneNumberId: pn.id,
            displayPhoneNumber: pn.display_phone_number,
            verifiedName: pn.verified_name,
            qualityRating: pn.quality_rating,
            messagingLimitTier: pn.messaging_limit_tier,
            isVerified: pn.code_verification_status === 'VERIFIED',
            codeVerificationStatus: pn.code_verification_status,
            accountMode: pn.account_mode,
            nameStatus: pn.name_status,
            status: pn.status,
            isPrimary: false,
            userId: c.user!.id,
            whatsappAccountId: whatsappAccount.id,
          },
          update: {
            displayPhoneNumber: pn.display_phone_number,
            verifiedName: pn.verified_name,
            qualityRating: pn.quality_rating,
            messagingLimitTier: pn.messaging_limit_tier,
            isVerified: pn.code_verification_status === 'VERIFIED',
            codeVerificationStatus: pn.code_verification_status,
            accountMode: pn.account_mode,
            nameStatus: pn.name_status,
            status: pn.status,
            whatsappAccountId: whatsappAccount.id,
            // Keep phone owner in sync with the account owner on re-sync (see
            // signup.ts for the inbound-routing bug this prevents).
            userId: c.user!.id,
          }
        })
      })
    )

    // Set first phone number as primary
    if (phoneNumbers.length > 0) {
      await prisma.phoneNumber.update({
        where: { phoneNumberId: phoneNumbers[0].phoneNumberId },
        data: { isPrimary: true }
      })
      phoneNumbers[0].isPrimary = true
    }

    // Create connection log
    await prisma.wABAConnectionLog.create({
      data: {
        userId: c.user.id,
        whatsappAccountId: whatsappAccount.id,
        action: 'manual_connected',
        details: {
          wabaId: wabaData.waba.id,
          wabaName: wabaData.waba.name,
          phoneNumbers: wabaData.phoneNumbers.map(pn => pn.display_phone_number),
          isManualLogin: true,
        }
      }
    })

    // Audit log
    await auditLog(
      'WABA_MANUAL_CONNECTED',
      'User',
      c.user.id,
      {
        wabaId: wabaData.waba.id,
        wabaName: wabaData.waba.name,
        phoneCount: phoneNumbers.length,
        isManualLogin: true,
      },
      c.user.id
    )

    // Get webhook URL from environment
    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.APP_URL || ''
    const webhookUrl = `${webhookBaseUrl}/api/v1/webhooks`

    return c.json({
      success: true,
      data: {
        waba: {
          id: whatsappAccount.id,
          wabaId: wabaData.waba.id,
          name: wabaData.waba.name,
          timezone: wabaData.waba.timezoneId,
          currency: wabaData.waba.currency,
          namespace: wabaData.waba.messageTemplateNamespace,
          status: 'connected',
          isManualLogin: true,
        },
        phoneNumbers: phoneNumbers.map(pn => ({
          id: pn.phoneNumberId,
          displayPhoneNumber: pn.displayPhoneNumber,
          verifiedName: pn.verifiedName,
          qualityRating: pn.qualityRating,
          isVerified: pn.isVerified,
          isPrimary: pn.isPrimary,
        })),
        webhook: {
          url: webhookUrl,
          verifyToken: webhookVerifyToken,
          instructions: 'Configure this webhook URL and verify token in your Meta App Dashboard under Webhooks settings.',
        },
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to connect WABA'
      }
    }, 500)
  }
})

// GET /manual/webhook-info/:accountId - Get webhook configuration info
app.get('/webhook-info/:accountId', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const accountId = c.req.param('accountId')

    const account = await prisma.whatsAppAccount.findFirst({
      where: {
        id: accountId,
        userId: c.user.id,
      },
      select: {
        id: true,
        wabaId: true,
        wabaName: true,
        webhookVerifyToken: true,
        isManualLogin: true,
        connectionStatus: true,
      }
    })

    if (!account) {
      return c.json({
        error: {
          code: 'NOT_FOUND',
          message: 'WhatsApp account not found'
        }
      }, 404)
    }

    if (!account.isManualLogin) {
      return c.json({
        error: {
          code: 'NOT_MANUAL_LOGIN',
          message: 'This account was connected via embedded signup, not manual login'
        }
      }, 400)
    }

    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.APP_URL || ''
    const webhookUrl = `${webhookBaseUrl}/api/v1/webhooks`

    return c.json({
      success: true,
      data: {
        accountId: account.id,
        wabaId: account.wabaId,
        wabaName: account.wabaName,
        webhook: {
          url: webhookUrl,
          verifyToken: account.webhookVerifyToken,
          instructions: [
            '1. Go to your Meta App Dashboard',
            '2. Navigate to WhatsApp > Configuration > Webhooks',
            '3. Click "Edit" on the Webhook URL field',
            '4. Enter the Webhook URL above',
            '5. Enter the Verify Token above',
            '6. Click "Verify and Save"',
            '7. Subscribe to the following webhook fields: messages',
          ],
        },
      }
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to get webhook info'
      }
    }, 500)
  }
})

// POST /manual/regenerate-verify-token/:accountId - Regenerate verify token
app.post('/regenerate-verify-token/:accountId', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const accountId = c.req.param('accountId')

    const account = await prisma.whatsAppAccount.findFirst({
      where: {
        id: accountId,
        userId: c.user.id,
        isManualLogin: true,
      }
    })

    if (!account) {
      return c.json({
        error: {
          code: 'NOT_FOUND',
          message: 'Manual login WhatsApp account not found'
        }
      }, 404)
    }

    const newVerifyToken = generateVerifyToken()

    await prisma.whatsAppAccount.update({
      where: { id: accountId },
      data: { webhookVerifyToken: newVerifyToken }
    })

    await auditLog(
      'WABA_VERIFY_TOKEN_REGENERATED',
      'WhatsAppAccount',
      accountId,
      { wabaId: account.wabaId },
      c.user.id
    )

    const webhookBaseUrl = process.env.WEBHOOK_BASE_URL || process.env.APP_URL || ''
    const webhookUrl = `${webhookBaseUrl}/api/v1/webhooks`

    return c.json({
      success: true,
      data: {
        webhook: {
          url: webhookUrl,
          verifyToken: newVerifyToken,
          message: 'Verify token regenerated. Please update your Meta App webhook configuration.',
        }
      }
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to regenerate verify token'
      }
    }, 500)
  }
})

export default app
