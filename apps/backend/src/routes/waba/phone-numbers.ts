/**
 * WABA Phone Numbers Routes
 * Handles phone number listing and sync
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { wabaService, wabaResources as wabaResourcesModule } from '../../services/waba/index.js'
import { getUserByWabaId } from './helpers.js'
import { decryptAccountToken } from '../../utils/whatsapp-account-helper.js'
import { WABAError, parseMetaError } from '../../utils/wabaErrors.js'

const app = new Hono()

// GET / - Get phone numbers for a WABA
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const wabaId = c.req.param('wabaId')

    // Get WhatsApp account and check access
    const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)

    if ('error' in result) {
      return c.json(result.error, result.status as any)
    }

    const { account } = result

    // Fetch phone numbers from database filtered by whatsappAccountId
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        whatsappAccountId: account.id
      },
      orderBy: [
        { isPrimary: 'desc' },
        { createdAt: 'asc' }
      ]
    })

    return c.json({
      success: true,
      data: phoneNumbers.map(pn => ({
        id: pn.phoneNumberId,
        displayPhoneNumber: pn.displayPhoneNumber,
        verifiedName: pn.verifiedName,
        qualityRating: pn.qualityRating,
        messagingLimitTier: pn.messagingLimitTier,
        isVerified: pn.isVerified,
        isPrimary: pn.isPrimary,
        // Registration status fields
        codeVerificationStatus: pn.codeVerificationStatus,
        accountMode: pn.accountMode,
        nameStatus: pn.nameStatus,
        status: pn.status,
        createdAt: pn.createdAt,
        updatedAt: pn.updatedAt
      }))
    })
  } catch (error) {
    console.error('Get phone numbers error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch phone numbers'
      }
    }, 500)
  }
})

// POST /sync - Sync phone numbers from Meta
app.post('/sync', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const wabaId = c.req.param('wabaId')

    // Get WhatsApp account and check access
    const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)

    if ('error' in result) {
      return c.json(result.error, result.status as any)
    }

    const { account, user } = result

    // Check if WABA is connected
    if (account.connectionStatus !== 'connected') {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'WABA is not connected'
        }
      }, 400)
    }

    // Decrypt access token from WhatsAppAccount
    if (!account.accessToken || !account.accessTokenIV || !account.accessTokenTag) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'No access token found. Please reconnect WABA.'
        }
      }, 400)
    }

    const accessToken = decryptAccountToken(account)

    // Fetch WABA details to get messaging limit at WABA level
    const wabaDetails = await wabaResourcesModule.getWABADetails(wabaId, accessToken)

    // Fetch phone numbers from Meta using the known wabaId directly
    // (discoverWABAResources may pick the wrong WABA from target_ids)
    const metaPhoneNumbers = await wabaResourcesModule.getPhoneNumbers(wabaId, accessToken)

    // Get current phone numbers from database for this WhatsApp account
    const currentPhoneNumbers = await prisma.phoneNumber.findMany({
      where: { whatsappAccountId: account.id }
    })

    const currentPhoneNumberIds = new Set(currentPhoneNumbers.map(pn => pn.phoneNumberId))
    const metaPhoneNumberIds = new Set(metaPhoneNumbers.map(pn => pn.id))

    // Delete phone numbers that no longer exist in Meta
    const phoneNumbersToDelete = currentPhoneNumbers.filter(pn => !metaPhoneNumberIds.has(pn.phoneNumberId))
    if (phoneNumbersToDelete.length > 0) {
      await prisma.phoneNumber.deleteMany({
        where: {
          phoneNumberId: {
            in: phoneNumbersToDelete.map(pn => pn.phoneNumberId)
          }
        }
      })
    }

    // Reset all phone numbers to non-primary before upserting
    // This ensures only one phone number will be primary
    await prisma.phoneNumber.updateMany({
      where: { whatsappAccountId: account.id },
      data: { isPrimary: false }
    })

    // Upsert phone numbers from Meta (all with isPrimary: false initially)
    const updatedPhoneNumbers = await Promise.all(
      metaPhoneNumbers.map(async (pn) => {
        return prisma.phoneNumber.upsert({
          where: { phoneNumberId: pn.id },
          create: {
            phoneNumberId: pn.id,
            displayPhoneNumber: pn.displayPhoneNumber,
            verifiedName: pn.verifiedName,
            qualityRating: pn.qualityRating,
            messagingLimitTier: pn.messagingLimitTier,
            isVerified: pn.codeVerificationStatus === 'VERIFIED',
            codeVerificationStatus: pn.codeVerificationStatus,
            accountMode: pn.accountMode,
            nameStatus: pn.nameStatus,
            status: pn.status,
            isPrimary: false, // Will set primary separately
            userId: user.id,
            whatsappAccountId: account.id
          },
          update: {
            displayPhoneNumber: pn.displayPhoneNumber,
            verifiedName: pn.verifiedName,
            qualityRating: pn.qualityRating,
            messagingLimitTier: pn.messagingLimitTier,
            isVerified: pn.codeVerificationStatus === 'VERIFIED',
            codeVerificationStatus: pn.codeVerificationStatus,
            accountMode: pn.accountMode,
            nameStatus: pn.nameStatus,
            status: pn.status,
            whatsappAccountId: account.id,
            // Keep phone owner in sync with the account owner on re-sync (see
            // signup.ts for the inbound-routing bug this prevents).
            userId: user.id,
          }
        })
      })
    )

    // Set the first phone number as primary and update lastSyncAt on the account
    if (updatedPhoneNumbers.length > 0) {
      await prisma.phoneNumber.update({
        where: { phoneNumberId: updatedPhoneNumbers[0].phoneNumberId },
        data: { isPrimary: true }
      })
      // Update local reference
      updatedPhoneNumbers[0].isPrimary = true
    }

    // Update lastSyncAt and messagingTier on the WhatsAppAccount
    await prisma.whatsAppAccount.update({
      where: { id: account.id },
      data: { 
        lastSyncAt: new Date(),
        messagingTier: wabaDetails.whatsapp_business_manager_messaging_limit || null
      }
    })

    // Audit log
    await auditLog(
      'WABA_PHONE_NUMBERS_SYNCED',
      'WhatsAppAccount',
      account.id,
      {
        wabaId,
        added: updatedPhoneNumbers.length,
        deleted: phoneNumbersToDelete.length,
        syncedBy: c.user.id
      },
      c.user.id
    )

    return c.json({
      success: true,
      data: {
        phoneNumbers: updatedPhoneNumbers.map(pn => ({
          id: pn.phoneNumberId,
          displayPhoneNumber: pn.displayPhoneNumber,
          verifiedName: pn.verifiedName,
          qualityRating: pn.qualityRating,
          messagingLimitTier: pn.messagingLimitTier,
          isVerified: pn.isVerified,
          isPrimary: pn.isPrimary,
          codeVerificationStatus: pn.codeVerificationStatus,
          accountMode: pn.accountMode,
          nameStatus: pn.nameStatus,
          status: pn.status
        })),
        added: metaPhoneNumbers.filter(pn => !currentPhoneNumberIds.has(pn.id)).length,
        deleted: phoneNumbersToDelete.length,
        message: 'Phone numbers synced successfully'
      }
    })
  } catch (error: any) {
    console.error('Sync phone numbers error:', error)

    if (error instanceof WABAError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error.message || 'Failed to sync phone numbers'
      }
    }, 500)
  }
})

// GET /stats - Get stats for all phone numbers under this WABA
app.get('/stats', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const wabaId = c.req.param('wabaId')
    const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)
    if ('error' in result) {
      return c.json(result.error, result.status as any)
    }

    const { account } = result

    // Get all phone numbers for this account
    const phoneNumbers = await prisma.phoneNumber.findMany({
      where: { whatsappAccountId: account.id },
      select: { id: true, phoneNumberId: true }
    })

    const statsMap: Record<string, any> = {}

    for (const pn of phoneNumbers) {
      const [messageCount, sentCount, receivedCount, unreadCount, contactCount] = await Promise.all([
        prisma.message.count({
          where: { whatsappPhoneNumberId: pn.id }
        }),
        prisma.message.count({
          where: { whatsappPhoneNumberId: pn.id, direction: 'OUTBOUND' }
        }),
        prisma.message.count({
          where: { whatsappPhoneNumberId: pn.id, direction: 'INBOUND' }
        }),
        prisma.message.count({
          where: {
            whatsappPhoneNumberId: pn.id,
            direction: 'INBOUND',
            status: 'DELIVERED'
          }
        }),
        prisma.customer.count({
          where: { whatsappPhoneNumberId: pn.id }
        }),
      ])

      // Chats = distinct customers that have messages on this phone number
      const chatsResult = await prisma.message.findMany({
        where: { whatsappPhoneNumberId: pn.id },
        select: { customerId: true },
        distinct: ['customerId']
      })

      statsMap[pn.phoneNumberId] = {
        messages: messageCount,
        sent: sentCount,
        received: receivedCount,
        unread: unreadCount,
        contacts: contactCount,
        chats: chatsResult.length,
      }
    }

    return c.json({ success: true, data: statsMap })
  } catch (error) {
    console.error('Get phone number stats error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch stats' } }, 500)
  }
})

// GET /:phoneNumberId/profile - Get business profile from Meta API
app.get('/:phoneNumberId/profile', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const wabaId = c.req.param('wabaId')
    const phoneNumberId = c.req.param('phoneNumberId')

    const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)
    if ('error' in result) {
      return c.json(result.error, result.status as any)
    }

    const { account } = result

    // Verify phone number belongs to this account
    const phoneNumber = await prisma.phoneNumber.findFirst({
      where: { phoneNumberId, whatsappAccountId: account.id }
    })

    if (!phoneNumber) {
      return c.json({ error: { code: 'NotFound', message: 'Phone number not found for this WABA' } }, 404)
    }

    // Decrypt token and fetch business profile from Meta
    const accessToken = decryptAccountToken(account)
    const { WhatsAppAPI } = await import('../../utils/whatsapp.js')
    const client = new WhatsAppAPI({ accessToken })
    const profile = await client.getBusinessProfile(phoneNumberId)

    return c.json({ success: true, data: profile })
  } catch (error: any) {
    console.error('Get business profile error:', error)

    if (error instanceof WABAError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: error.message || 'Failed to fetch business profile'
      }
    }, 500)
  }
})

// POST /primary - Set primary phone number (local only)
app.post('/primary', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const wabaId = c.req.param('wabaId')
    const body = await c.req.json().catch(() => ({})) as { phoneNumberId?: string }
    const phoneNumberId = body.phoneNumberId

    if (!phoneNumberId) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'phoneNumberId is required'
        }
      }, 400)
    }

    const result = await getUserByWabaId(wabaId, c.user.id, c.user.role)

    if ('error' in result) {
      return c.json(result.error, result.status as any)
    }

    const { account } = result

    const targetPhone = await prisma.phoneNumber.findFirst({
      where: {
        phoneNumberId,
        whatsappAccountId: account.id
      }
    })

    if (!targetPhone) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Phone number not found for this WABA'
        }
      }, 404)
    }

    await prisma.$transaction([
      prisma.phoneNumber.updateMany({
        where: { whatsappAccountId: account.id },
        data: { isPrimary: false }
      }),
      prisma.phoneNumber.update({
        where: { phoneNumberId },
        data: { isPrimary: true }
      })
    ])

    await auditLog(
      'SET_PRIMARY_PHONE_NUMBER',
      'PhoneNumber',
      phoneNumberId,
      {
        whatsappAccountId: account.id,
        wabaId,
        phoneNumberId
      },
      c.user.id
    )

    return c.json({
      success: true,
      data: {
        message: 'Primary phone number updated'
      }
    })
  } catch (error: any) {
    console.error('Set primary phone number error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error.message || 'Failed to update primary phone number'
      }
    }, 500)
  }
})

export default app
