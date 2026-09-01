/**
 * WABA Token Routes
 * Handles token refresh
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { wabaService } from '../../services/waba/index.js'
import { getUserByWabaId } from './helpers.js'
import { WABAError, parseMetaError } from '../../utils/wabaErrors.js'

const app = new Hono()

// POST /refresh-token - Manually refresh access token
app.post('/refresh-token', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
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
          message: 'WABA is not connected. Please reconnect first.'
        }
      }, 400)
    }

    // Check if token exists on the WhatsAppAccount
    if (!account.accessToken || !account.accessTokenIV || !account.accessTokenTag) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'No access token found. Please reconnect WABA.'
        }
      }, 400)
    }

    // Call WABAService to refresh token
    let tokenResponse
    try {
      tokenResponse = await wabaService.refreshAccessToken(wabaId)
    } catch (error: any) {
      console.error('Token refresh error:', error)

      if (error instanceof WABAError) {
        return c.json(error.toJSON(), error.statusCode as any)
      }

      const wabaError = parseMetaError(error)

      await prisma.wABAConnectionLog.create({
        data: {
          userId: user.id,
          whatsappAccountId: account.id,
          action: 'token_refresh_failed',
          errorMessage: wabaError.message,
          details: {
            wabaId,
            code: wabaError.code,
            metaError: wabaError.metaError,
            userId: c.user.id
          }
        }
      })

      return c.json(wabaError.toJSON(), wabaError.statusCode as any)
    }

    // Audit log
    await auditLog(
      'WABA_TOKEN_REFRESHED',
      'WhatsAppAccount',
      account.id,
      {
        wabaId,
        expiresAt: tokenResponse.expiresAt.toISOString(),
        refreshedBy: c.user.id
      },
      c.user.id
    )

    return c.json({
      success: true,
      data: {
        expiresAt: tokenResponse.expiresAt.toISOString(),
        message: 'Access token refreshed successfully'
      }
    })
  } catch (error: any) {
    console.error('Token refresh endpoint error:', error)

    const wabaError = new WABAError(
      'INTERNAL_ERROR' as any,
      error.message || 'Failed to refresh token',
      {
        statusCode: 500,
        retryable: true,
        recoveryAction: 'Please try again or reconnect your WhatsApp account',
        cause: error
      }
    )

    return c.json(wabaError.toJSON(), wabaError.statusCode as any)
  }
})

export default app
