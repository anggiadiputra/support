import type { Socket } from 'socket.io'
import { z } from 'zod'

// Authenticated socket with user info attached
export interface AuthenticatedSocket extends Socket {
  userId: string
  sessionId: string
  userAgent?: string
  businessOwnerId: string
}

// WebSocket event types
export type WebSocketEventType = 
  | 'new_message'
  | 'message_status'
  | 'conversation_updated'
  | 'typing_indicator'
  | 'assignment_changed'
  | 'outbound_message'
  | 'new_notification'

// ============================================
// Zod Validation Schemas
// ============================================

// Channel schema
const channelSchema = z.enum(['whatsapp', 'instagram', 'messenger'])

// Message direction schema
const messageDirectionSchema = z.enum(['inbound', 'outbound'])

// Message status schema
const messageStatusSchema = z.enum(['sent', 'delivered', 'read', 'failed'])

// New message event payload schema
export const newMessagePayloadSchema = z.object({
  conversationId: z.string().min(1),
  channel: channelSchema,
  participantId: z.string().min(1),
  participantName: z.string().nullable(),
  message: z.object({
    id: z.string().min(1),
    preview: z.string().max(100), // First 100 chars as per design
    timestamp: z.string().datetime(),
    direction: messageDirectionSchema
  })
})

// Conversation updated event payload schema
export const conversationUpdatedPayloadSchema = z.object({
  conversationId: z.string().min(1),
  changes: z.object({
    unreadCount: z.number().int().min(0).optional(),
    lastMessageAt: z.string().datetime().optional(),
    isWindowActive: z.boolean().optional()
  })
})

// Message status event payload schema
export const messageStatusPayloadSchema = z.object({
  messageId: z.string().min(1),
  conversationId: z.string().min(1),
  status: messageStatusSchema,
  // Error details for failed messages
  errorCode: z.string().optional(),
  errorMessage: z.string().optional()
})

// Typing indicator event payload schema
export const typingIndicatorPayloadSchema = z.object({
  conversationId: z.string().min(1),
  isTyping: z.boolean()
})

// Conversation type schema for assignment
const conversationTypeSchema = z.enum(['whatsapp', 'instagram', 'messenger'])

// Assignment action schema
const assignmentActionSchema = z.enum(['assigned', 'unassigned'])

// Assignment history item schema (for realtime updates)
const assignmentHistoryItemSchema = z.object({
  id: z.string().min(1),
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  assigneeType: z.enum(['HUMAN', 'AI_AGENT']),
  aiAgentId: z.string().nullable(),
  aiAgentName: z.string().nullable(),
  assignedById: z.string().min(1),
  assignedByName: z.string().nullable(),
  assignedAt: z.string().datetime(),
  unassignedAt: z.string().datetime().nullable(),
})

// Assignment changed event payload schema
export const assignmentChangedPayloadSchema = z.object({
  conversationId: z.string().min(1),
  conversationType: conversationTypeSchema,
  assigneeId: z.string().nullable(),
  assigneeName: z.string().nullable(),
  assigneeType: z.enum(['HUMAN', 'AI_AGENT']).optional(),
  aiAgentId: z.string().nullable().optional(),
  aiAgentName: z.string().nullable().optional(),
  assignedById: z.string().min(1),
  assignedByName: z.string().nullable().optional(),
  action: assignmentActionSchema,
  // History item for realtime updates
  historyItem: assignmentHistoryItemSchema.optional(),
})

// Outbound message event payload schema
export const outboundMessagePayloadSchema = z.object({
  conversationId: z.string().min(1),
  channel: channelSchema,
  message: z.object({
    id: z.string().min(1),
    content: z.string(),
    contentType: z.enum(['text', 'image', 'video', 'audio', 'document', 'template', 'interactive']),
    timestamp: z.string().datetime(),
    senderId: z.string().min(1),
    senderName: z.string(),
    senderType: z.enum(['human', 'ai_agent'])
  })
})

// New notification event payload schema
export const newNotificationPayloadSchema = z.object({
  id: z.string().min(1),
  type: z.string(),
  title: z.string(),
  message: z.string(),
  priority: z.string(),
  actionUrl: z.string().nullable().optional(),
  actionLabel: z.string().nullable().optional(),
  isRead: z.boolean(),
  createdAt: z.string().datetime(),
})

