/**
 * Meta `user_preferences` webhook handler.
 *
 * Triggered when a WhatsApp user toggles "Offers and announcements" for
 * a business (stop / resume marketing messages).
 *
 * Payload reference:
 *   https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/reference/user_preferences/
 *
 * Behavior:
 *   - value === 'stop'   -> Customer.marketingOptOut = true  + MarketingPreferenceLog STOP
 *   - value === 'resume' -> Customer.marketingOptOut = false + MarketingPreferenceLog RESUME
 *
 * Scope: only `category === 'marketing_messages'` is processed.
 * Other categories (if Meta adds more) are ignored — handler is forward-compatible.
 *
 * IMPORTANT: This handler does NOT touch `consentStatus` or `blacklisted`.
 *   Those remain explicit business decisions. Utility / Authentication /
 *   Service templates and freeform (in-window) messages remain unaffected.
 */

import { prisma } from '../../utils/database.js'
import { logger } from '../../utils/logger.js'

interface UserPreferenceItem {
  wa_id?: string
  detail?: string
  category?: string
  value?: 'stop' | 'resume' | string
  timestamp?: number
}

interface UserPreferencesPayload {
  user_preferences?: UserPreferenceItem[]
  metadata?: {
    phone_number_id?: string
    display_phone_number?: string
  }
}

export async function handleUserPreferences(
  value: UserPreferencesPayload,
  user: { id: string } | null,
): Promise<void> {
  if (!user) {
    logger.warn('user_preferences webhook ignored: unresolved user')
    return
  }

  const prefs = value.user_preferences || []
  if (prefs.length === 0) return

  for (const pref of prefs) {
    try {
      if (pref.category !== 'marketing_messages') {
        // Forward-compatible: Meta may add categories later.
        logger.debug('Skipping non-marketing user preference', { category: pref.category })
        continue
      }

      const waId = pref.wa_id
      const rawValue = pref.value
      if (!waId || (rawValue !== 'stop' && rawValue !== 'resume')) {
        logger.warn('user_preferences entry missing wa_id or unknown value', {
          hasWaId: !!waId,
          value: rawValue,
        })
        continue
      }

      const action: 'STOP' | 'RESUME' = rawValue === 'stop' ? 'STOP' : 'RESUME'

      // Locate customer by (userId, phoneNumber). Meta's wa_id maps to E.164
      // without the leading '+'. Our Customer.phoneNumber storage may or may
      // not include '+', so try both forms.
      const customer = await prisma.customer.findFirst({
        where: {
          userId: user.id,
          OR: [
            { phoneNumber: waId },
            { phoneNumber: `+${waId}` },
          ],
        },
        select: { id: true, marketingOptOut: true },
      })

      if (!customer) {
        // Not in our DB — nothing to suppress. Log for audit; don't error.
        logger.info('user_preferences for unknown customer (no row in DB)', {
          userId: user.id,
        })
        continue
      }

      const metaTimestamp = typeof pref.timestamp === 'number' && pref.timestamp > 0
        ? new Date(pref.timestamp * 1000)
        : null

      await prisma.$transaction([
        prisma.customer.update({
          where: { id: customer.id },
          data: action === 'STOP'
            ? {
                marketingOptOut: true,
                marketingOptOutAt: new Date(),
                marketingOptOutSource: 'META_USER_PREFERENCE',
              }
            : {
                marketingOptOut: false,
                marketingOptOutAt: null,
                marketingOptOutSource: null,
              },
        }),
        prisma.marketingPreferenceLog.create({
          data: {
            customerId: customer.id,
            action,
            source: 'META_USER_PREFERENCE',
            detail: pref.detail ?? null,
            metaTimestamp,
          },
        }),
      ])

      logger.info('Marketing preference updated from user_preferences webhook', {
        customerId: customer.id,
        action,
      })
    } catch (err) {
      logger.error('Failed to process user_preferences entry', {
        error: err instanceof Error ? err.message : String(err),
      })
      // Continue with next entry. Do not throw — Meta retries cost more than
      // losing a single log row, and the next stop/resume will reconcile state.
    }
  }
}
