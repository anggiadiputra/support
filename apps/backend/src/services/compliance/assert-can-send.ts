/**
 * Centralized WhatsApp send compliance check.
 *
 * Single entry point for "can I send this message to this customer?".
 * Encodes Meta's policy:
 *
 *   - Blacklisted customer        -> block everything
 *   - MARKETING template          -> requires consentStatus=true AND marketingOptOut=false
 *   - UTILITY / AUTHENTICATION    -> only blacklist check (consent recommended but
 *                                    Meta does not block these on opt-out)
 *   - SERVICE / freeform message  -> requires open 24h customer-service window
 *
 * Usage from a Hono route:
 *
 *   const check = await assertCanSend(customerId,
 *     data.type === 'template'
 *       ? { kind: 'template', category: dbTemplate.category }
 *       : { kind: 'freeform' }
 *   )
 *   if (!check.ok) {
 *     return c.json({ error: { code: check.code, message: check.message, ...check.meta } }, check.httpStatus)
 *   }
 */

import { prisma } from '../../utils/database.js'
import { canSendFreeMessage } from '../../utils/messageWindow.js'

export type TemplateCategory = 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | 'SERVICE'

export type SendIntent =
  | { kind: 'freeform' }
  | { kind: 'template'; category: TemplateCategory }

export type ComplianceErrorCode =
  | 'CustomerNotFound'
  | 'Blacklisted'
  | 'ConsentRequired'
  | 'MarketingOptedOut'
  | 'WindowExpired'

export interface ComplianceCustomer {
  id: string
  phoneNumber: string
}

// Single shape (not a discriminated union) — keeps narrowing simple under the
// project's relaxed tsconfig (strictNullChecks: false). Callers check `ok`
// and access `code`/`message`/`httpStatus`/`meta` only on the failure branch.
export interface ComplianceResult {
  ok: boolean
  customer?: ComplianceCustomer
  code?: ComplianceErrorCode
  message?: string
  httpStatus?: 400 | 403
  meta?: Record<string, unknown>
}

export async function assertCanSend(
  customerId: string,
  intent: SendIntent,
): Promise<ComplianceResult> {
  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      phoneNumber: true,
      consentStatus: true,
      blacklisted: true,
      marketingOptOut: true,
    },
  })

  if (!customer) {
    return {
      ok: false,
      code: 'CustomerNotFound',
      message: 'Customer not found',
      httpStatus: 400,
    }
  }

  // 1. Blacklist applies to everything.
  if (customer.blacklisted) {
    return {
      ok: false,
      code: 'Blacklisted',
      message: 'Customer is blacklisted',
      httpStatus: 400,
    }
  }

  // 2. Template-specific checks.
  if (intent.kind === 'template') {
    if (intent.category === 'MARKETING') {
      if (!customer.consentStatus) {
        return {
          ok: false,
          code: 'ConsentRequired',
          message: 'Customer has not consented to marketing messages',
          httpStatus: 400,
        }
      }
      if (customer.marketingOptOut) {
        return {
          ok: false,
          code: 'MarketingOptedOut',
          message: 'Customer has opted out of marketing messages',
          httpStatus: 400,
        }
      }
    }
    // UTILITY / AUTHENTICATION / SERVICE templates: allowed past blacklist.
    return {
      ok: true,
      customer: { id: customer.id, phoneNumber: customer.phoneNumber },
    }
  }

  // 3. Freeform requires open 24h window.
  const window = await canSendFreeMessage(customer.id)
  if (!window.allowed) {
    const windowStatus = window.windowStatus
    const hoursAgo = windowStatus?.windowExpiresAt
      ? Math.floor(
          (Date.now() - new Date(windowStatus.windowExpiresAt).getTime()) / 1000 / 3600,
        )
      : null

    return {
      ok: false,
      code: 'WindowExpired',
      message: window.reason || '24-hour window expired. Use message template.',
      httpStatus: 403,
      meta: {
        windowStatus: {
          expired: true,
          expiredAt: windowStatus?.windowExpiresAt,
          expiredHoursAgo: hoursAgo,
          lastInboundAt: windowStatus?.lastInboundMessageAt,
        },
      },
    }
  }

  return {
    ok: true,
    customer: { id: customer.id, phoneNumber: customer.phoneNumber },
  }
}