// Full event schemas with type discriminator
export const newMessageEventSchema = z.object({
  type: z.literal('new_message'),
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  payload: newMessagePayloadSchema
})

export const conversationUpdatedEventSchema = z.object({
  type: z.literal('conversation_updated'),
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  payload: conversationUpdatedPayloadSchema
})

export const messageStatusEventSchema = z.object({
  type: z.literal('message_status'),
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  payload: messageStatusPayloadSchema
})

export const typingIndicatorEventSchema = z.object({
  type: z.literal('typing_indicator'),
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  payload: typingIndicatorPayloadSchema
})

export const assignmentChangedEventSchema = z.object({
  type: z.literal('assignment_changed'),
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  payload: assignmentChangedPayloadSchema
})

export const outboundMessageEventSchema = z.object({
  type: z.literal('outbound_message'),
  timestamp: z.string().datetime(),
  userId: z.string().min(1),
  payload: outboundMessagePayloadSchema
})

export const newNotificationEventSchema = z.object({
  type: z.literal('new_notification'),
  payload: newNotificationPayloadSchema
})

// Union schema for all WebSocket events
export const webSocketEventSchema = z.discriminatedUnion('type', [
  newMessageEventSchema,
  conversationUpdatedEventSchema,
  messageStatusEventSchema,
  typingIndicatorEventSchema,
  assignmentChangedEventSchema,
  outboundMessageEventSchema,
  newNotificationEventSchema
])

// ============================================
// TypeScript Interfaces (inferred from schemas)
// ============================================

// Base event structure
export interface BaseEvent {
  type: WebSocketEventType
  timestamp: string
  userId: string
}

// New message event payload
export interface NewMessageEvent extends BaseEvent {
  type: 'new_message'
  payload: z.infer<typeof newMessagePayloadSchema>
}

// Conversation updated event payload
export interface ConversationUpdatedEvent extends BaseEvent {
  type: 'conversation_updated'
  payload: z.infer<typeof conversationUpdatedPayloadSchema>
}

// Message status update event payload
export interface MessageStatusEvent extends BaseEvent {
  type: 'message_status'
  payload: z.infer<typeof messageStatusPayloadSchema>
}

// Typing indicator event payload
export interface TypingIndicatorEvent extends BaseEvent {
  type: 'typing_indicator'
  payload: z.infer<typeof typingIndicatorPayloadSchema>
}

// Assignment changed event payload
export interface AssignmentChangedEvent extends BaseEvent {
  type: 'assignment_changed'
  payload: z.infer<typeof assignmentChangedPayloadSchema>
}

// Outbound message event payload
export interface OutboundMessageEvent extends BaseEvent {
  type: 'outbound_message'
  payload: z.infer<typeof outboundMessagePayloadSchema>
}

// New notification event payload (simpler - no timestamp/userId needed at top level)
export interface NewNotificationEvent {
  type: 'new_notification'
  payload: z.infer<typeof newNotificationPayloadSchema>
}

// Union type for all WebSocket events
export type WebSocketEvent = 
  | NewMessageEvent 
  | ConversationUpdatedEvent 
  | MessageStatusEvent
  | TypingIndicatorEvent
  | AssignmentChangedEvent
  | OutboundMessageEvent
  | NewNotificationEvent

// ============================================
// Server Configuration & Connection Types
// ============================================

// Server configuration
export interface WebSocketServerConfig {
  cors: {
    origin: string[]
    credentials: boolean
  }
  pingTimeout: number
  pingInterval: number
}

// Connection tracking
export interface UserConnection {
  socketId: string
  userId: string
  businessOwnerId: string
  connectedAt: Date
  lastHeartbeat: Date
  userAgent?: string
}

// ============================================
// Validation Helper
// ============================================

/**
 * Validate a WebSocket event against its schema
 * Returns the validated event or null if invalid
 */
export function validateWebSocketEvent(event: unknown): WebSocketEvent | null {
  const result = webSocketEventSchema.safeParse(event)
  return result.success ? result.data : null
}

/**
 * Get validation errors for a WebSocket event
 */
export function getValidationErrors(event: unknown): string[] {
  const result = webSocketEventSchema.safeParse(event)
  if (result.success) return []
  return result.error.issues.map(e => `${e.path.join('.')}: ${e.message}`)
}
