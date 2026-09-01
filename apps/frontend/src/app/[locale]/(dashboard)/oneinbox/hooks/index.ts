/**
 * Unified Inbox Hooks
 * Export all hooks for the unified inbox feature
 */

// Main hook
export { useUnifiedInbox } from "./use-unified-inbox"

// Composed hooks (can be used independently if needed)
export { useCRMData } from "./use-crm-data"
export { useAssignment } from "./use-assignment"
export { useWhatsAppMessaging } from "./use-whatsapp-messaging"
export { useInstagramMessaging } from "./use-instagram-messaging"
export { useMessengerMessaging } from "./use-messenger-messaging"
export { useConversationFilters } from "./use-conversation-filters"
export { useWebSocketHandlers } from "./use-websocket-handlers"
export { useAssignmentHistory, subscribeToAssignmentHistory, notifyAssignmentHistoryUpdate } from "./use-assignment-history"

// Types
export * from "./unified-inbox-types"
