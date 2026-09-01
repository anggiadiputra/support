/**
 * WhatsApp BSUID (Business-Scoped User ID) Types
 * 
 * Reference: docs/bsuid.md
 * Timeline:
 * - 31 Mar 2026: BSUID appears in webhooks
 * - May 2026: API supports sending via BSUID
 * - Late 2026: Username feature launches
 */

/**
 * Extended WhatsApp contact with BSUID support
 * Used in webhook payloads starting 31 Mar 2026
 */
export interface WhatsAppContactBsuid {
  profile?: {
    name?: string
    /** Username if user enabled the feature (e.g., "@pablomorales") */
    username?: string
  }
  /** Phone number - may be omitted if user enabled username and conditions not met */
  wa_id?: string
  /** Business-Scoped User ID - always present after 31 Mar 2026 */
  user_id?: string
  /** Parent BSUID for linked business portfolios */
  parent_user_id?: string
}

/**
 * Extended incoming message with BSUID support
 */
export interface WhatsAppIncomingMessageBsuid {
  /** Phone number - may be omitted if user enabled username */
  from?: string
  /** BSUID of sender */
  from_user_id?: string
  /** Parent BSUID of sender */
  from_parent_user_id?: string
  /** Group ID if message sent in group */
  group_id?: string
  id: string
  timestamp: string
  type: string
  text?: { body: string }
  image?: { id: string; caption?: string }
  video?: { id: string; caption?: string }
  audio?: { id: string }
  document?: { id: string; caption?: string; filename?: string }
  sticker?: { id: string }
  location?: { latitude: number; longitude: number }
  contacts?: any[]
  reaction?: { emoji?: string; message_id?: string }
  interactive?: any
  button?: any
  context?: {
    from?: string
    id?: string
  }
}

/**
 * Extended status webhook with BSUID support
 */
export interface WhatsAppStatusBsuid {
  id: string
  status: 'sent' | 'delivered' | 'read' | 'failed'
  timestamp: string
  /** Phone number - may be omitted */
  recipient_id?: string
  /** BSUID if message sent to BSUID */
  recipient_user_id?: string
  /**
   * Parent BSUID on the status object. Meta renamed this wire field on
   * 2026-05-05 (was `parent_recipient_user_id`) — use the current name so any
   * reader of `statuses[].recipient_parent_user_id` matches the payload.
   */
  recipient_parent_user_id?: string
  errors?: Array<{
    code: number
    title?: string
    message?: string
  }>
  pricing?: {
    billable: boolean
    pricing_model: string
    type: string
    category: string
  }
}

/**
 * Status webhook contacts array (new in BSUID update)
 */
export interface WhatsAppStatusContactBsuid {
  profile?: {
    name?: string
    username?: string
  }
  wa_id?: string
  user_id?: string
  parent_user_id?: string
}

/**
 * Send message response with BSUID support
 */
export interface WhatsAppSendResponseBsuid {
  messaging_product: 'whatsapp'
  contacts: Array<{
    /** Original input (phone number or BSUID) */
    input: string
    /** Phone number if sent to phone */
    wa_id?: string
    /** BSUID if sent to BSUID or if both provided */
    user_id?: string
  }>
  messages: Array<{
    id: string
    message_status?: string
  }>
}

/**
 * Helper to extract identifier from webhook
 * Returns phone number if available, otherwise BSUID
 */
export function getCustomerIdentifier(
  contact: WhatsAppContactBsuid,
  message?: WhatsAppIncomingMessageBsuid
): { phoneNumber?: string; bsuid?: string; username?: string } {
  return {
    phoneNumber: contact.wa_id || message?.from,
    bsuid: contact.user_id || message?.from_user_id,
    username: contact.profile?.username,
  }
}

/**
 * Check if BSUID is valid format.
 * Regular BSUID: <ISO 3166 alpha-2>.<alphanumeric up to 128 chars>
 *   Example: US.13491208655302741918
 * Parent BSUID: <ISO 3166 alpha-2>.ENT.<alphanumeric up to 128 chars>
 *   Example: US.ENT.11815799212886844830
 * Reference: docs/bsuid.md
 */
export function isValidBsuid(value: string): boolean {
  if (!value || typeof value !== 'string') return false
  const bsuidRegex = /^[A-Z]{2}\.(ENT\.)?[a-zA-Z0-9]{1,128}$/
  return bsuidRegex.test(value)
}

/**
 * Extract country code from BSUID
 */
export function getBsuidCountryCode(bsuid: string): string | null {
  if (!isValidBsuid(bsuid)) return null
  return bsuid.substring(0, 2)
}
