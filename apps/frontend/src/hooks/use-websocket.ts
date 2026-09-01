/**
 * useWebSocket Hook
 * Manages Socket.IO client connection with reconnection logic and visibility-based management
 */

import { useEffect, useRef, useCallback, useState } from "react"
import { io, Socket } from "socket.io-client"

// ============================================
// Types (mirrored from backend for client use)
// ============================================

export type WebSocketEventType =
  | "new_message"
  | "message_status"
  | "conversation_updated"
  | "typing_indicator"
  | "unread_count_updated"
  | "assignment_changed"
  | "outbound_message"
  | "new_notification"

export interface NewMessagePayload {
  conversationId: string
  channel: "whatsapp" | "instagram" | "messenger"
  participantId: string
  participantName: string | null
  message: {
    id: string
    preview: string
    timestamp: string
    direction: "inbound" | "outbound"
  }
}

export interface ConversationUpdatedPayload {
  conversationId: string
  changes: {
    unreadCount?: number
    lastMessageAt?: string
    isWindowActive?: boolean
  }
}

export interface MessageStatusPayload {
  messageId: string
  conversationId: string
  status: "sent" | "delivered" | "read" | "failed"
}

export interface TypingIndicatorPayload {
  conversationId: string
  isTyping: boolean
}

/**
 * Payload for unread_count_updated event
 * Emitted when unread count changes for a customer (new message or mark as read)
 * Requirements: 4.1, 4.2
 */
export interface UnreadCountUpdatedPayload {
  customerId: string
  channel: "whatsapp"
  unreadCount: number
}

export interface BaseEvent {
  type: WebSocketEventType
  timestamp: string
  userId: string
}

export interface NewMessageEvent extends BaseEvent {
  type: "new_message"
  payload: NewMessagePayload
}

export interface ConversationUpdatedEvent extends BaseEvent {
  type: "conversation_updated"
  payload: ConversationUpdatedPayload
}

export interface MessageStatusEvent extends BaseEvent {
  type: "message_status"
  payload: MessageStatusPayload
}

export interface TypingIndicatorEvent extends BaseEvent {
  type: "typing_indicator"
  payload: TypingIndicatorPayload
}

/**
 * Event for unread count updates
 * Requirements: 4.1, 4.2
 */
export interface UnreadCountUpdatedEvent extends BaseEvent {
  type: "unread_count_updated"
  payload: UnreadCountUpdatedPayload
}

/**
 * Assignment history item from WebSocket event
 * Used for realtime updates to assignment history
 */
export interface AssignmentHistoryItemPayload {
  id: string
  assigneeId: string | null
  assigneeName: string | null
  assigneeType: "HUMAN" | "AI_AGENT"
  aiAgentId: string | null
  aiAgentName: string | null
  assignedById: string
  assignedByName: string | null
  assignedAt: string
  unassignedAt: string | null
}

/**
 * Payload for assignment_changed event
 * Emitted when a conversation is assigned or unassigned
 * Requirements: 2.4
 */
export interface AssignmentChangedPayload {
  conversationId: string
  conversationType: "whatsapp" | "instagram" | "messenger"
  assigneeId: string | null
  assigneeName: string | null
  assigneeType?: "HUMAN" | "AI_AGENT"
  aiAgentId?: string | null
  aiAgentName?: string | null
  assignedById: string
  assignedByName?: string | null
  action: "assigned" | "unassigned"
  // History item for realtime updates
  historyItem?: AssignmentHistoryItemPayload
}

/**
 * Event for assignment changes
 * Requirements: 2.4
 */
export interface AssignmentChangedEvent extends BaseEvent {
  type: "assignment_changed"
  payload: AssignmentChangedPayload
}

/**
 * Payload for outbound_message event
 * Emitted when an outbound message is sent (by human or AI agent)
 */
export interface OutboundMessagePayload {
  conversationId: string
  channel: "whatsapp" | "instagram" | "messenger"
  message: {
    id: string
    content: string
    contentType: "text" | "image" | "video" | "audio" | "document" | "template" | "interactive"
    timestamp: string
    senderId: string
    senderName: string
    senderType: "human" | "ai_agent"
  }
}

/**
 * Event for outbound messages
 */
export interface OutboundMessageEvent extends BaseEvent {
  type: "outbound_message"
  payload: OutboundMessagePayload
}

/**
 * Payload for new_notification event
 * Emitted when a new notification is created for the user
 */
export interface NewNotificationPayload {
  id: string
  type: string
  title: string
  message: string
  priority: string
  actionUrl?: string | null
  actionLabel?: string | null
  isRead: boolean
  createdAt: string
}

/**
 * Event for new notifications
 */
export interface NewNotificationEvent {
  type: "new_notification"
  payload: NewNotificationPayload
}

// ============================================
// Hook Types
// ============================================

export type ConnectionMode = "websocket" | "polling" | "disconnected"

export interface WebSocketState {
  isConnected: boolean
  isReconnecting: boolean
  connectionMode: ConnectionMode
  lastEventAt: Date | null
  reconnectAttempts: number
}

