import { getIO, isWebSocketInitialized } from './server.js'
import { connectionManager } from './connection-manager.js'
import {
  type WebSocketEvent,
  type NewMessageEvent,
  type ConversationUpdatedEvent,
  type MessageStatusEvent,
  type TypingIndicatorEvent,
  type AssignmentChangedEvent,
  type OutboundMessageEvent,
  validateWebSocketEvent,
  getValidationErrors
} from './types.js'

/**
 * Event Emitter Service
 * Broadcasts WebSocket events to specific users
 * Validates payloads before emitting
 */
class EventEmitter {
  /**
   * Emit an event to a specific user's connections
   * Only sends to connections belonging to the relevant user (not broadcast to all)
   */
  emitToUser(userId: string, event: WebSocketEvent): boolean {
    // Check if WebSocket server is initialized
    if (!isWebSocketInitialized()) {
      console.warn('[EventEmitter] WebSocket server not initialized, skipping emit')
      return false
    }

    // Validate event payload
    const validatedEvent = validateWebSocketEvent(event)
    if (!validatedEvent) {
      const errors = getValidationErrors(event)
      console.error(`[EventEmitter] Invalid event payload for user ${userId}:`, errors)
      return false
    }

    // Check if user has active connections
    if (!connectionManager.isUserOnline(userId)) {
      console.log(`[EventEmitter] User ${userId} is offline, skipping emit`)
      return false
    }

    try {
      const io = getIO()
      // Emit to user-specific room
      io.to(`user:${userId}`).emit(event.type, validatedEvent)
      
      console.log(`[EventEmitter] Emitted ${event.type} to user ${userId}`)
      return true
    } catch (error) {
      console.error(`[EventEmitter] Failed to emit ${event.type} to user ${userId}:`, error)
      return false
    }
  }

  /**
   * Emit a new message event to a user
   */
  emitNewMessage(
    userId: string,
    payload: NewMessageEvent['payload']
  ): boolean {
    const event: NewMessageEvent = {
      type: 'new_message',
      timestamp: new Date().toISOString(),
      userId,
      payload
    }
    return this.emitToUser(userId, event)
  }

  /**
   * Emit a conversation updated event to a user
   */
  emitConversationUpdated(
    userId: string,
    payload: ConversationUpdatedEvent['payload']
  ): boolean {
    const event: ConversationUpdatedEvent = {
      type: 'conversation_updated',
      timestamp: new Date().toISOString(),
      userId,
      payload
    }
    return this.emitToUser(userId, event)
  }

  /**
   * Emit a message status update event to a user
   */
  emitMessageStatus(
    userId: string,
    payload: MessageStatusEvent['payload']
  ): boolean {
    const event: MessageStatusEvent = {
      type: 'message_status',
      timestamp: new Date().toISOString(),
      userId,
      payload
    }
    return this.emitToUser(userId, event)
  }

  /**
   * Emit a typing indicator event to a user
   */
  emitTypingIndicator(
    userId: string,
    payload: TypingIndicatorEvent['payload']
  ): boolean {
    const event: TypingIndicatorEvent = {
      type: 'typing_indicator',
      timestamp: new Date().toISOString(),
      userId,
      payload
    }
    return this.emitToUser(userId, event)
  }

  /**
   * Emit an assignment changed event to a user
   */
  emitAssignmentChanged(
    userId: string,
    payload: AssignmentChangedEvent['payload']
  ): boolean {
    const event: AssignmentChangedEvent = {
      type: 'assignment_changed',
      timestamp: new Date().toISOString(),
      userId,
      payload
    }
    return this.emitToUser(userId, event)
  }

  /**
   * Emit an assignment changed event to multiple users (business owner context)
   * Used to broadcast assignment changes to all team members
   */
  emitAssignmentChangedToUsers(
    userIds: string[],
    payload: AssignmentChangedEvent['payload']
  ): { sent: number; failed: number } {
    let sent = 0
    let failed = 0

    for (const userId of userIds) {
      const success = this.emitAssignmentChanged(userId, payload)
      if (success) {
        sent++
      } else {
        failed++
      }
    }

    console.log(`[EventEmitter] Broadcast assignment_changed to ${sent} users (${failed} offline/failed)`)
    return { sent, failed }
  }

  /**
   * Emit an event to a business room (all team members of a business)
   * Broadcasts to all connections in the business:${businessOwnerId} room
   */
  emitToBusinessRoom(businessOwnerId: string, event: WebSocketEvent): boolean {
    // Check if WebSocket server is initialized
    if (!isWebSocketInitialized()) {
      console.warn('[EventEmitter] WebSocket server not initialized, skipping emit')
      return false
    }

    // Validate event payload
    const validatedEvent = validateWebSocketEvent(event)
    if (!validatedEvent) {
      const errors = getValidationErrors(event)
      console.error(`[EventEmitter] Invalid event payload for business room ${businessOwnerId}:`, errors)
      return false
    }

    try {
      const io = getIO()
      // Emit to business-specific room
      io.to(`business:${businessOwnerId}`).emit(event.type, validatedEvent)
      
      console.log(`[EventEmitter] Emitted ${event.type} to business room ${businessOwnerId}`)
      return true
    } catch (error) {
      console.error(`[EventEmitter] Failed to emit ${event.type} to business room ${businessOwnerId}:`, error)
      return false
    }
  }

  /**
   * Emit a new message event to a business room
   */
  emitNewMessageToBusinessRoom(
    businessOwnerId: string,
    payload: NewMessageEvent['payload']
  ): boolean {
    const event: NewMessageEvent = {
      type: 'new_message',
      timestamp: new Date().toISOString(),
      userId: businessOwnerId,
      payload
    }
    return this.emitToBusinessRoom(businessOwnerId, event)
  }

  /**
   * Emit an assignment changed event to a business room
   */
  emitAssignmentChangedToBusinessRoom(
    businessOwnerId: string,
    payload: AssignmentChangedEvent['payload']
  ): boolean {
    const event: AssignmentChangedEvent = {
      type: 'assignment_changed',
      timestamp: new Date().toISOString(),
      userId: businessOwnerId,
      payload
    }
    return this.emitToBusinessRoom(businessOwnerId, event)
  }

  /**
   * Emit an outbound message event to a business room
   * Used to broadcast sent messages (by human or AI agent) to all team members
   */
  emitOutboundMessageToBusinessRoom(
    businessOwnerId: string,
    payload: OutboundMessageEvent['payload']
  ): boolean {
    const event: OutboundMessageEvent = {
      type: 'outbound_message',
      timestamp: new Date().toISOString(),
      userId: businessOwnerId,
      payload
    }
    return this.emitToBusinessRoom(businessOwnerId, event)
  }

  /**
   * Emit to a specific room (for future use cases)
   */
  emitToRoom(room: string, event: WebSocketEvent): boolean {
    if (!isWebSocketInitialized()) {
      console.warn('[EventEmitter] WebSocket server not initialized, skipping emit')
      return false
    }

    const validatedEvent = validateWebSocketEvent(event)
    if (!validatedEvent) {
      const errors = getValidationErrors(event)
      console.error(`[EventEmitter] Invalid event payload for room ${room}:`, errors)
      return false
    }

    try {
      const io = getIO()
      io.to(room).emit(event.type, validatedEvent)
      console.log(`[EventEmitter] Emitted ${event.type} to room ${room}`)
      return true
    } catch (error) {
      console.error(`[EventEmitter] Failed to emit ${event.type} to room ${room}:`, error)
      return false
    }
  }
}

// Export singleton instance
export const eventEmitter = new EventEmitter()
