/**
 * useWebSocketHandlers Hook
 * Handles WebSocket event handlers for real-time updates
 */

import { useCallback, useRef, useEffect } from "react"
import type {
  NewMessageEvent,
  ConversationUpdatedEvent,
  UnreadCountUpdatedEvent,
  AssignmentChangedEvent,
  OutboundMessageEvent,
} from "@/hooks/use-websocket"
import type { UnifiedConversation, Customer } from "./unified-inbox-types"
import { notifyAssignmentHistoryUpdate } from "./use-assignment-history"

interface UseWebSocketHandlersOptions {
  selectedConversation: UnifiedConversation | null
  setConversations: React.Dispatch<React.SetStateAction<UnifiedConversation[]>>
  setSelectedConversation: React.Dispatch<React.SetStateAction<UnifiedConversation | null>>
  loadConversations: () => Promise<void>
  refreshSelectedConversationMessages: () => Promise<void>
}

export function useWebSocketHandlers({
  selectedConversation,
  setConversations,
  setSelectedConversation,
  loadConversations,
  refreshSelectedConversationMessages,
}: UseWebSocketHandlersOptions) {
  // Ref to track selected conversation for WebSocket handlers
  const selectedConversationRef = useRef<UnifiedConversation | null>(null)
  
  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  // Handle new message from WebSocket
  const handleNewMessage = useCallback((event: NewMessageEvent) => {
    // Refresh conversations to get the new message
    loadConversations()

    // If the message is for the currently selected conversation, refresh messages
    const currentConversation = selectedConversationRef.current
    if (currentConversation) {
      const isCurrentConversation =
        (event.payload.channel === "whatsapp" &&
          currentConversation.channel === "whatsapp" &&
          currentConversation.participantIdentifier === event.payload.participantId) ||
        (event.payload.channel === "instagram" &&
          currentConversation.channel === "instagram" &&
          event.payload.conversationId === currentConversation.id) ||
        (event.payload.channel === "messenger" &&
          currentConversation.channel === "messenger" &&
          event.payload.conversationId === currentConversation.id)

      if (isCurrentConversation) {
        refreshSelectedConversationMessages()
      }
    }
  }, [loadConversations, refreshSelectedConversationMessages])

  // Handle conversation updated from WebSocket
  const handleConversationUpdated = useCallback((event: ConversationUpdatedEvent) => {
    // Update the specific conversation in state
    setConversations(prev => prev.map(conv => {
      if (conv.id === event.payload.conversationId) {
        return {
          ...conv,
          unreadCount: event.payload.changes.unreadCount ?? conv.unreadCount,
          lastMessageAt: event.payload.changes.lastMessageAt
            ? new Date(event.payload.changes.lastMessageAt)
            : conv.lastMessageAt,
        }
      }
      return conv
    }))
  }, [setConversations])

  // Handle unread count updated from WebSocket (Requirements: 4.1, 4.2)
  const handleUnreadCountUpdated = useCallback((event: UnreadCountUpdatedEvent) => {
    // Update the unread count for the specific WhatsApp conversation
    setConversations(prev => prev.map(conv => {
      // Match WhatsApp conversations by customer ID
      if (conv.channel === "whatsapp") {
        const customer = conv.originalData as Customer
        if (customer.id === event.payload.customerId) {
          return {
            ...conv,
            unreadCount: event.payload.unreadCount,
          }
        }
      }
      return conv
    }))
  }, [setConversations])

  // Handle assignment changed from WebSocket (Requirements: 2.4, 2.5)
  const handleAssignmentChanged = useCallback((event: AssignmentChangedEvent) => {
    const { conversationId, conversationType, assigneeId, assigneeName, assigneeType, aiAgentId, aiAgentName, action } = event.payload
    
    // Build the prefixed conversation ID to match our internal format
    const prefixMap: Record<string, string> = {
      whatsapp: "wa-",
      instagram: "ig-",
      messenger: "msg-"
    }
    const prefix = prefixMap[conversationType] || "wa-"
    const prefixedConversationId = `${prefix}${conversationId}`

    // Resolve values with proper null handling
    const resolvedAssigneeId = assigneeType === "AI_AGENT" ? (aiAgentId ?? null) : assigneeId
    const resolvedAssigneeName = assigneeType === "AI_AGENT" ? (aiAgentName ?? null) : assigneeName
    const resolvedAssigneeType = assigneeType ?? "HUMAN"
    const resolvedAiAgentId = aiAgentId ?? null
    const resolvedAiAgentName = aiAgentName ?? null

    // Update the conversation in state
    setConversations(prev => prev.map(conv => {
      if (conv.id === prefixedConversationId) {
        if (action === "assigned") {
          return {
            ...conv,
            assigneeId: resolvedAssigneeId,
            assigneeName: resolvedAssigneeName,
            assigneeType: resolvedAssigneeType,
            aiAgentId: resolvedAiAgentId,
            aiAgentName: resolvedAiAgentName,
            assigneeImage: null, // Will be loaded separately if needed
            assignedAt: new Date(),
          }
        } else {
          // unassigned
          return {
            ...conv,
            assigneeId: null,
            assigneeName: null,
            assigneeType: "HUMAN" as const,
            aiAgentId: null,
            aiAgentName: null,
            assigneeImage: null,
            assignedAt: null,
          }
        }
      }
      return conv
    }))

    // Also update selected conversation if it's the same
    setSelectedConversation(prev => {
      if (prev?.id === prefixedConversationId) {
        if (action === "assigned") {
          return {
            ...prev,
            assigneeId: resolvedAssigneeId,
            assigneeName: resolvedAssigneeName,
            assigneeType: resolvedAssigneeType,
            aiAgentId: resolvedAiAgentId,
            aiAgentName: resolvedAiAgentName,
            assigneeImage: null,
            assignedAt: new Date(),
          }
        } else {
          return {
            ...prev,
            assigneeId: null,
            assigneeName: null,
            assigneeType: "HUMAN" as const,
            aiAgentId: null,
            aiAgentName: null,
            assigneeImage: null,
            assignedAt: null,
          }
        }
      }
      return prev
    })

    // Notify assignment history listeners for realtime updates
    notifyAssignmentHistoryUpdate(conversationId, conversationType, event.payload)
  }, [setConversations, setSelectedConversation])

  // Handle outbound message from WebSocket
  // This ensures all team members see messages sent by colleagues
  const handleOutboundMessage = useCallback((event: OutboundMessageEvent) => {
    const { conversationId, channel } = event.payload
    
    // Refresh conversations to get the new message
    loadConversations()

    // If the message is for the currently selected conversation, refresh messages
    const currentConversation = selectedConversationRef.current
    if (currentConversation) {
      // Build the prefixed conversation ID to match our internal format
      const prefixMap: Record<string, string> = {
        whatsapp: "wa-",
        instagram: "ig-",
        messenger: "msg-"
      }
      const prefix = prefixMap[channel] || "wa-"
      const prefixedConversationId = `${prefix}${conversationId}`

      if (currentConversation.id === prefixedConversationId) {
        refreshSelectedConversationMessages()
      }
    }
  }, [loadConversations, refreshSelectedConversationMessages])

  return {
    handleNewMessage,
    handleConversationUpdated,
    handleUnreadCountUpdated,
    handleAssignmentChanged,
    handleOutboundMessage,
  }
}
