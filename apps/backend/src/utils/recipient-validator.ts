import { isValidBsuid } from '../types/whatsapp-bsuid.js'

/**
 * Recipient classification for Meta WhatsApp Cloud API.
 *
 * Per docs/bsuid.md, Meta accepts EITHER:
 *  - `to` (phone number, E.164) — routed here as kind='phone'
 *  - `recipient` (BSUID or parent BSUID) — routed here as kind='bsuid'
 *
 * WhatsApp username is NOT a valid `recipient` parameter. Usernames only
 * appear in webhook payloads (customer-side identifier). To message a user
 * known only by username, resolve the username to their BSUID via internal
 * customer lookup (`prisma.customer.findFirst({ where: { whatsappUsername } })`),
 * then send with `recipient: <bsuid>`.
 */
export type RecipientKind = 'phone' | 'bsuid' | 'invalid'

export interface ValidatedRecipient {
  kind: RecipientKind
  /** Normalised value (phone without spaces/dashes) */
  value: string
  /** Original input as provided by caller */
  original: string
}

/**
 * Classify a recipient string as phone / BSUID / invalid.
 * Phone must be E.164 (+ country code + 10-15 digits).
 * BSUID follows the format documented in docs/bsuid.md (regular or parent).
 */
export function validateRecipient(input: string | null | undefined): ValidatedRecipient {
  const original = input ?? ''
  const trimmed = original.trim()
  if (!trimmed) return { kind: 'invalid', value: '', original }

  // Phone: strip spaces/dashes, must match E.164 exactly
  const phoneCandidate = trimmed.replace(/[\s-]/g, '')
  if (/^\+[1-9]\d{9,14}$/.test(phoneCandidate)) {
    return { kind: 'phone', value: phoneCandidate, original }
  }

  // BSUID (regular or parent)
  if (isValidBsuid(trimmed)) {
    return { kind: 'bsuid', value: trimmed, original }
  }

  return { kind: 'invalid', value: trimmed, original }
}
