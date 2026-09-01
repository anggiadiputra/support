/**
 * Coexistence API Endpoints
 * Manages WhatsApp Business App + Cloud API coexistence operations
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { wabaService } from '../../services/waba/index.js'
import {
  getWhatsAppAccountByWabaId,
  decryptAccountToken,
} from '../../utils/whatsapp-account-helper.js'

const app = new Hono()

// POST /:wabaId/sync-contacts - Trigger contact synchronization
app.post('/:wabaId/sync-contacts', async (c: Context) => {
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

    // Get WhatsApp account by WABA ID
    const account = await getWhatsAppAccountByWabaId(wabaId)

    if (!account || account.userId !== c.user.id) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'WABA not found'
        }
      }, 404)
    }

    if (!account.isCoexistence) {
      return c.json({
        error: {
          code: 'InvalidOperation',
          message: 'Coexistence is not enabled for this WABA'
        }
      }, 400)
    }

    // Get the primary phone number for this account
    const primaryPhone = account.phoneNumbers.find(p => p.isPrimary) ?? account.phoneNumbers[0]
    if (!primaryPhone) {
      return c.json({
        error: {
          code: 'InvalidState',
          message: 'Phone number ID not found'
        }
      }, 400)
    }

    // Decrypt access token
    const accessToken = decryptAccountToken(account)

    // Trigger contact sync
    const requestId = await wabaService.syncContacts(primaryPhone.phoneNumberId, accessToken)

    // Create or update sync status
    await prisma.coexistenceSyncStatus.upsert({
      where: {
        userId_syncType: {
          userId: account.userId,
          syncType: 'contacts'
        }
      },
      create: {
        userId: account.userId,
        whatsappAccountId: account.id,
        syncType: 'contacts',
        status: 'in_progress',
        requestId,
        progress: 0
      },
      update: {
        status: 'in_progress',
        requestId,
        progress: 0,
        whatsappAccountId: account.id,
        errorMessage: null,
        errorCode: null
      }
    })

    return c.json({
      success: true,
      data: {
        requestId,
        message: 'Contact synchronization initiated'
      }
    })
  } catch (error) {
    console.error('Contact sync error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to sync contacts'
      }
    }, 500)
  }
})

// POST /:wabaId/sync-history - Trigger message history synchronization
app.post('/:wabaId/sync-history', async (c: Context) => {
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

    // Get WhatsApp account by WABA ID
    const account = await getWhatsAppAccountByWabaId(wabaId)

    if (!account || account.userId !== c.user.id) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'WABA not found'
        }
      }, 404)
    }

    if (!account.isCoexistence) {
      return c.json({
        error: {
          code: 'InvalidOperation',
          message: 'Coexistence is not enabled for this WABA'
        }
      }, 400)
    }

    // Get the primary phone number for this account
    const primaryPhone = account.phoneNumbers.find(p => p.isPrimary) ?? account.phoneNumbers[0]
    if (!primaryPhone) {
      return c.json({
        error: {
          code: 'InvalidState',
          message: 'Phone number ID not found'
        }
      }, 400)
    }

    // Decrypt access token
    const accessToken = decryptAccountToken(account)

    // Trigger history sync
    const requestId = await wabaService.syncHistory(primaryPhone.phoneNumberId, accessToken)

    // Create or update sync status
    await prisma.coexistenceSyncStatus.upsert({
      where: {
        userId_syncType: {
          userId: account.userId,
          syncType: 'history'
        }
      },
      create: {
        userId: account.userId,
        whatsappAccountId: account.id,
        syncType: 'history',
        status: 'in_progress',
        requestId,
        progress: 0
      },
      update: {
        status: 'in_progress',
        requestId,
        progress: 0,
        phase: 0,
        whatsappAccountId: account.id,
        errorMessage: null,
        errorCode: null
      }
    })

    return c.json({
      success: true,
      data: {
        requestId,
        message: 'Message history synchronization initiated'
      }
    })
  } catch (error) {
    console.error('History sync error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to sync history'
      }
    }, 500)
  }
})

// GET /:wabaId/sync-status - Get synchronization status
app.get('/:wabaId/sync-status', async (c: Context) => {
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

    // Get WhatsApp account by WABA ID
    const account = await getWhatsAppAccountByWabaId(wabaId)

    if (!account || account.userId !== c.user.id) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'WABA not found'
        }
      }, 404)
    }

    // Get sync status
    const syncStatus = await wabaService.getSyncStatus(account.userId)

    return c.json({
      success: true,
      data: {
        isCoexistence: account.isCoexistence,
        syncStatus: account.coexistenceSyncStatus,
        overallProgress: syncStatus.overallProgress,
        contacts: syncStatus.contacts,
        history: syncStatus.history
      }
    })
  } catch (error) {
    console.error('Get sync status error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get sync status'
      }
    }, 500)
  }
})

// GET /:wabaId/coexistence-status - Check if WABA is using coexistence
app.get('/:wabaId/coexistence-status', async (c: Context) => {
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

    // Get WhatsApp account by WABA ID
    const account = await getWhatsAppAccountByWabaId(wabaId)

    if (!account || account.userId !== c.user.id) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'WABA not found'
        }
      }, 404)
    }

    // Get the primary phone number for this account
    const primaryPhone = account.phoneNumbers.find(p => p.isPrimary) ?? account.phoneNumbers[0]
    if (!primaryPhone) {
      return c.json({
        error: {
          code: 'InvalidState',
          message: 'Phone number ID not found'
        }
      }, 400)
    }

    // Decrypt access token
    const accessToken = decryptAccountToken(account)

    // Check coexistence status from Meta API
    const coexStatus = await wabaService.checkCoexistenceStatus(
      primaryPhone.phoneNumberId,
      accessToken
    )

    // Update WhatsApp account if status changed
    if (coexStatus.isOnBizApp !== account.isCoexistence) {
      await prisma.whatsAppAccount.update({
        where: { id: account.id },
        data: {
          isCoexistence: coexStatus.isOnBizApp
        }
      })
    }

    return c.json({
      success: true,
      data: {
        isOnBizApp: coexStatus.isOnBizApp,
        platformType: coexStatus.platformType,
        isCoexistence: coexStatus.isOnBizApp && coexStatus.platformType === 'CLOUD_API'
      }
    })
  } catch (error) {
    console.error('Get coexistence status error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get coexistence status'
      }
    }, 500)
  }
})

export default app
