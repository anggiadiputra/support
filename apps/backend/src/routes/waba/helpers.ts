/**
 * WABA Route Helpers
 * Shared utilities for WABA routes
 */

import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import {
  getWhatsAppAccountByWabaId,
  type WhatsAppAccountWithRelations,
} from '../../utils/whatsapp-account-helper.js'

/**
 * Result type when a WhatsApp account is found successfully
 */
export interface GetAccountResult {
  account: WhatsAppAccountWithRelations
  user: WhatsAppAccountWithRelations['user']
}

/**
 * Get WhatsApp account by WABA ID with access check.
 * Returns the WhatsAppAccount (with phoneNumbers and user) or an error.
 */
export async function getUserByWabaId(
  wabaId: string,
  currentUserId: string,
  currentUserRole: string
): Promise<GetAccountResult | { error: any; status: number }> {
  const account = await getWhatsAppAccountByWabaId(wabaId)

  if (!account) {
    return {
      error: {
        code: 'NotFound',
        message: 'WABA not found'
      },
      status: 404
    }
  }

  // Check access - user can only access their own WABA (unless ADMIN)
  if (currentUserRole !== 'ADMIN' && account.userId !== currentUserId) {
    return {
      error: {
        code: 'Forbidden',
        message: 'Access denied to this WABA',
        details: {
          reason: 'You do not have access to this WABA',
          yourUserId: currentUserId,
          wabaUserId: account.userId
        }
      },
      status: 403
    }
  }

  return { account, user: account.user }
}

/**
 * Check if user has WABA connected
 */
export function requireWABA(c: Context) {
  if (!c.user) {
    return c.json({
      error: {
        code: 'Unauthorized',
        message: 'Authentication required'
      }
    }, 401)
  }

  return null
}