export interface UseWebSocketOptions {
  onNewMessage?: (event: NewMessageEvent) => void
  onConversationUpdated?: (event: ConversationUpdatedEvent) => void
  onMessageStatus?: (event: MessageStatusEvent) => void
  onTypingIndicator?: (event: TypingIndicatorEvent) => void
  onUnreadCountUpdated?: (event: UnreadCountUpdatedEvent) => void
  onAssignmentChanged?: (event: AssignmentChangedEvent) => void
  onOutboundMessage?: (event: OutboundMessageEvent) => void
  onNewNotification?: (event: NewNotificationEvent) => void
  onConnectionChange?: (state: WebSocketState) => void
  enabled?: boolean
}

export interface UseWebSocketReturn {
  state: WebSocketState
  connect: () => void
  disconnect: () => void
}

// ============================================
// Constants
// ============================================

const INITIAL_RECONNECT_DELAY = 1000 // 1 second
const MAX_RECONNECT_DELAY = 30000 // 30 seconds
const RECONNECT_MULTIPLIER = 2
const MAX_RECONNECT_ATTEMPTS_BEFORE_POLLING = 3

// ============================================
// Hook Implementation
// ============================================

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    onNewMessage,
    onConversationUpdated,
    onMessageStatus,
    onTypingIndicator,
    onUnreadCountUpdated,
    onAssignmentChanged,
    onOutboundMessage,
    onNewNotification,
    onConnectionChange,
    enabled = true,
  } = options

  // Connection state
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    isReconnecting: false,
    connectionMode: "disconnected",
    lastEventAt: null,
    reconnectAttempts: 0,
  })

  // Refs for stable references
  const socketRef = useRef<Socket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const isVisibleRef = useRef(true)
  const enabledRef = useRef(enabled)

  // Refs for callbacks to avoid stale closures in event listeners
  const onNewMessageRef = useRef(onNewMessage)
  const onConversationUpdatedRef = useRef(onConversationUpdated)
  const onMessageStatusRef = useRef(onMessageStatus)
  const onTypingIndicatorRef = useRef(onTypingIndicator)
  const onUnreadCountUpdatedRef = useRef(onUnreadCountUpdated)
  const onAssignmentChangedRef = useRef(onAssignmentChanged)
  const onOutboundMessageRef = useRef(onOutboundMessage)
  const onNewNotificationRef = useRef(onNewNotification)

  // Update refs when callbacks change
  useEffect(() => {
    onNewMessageRef.current = onNewMessage
    onConversationUpdatedRef.current = onConversationUpdated
    onMessageStatusRef.current = onMessageStatus
    onTypingIndicatorRef.current = onTypingIndicator
    onUnreadCountUpdatedRef.current = onUnreadCountUpdated
    onAssignmentChangedRef.current = onAssignmentChanged
    onOutboundMessageRef.current = onOutboundMessage
    onNewNotificationRef.current = onNewNotification
  }, [onNewMessage, onConversationUpdated, onMessageStatus, onTypingIndicator, onUnreadCountUpdated, onAssignmentChanged, onOutboundMessage, onNewNotification])

  // Update enabled ref when prop changes
  useEffect(() => {
    enabledRef.current = enabled
  }, [enabled])

  // Update state helper
  const updateState = useCallback((updates: Partial<WebSocketState>) => {
    setState((prev) => {
      const newState = { ...prev, ...updates }
      return newState
    })
  }, [])

  // Notify connection change
  const notifyConnectionChange = useCallback(
    (newState: WebSocketState) => {
      onConnectionChange?.(newState)
    },
    [onConnectionChange]
  )

  // Calculate reconnect delay with exponential backoff
  const getReconnectDelay = useCallback((attempts: number): number => {
    const delay = INITIAL_RECONNECT_DELAY * Math.pow(RECONNECT_MULTIPLIER, attempts)
    return Math.min(delay, MAX_RECONNECT_DELAY)
  }, [])

  // Clear reconnect timeout
  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
  }, [])

  // Setup event listeners
  const setupEventListeners = useCallback(
    (socket: Socket) => {
      // New message event
      socket.on("new_message", (event: NewMessageEvent) => {
        updateState({ lastEventAt: new Date() })
        onNewMessageRef.current?.(event)
      })

      // Conversation updated event
      socket.on("conversation_updated", (event: ConversationUpdatedEvent) => {
        updateState({ lastEventAt: new Date() })
        onConversationUpdatedRef.current?.(event)
      })

      // Message status event
      socket.on("message_status", (event: MessageStatusEvent) => {
        updateState({ lastEventAt: new Date() })
        onMessageStatusRef.current?.(event)
      })

      // Typing indicator event
      socket.on("typing_indicator", (event: TypingIndicatorEvent) => {
        updateState({ lastEventAt: new Date() })
        onTypingIndicatorRef.current?.(event)
      })

      // Unread count updated event (Requirements: 4.1, 4.2)
      socket.on("unread_count_updated", (event: UnreadCountUpdatedEvent) => {
        updateState({ lastEventAt: new Date() })
        onUnreadCountUpdatedRef.current?.(event)
      })

      // Assignment changed event (Requirements: 2.4)
      socket.on("assignment_changed", (event: AssignmentChangedEvent) => {
        updateState({ lastEventAt: new Date() })
        onAssignmentChangedRef.current?.(event)
      })

      // Outbound message event
      socket.on("outbound_message", (event: OutboundMessageEvent) => {
        updateState({ lastEventAt: new Date() })
        onOutboundMessageRef.current?.(event)
      })

      // New notification event
      socket.on("new_notification", (event: NewNotificationEvent) => {
        updateState({ lastEventAt: new Date() })
        onNewNotificationRef.current?.(event)
      })
    },
    [updateState]
  )

  // Connect to WebSocket server
  const connect = useCallback(() => {
    // Don't connect if disabled or already connected
    if (!enabledRef.current || socketRef.current?.connected) {
      return
    }

    // Don't connect if tab is hidden
    if (!isVisibleRef.current) {
      return
    }

    clearReconnectTimeout()

    const wsUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

    // Create socket connection
    const socket = io(wsUrl, {
      withCredentials: true,
      transports: ["websocket", "polling"],
      reconnection: false, // We handle reconnection manually for exponential backoff
      timeout: 10000,
    })

    socketRef.current = socket

    // Connection established
    socket.on("connect", () => {
      reconnectAttemptsRef.current = 0

      const newState: WebSocketState = {
        isConnected: true,
        isReconnecting: false,
        connectionMode: "websocket",
        lastEventAt: null,
        reconnectAttempts: 0,
      }
      updateState(newState)
      notifyConnectionChange(newState)
    })

    // Connection error
    socket.on("connect_error", () => {
      handleReconnect()
    })

    // Disconnected
    socket.on("disconnect", (reason) => {

      // Don't reconnect if intentionally disconnected
      if (reason === "io client disconnect") {
        const newState: WebSocketState = {
          isConnected: false,
          isReconnecting: false,
          connectionMode: "disconnected",
          lastEventAt: state.lastEventAt,
          reconnectAttempts: 0,
        }
        updateState(newState)
        notifyConnectionChange(newState)
        return
      }

      // Attempt reconnection for other disconnect reasons
      handleReconnect()
    })

    // Setup event listeners
    setupEventListeners(socket)
  }, [clearReconnectTimeout, setupEventListeners, updateState, notifyConnectionChange, state.lastEventAt])

  // Handle reconnection with exponential backoff
  const handleReconnect = useCallback(() => {
    if (!enabledRef.current || !isVisibleRef.current) {
      return
    }

    reconnectAttemptsRef.current += 1
    const attempts = reconnectAttemptsRef.current

    // Determine connection mode based on attempts
    const connectionMode: ConnectionMode =
      attempts > MAX_RECONNECT_ATTEMPTS_BEFORE_POLLING ? "polling" : "disconnected"

    const newState: WebSocketState = {
      isConnected: false,
      isReconnecting: true,
      connectionMode,
      lastEventAt: state.lastEventAt,
      reconnectAttempts: attempts,
    }
    updateState(newState)
    notifyConnectionChange(newState)

    // Calculate delay and schedule reconnect
    const delay = getReconnectDelay(attempts - 1)

    reconnectTimeoutRef.current = setTimeout(() => {
      // Clean up old socket
      if (socketRef.current) {
        socketRef.current.removeAllListeners()
        socketRef.current.close()
        socketRef.current = null
      }
      connect()
    }, delay)
  }, [connect, getReconnectDelay, updateState, notifyConnectionChange, state.lastEventAt])

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    clearReconnectTimeout()
    reconnectAttemptsRef.current = 0

    if (socketRef.current) {
      socketRef.current.removeAllListeners()
      socketRef.current.disconnect()
      socketRef.current = null
    }

    const newState: WebSocketState = {
      isConnected: false,
      isReconnecting: false,
      connectionMode: "disconnected",
      lastEventAt: state.lastEventAt,
      reconnectAttempts: 0,
    }
    updateState(newState)
    notifyConnectionChange(newState)
  }, [clearReconnectTimeout, updateState, notifyConnectionChange, state.lastEventAt])

  // Handle visibility change
  const handleVisibilityChange = useCallback(() => {
    const isVisible = document.visibilityState === "visible"
    isVisibleRef.current = isVisible

    if (isVisible) {
      // Tab became visible - reconnect if not connected
      if (!socketRef.current?.connected && enabledRef.current) {
        connect()
      }
    } else {
      // Tab hidden - keep connection alive for real-time messages
    }
  }, [connect])

  // Setup visibility listener
  useEffect(() => {
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [handleVisibilityChange])

  // Connect on mount if enabled
  useEffect(() => {
    if (enabled && isVisibleRef.current) {
      connect()
    }

    return () => {
      disconnect()
    }
  }, [enabled]) // Only depend on enabled, not connect/disconnect to avoid loops

  return {
    state,
    connect,
    disconnect,
  }
}
