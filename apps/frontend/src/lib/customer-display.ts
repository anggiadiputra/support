/**
 * Helper for displaying customer identifiers in the UI.
 *
 * Data model note: `Customer.phoneNumber` in DB can hold either:
 *  - A real phone number (E.164 or normalized 62...)
 *  - A BSUID string (e.g., "US.13491208655302741918") for BSUID-only customers
 *    who have adopted the WhatsApp username feature and no longer expose
 *    their phone number.
 *
 * The BSUID-in-phoneNumber pattern is a deliberate design choice — see
 * docs/plans/2026-07-01-bsuid-username-full-overhaul.md Phase 2 decision.
 * This module abstracts that detail so UI never renders raw values that
 * could be misleading (e.g., "US.134..." labelled as "Phone Number").
 */

/** BSUID format: <ISO country code>.<alphanumeric up to 128 chars> */
const BSUID_REGEX = /^[A-Z]{2}\.(ENT\.)?[a-zA-Z0-9]{1,128}$/

export interface CustomerIdentity {
  name?: string | null
  phoneNumber?: string | null
  whatsappBsuid?: string | null
  whatsappUsername?: string | null
}

function isBsuid(value: string | null | undefined): boolean {
  if (!value) return false
  return BSUID_REGEX.test(value)
}

/**
 * True when the customer has no phone number available.
 * Handles both the workaround (BSUID in phoneNumber column) and the ideal
 * case (whatsappBsuid set, phoneNumber empty).
 */
export function isBsuidOnlyCustomer(customer: CustomerIdentity): boolean {
  if (isBsuid(customer.phoneNumber)) return true
  const trimmed = customer.phoneNumber?.trim()
  if (!trimmed && !!customer.whatsappBsuid) return true
  return false
}

/**
 * Returns the real phone number to display, or null if none.
 * Filters out BSUID strings that happen to live in the phoneNumber column.
 */
export function getDisplayPhoneNumber(customer: CustomerIdentity): string | null {
  const p = customer.phoneNumber?.trim()
  if (!p) return null
  if (isBsuid(p)) return null
  return p
}

/**
 * Returns the BSUID to display, or null if none.
 * Prefers the canonical `whatsappBsuid` column; falls back to `phoneNumber`
 * if it holds a BSUID string.
 */
export function getDisplayBsuid(customer: CustomerIdentity): string | null {
  if (customer.whatsappBsuid) return customer.whatsappBsuid
  if (isBsuid(customer.phoneNumber)) return customer.phoneNumber ?? null
  return null
}

/**
 * Returns the best label for showing a customer in lists/headers.
 * Priority: name → @username → phone → BSUID → "Unknown"
 */
export function getCustomerDisplayName(customer: CustomerIdentity): string {
  if (customer.name?.trim()) return customer.name
  if (customer.whatsappUsername) return `@${customer.whatsappUsername}`
  const phone = getDisplayPhoneNumber(customer)
  if (phone) return phone
  const bsuid = getDisplayBsuid(customer)
  if (bsuid) return bsuid
  return "Unknown"
}

/**
 * Returns the secondary identifier line (e.g., for card subtitle).
 * Skips whichever field was used as primary name.
 */
export function getCustomerSecondaryLabel(customer: CustomerIdentity): string | null {
  const hasName = !!customer.name?.trim()
  const phone = getDisplayPhoneNumber(customer)
  const bsuid = getDisplayBsuid(customer)

  if (hasName) {
    if (customer.whatsappUsername) return `@${customer.whatsappUsername}`
    if (phone) return phone
    if (bsuid) return `BSUID: ${bsuid}`
    return null
  }

  // Name absent — return next-best identifier not already used as primary
  if (customer.whatsappUsername && phone) return phone
  if (bsuid && (phone || customer.whatsappUsername)) return `BSUID: ${bsuid}`
  return null
}
