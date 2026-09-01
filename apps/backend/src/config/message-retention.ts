/**
 * Message Retention Configuration Constants
 *
 * Shared constants for the message retention system.
 * Used by both the cron job (deleteOldMessages.ts) and admin API (message-retention-settings.ts)
 */

/**
 * System setting category for message retention
 */
export const MESSAGE_RETENTION_CATEGORY = 'message_retention'

/**
 * System setting key for tier-based retention enabled flag
 */
export const TIER_BASED_ENABLED_KEY = 'tier_based_enabled'

/**
 * System setting key for tier-based retention activation timestamp
 */
export const TIER_BASED_ENABLED_AT_KEY = 'tier_based_enabled_at'

/**
 * Retention days for grandfathered messages (messages created before tier-based was enabled)
 */
export const GRANDFATHERED_RETENTION_DAYS = 30
