/**
 * useAssignmentHistory Hook
 * Manages assignment history with realtime WebSocket updates
 * 
 * Features:
 * - Initial load from API
 * - Realtime updates via WebSocket assignment_changed events
 * - Optimistic updates for immediate UI feedback
 */

import { useState, useEffect, useCallback, useRef } from "react"
import { assignmentApi } from "@/lib/api/assignment-api"
import type { AssignmentHistoryItem, ChannelType } from "../types/unified-inbox"
import type { AssignmentChangedPayload, AssignmentHistoryItemPayload } from "@/hooks/use-websocket"

interface UseAssignmentHistoryOptions {
  conversationId: string
  conversationType: ChannelType
  enabled?: boolean
}

interface UseAssignmentHistoryReturn {
  history: AssignmentHistoryItem[]
  loading: boolean
  error: string | null
  refetch: () => Promise<void>
}

/**
 * Convert WebSocket history item payload to AssignmentHistoryItem
 */
function convertPayloadToHistoryItem(payload: AssignmentHistoryItemPayload): AssignmentHistoryItem {
  return {
    id: payload.id,
    conversationId: "", // Will be filled by caller
    conversationType: "WHATSAPP", // Will be filled by caller
    assigneeType: payload.assigneeType,
    assigneeId: payload.assigneeId,
    assigneeName: payload.assigneeName,
    aiAgentId: payload.aiAgentId,
    aiAgentName: payload.aiAgentName,
    assignedById: payload.assignedById,
    assignedByName: payload.assignedByName || "Unknown",
    assignedAt: new Date(payload.assignedAt),
    unassignedAt: payload.unassignedAt ? new Date(payload.unassignedAt) : null,
  }
}

/**
 * Global event bus for assignment history updates
 * Components can subscribe to receive realtime updates
 */
type AssignmentHistoryListener = (conversationId: string, conversationType: string, payload: AssignmentChangedPayload) => void
const listeners = new Set<AssignmentHistoryListener>()

export function subscribeToAssignmentHistory(listener: AssignmentHistoryListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function notifyAssignmentHistoryUpdate(conversationId: string, conversationType: string, payload: AssignmentChangedPayload): void {
  listeners.forEach(listener => listener(conversationId, conversationType, payload))
}

export function useAssignmentHistory({
  conversationId,
  conversationType,
  enabled = true,
}: UseAssignmentHistoryOptions): UseAssignmentHistoryReturn {
  const [history, setHistory] = useState<AssignmentHistoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Track current conversation to handle updates correctly
  const currentConversationRef = useRef({ conversationId, conversationType })
  
  // Extract raw conversation ID (remove wa- or ig- prefix)
  const rawConversationId = conversationId.replace(/^(wa|ig|msg)-/, "")

  // Load assignment history from API
  const loadHistory = useCallback(async () => {
    if (!enabled) return
    
    setLoading(true)
    setError(null)
    try {
      const data = await assignmentApi.getAssignmentHistory(rawConversationId, conversationType)
      setHistory(data)
    } catch (err: any) {
      console.error("Failed to load assignment history:", err)
      setError("Failed to load assignment history")
    } finally {
      setLoading(false)
    }
  }, [rawConversationId, conversationType, enabled])

  // Handle WebSocket assignment changed event
  const handleAssignmentChanged = useCallback((
    eventConversationId: string,
    eventConversationType: string,
    payload: AssignmentChangedPayload
  ) => {
    // Only process events for current conversation
    if (eventConversationId !== rawConversationId || 
        eventConversationType.toLowerCase() !== conversationType.toLowerCase()) {
      return
    }

    // If we have a history item in the payload, use it for realtime update
    if (payload.historyItem) {
      const newItem = convertPayloadToHistoryItem(payload.historyItem)
      newItem.conversationId = rawConversationId
      newItem.conversationType = conversationType.toUpperCase() as "WHATSAPP" | "INSTAGRAM" | "MESSENGER"

      if (payload.action === "assigned") {
        // Add new assignment to the top of history
        setHistory(prev => {
          // Check if item already exists (avoid duplicates)
          const exists = prev.some(item => item.id === newItem.id)
          if (exists) {
            // Update existing item
            return prev.map(item => item.id === newItem.id ? newItem : item)
          }
          // Add to top (newest first)
          return [newItem, ...prev]
        })
      } else if (payload.action === "unassigned") {
        // Update existing assignment with unassignedAt
        setHistory(prev => prev.map(item => {
          if (item.id === newItem.id) {
            return { ...item, unassignedAt: newItem.unassignedAt }
          }
          return item
        }))
      }
    } else {
      // Fallback: refetch if no history item in payload
      loadHistory()
    }
  }, [rawConversationId, conversationType, loadHistory])

  // Subscribe to global assignment history updates
  useEffect(() => {
    if (!enabled) return
    
    const unsubscribe = subscribeToAssignmentHistory(handleAssignmentChanged)
    return unsubscribe
  }, [enabled, handleAssignmentChanged])

  // Update ref when conversation changes
  useEffect(() => {
    currentConversationRef.current = { conversationId, conversationType }
  }, [conversationId, conversationType])

  // Load history on mount and when conversation changes
  useEffect(() => {
    if (enabled) {
      loadHistory()
    }
  }, [rawConversationId, conversationType, enabled, loadHistory])

  return {
    history,
    loading,
    error,
    refetch: loadHistory,
  }
}
