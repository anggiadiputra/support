import type { UserConnection } from './types.js'

/**
 * Connection Manager
 * Tracks active WebSocket connections per user and business
 * Manages user-specific and business-specific rooms for targeted broadcasting
 */
class ConnectionManager {
  // Map of socketId -> UserConnection
  private connections: Map<string, UserConnection> = new Map()
  
  // Map of userId -> Set of socketIds (for multi-device support)
  private userConnections: Map<string, Set<string>> = new Map()

  // Map of businessOwnerId -> Set of socketIds (for business-wide broadcasts)
  private businessConnections: Map<string, Set<string>> = new Map()

  /**
   * Add a new connection
   */
  addConnection(userId: string, socketId: string, businessOwnerId: string, userAgent?: string): void {
    const connection: UserConnection = {
      socketId,
      userId,
      businessOwnerId,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      userAgent
    }

    // Store connection
    this.connections.set(socketId, connection)

    // Add to user's connection set
    if (!this.userConnections.has(userId)) {
      this.userConnections.set(userId, new Set())
    }
    this.userConnections.get(userId)!.add(socketId)

    // Add to business's connection set
    if (!this.businessConnections.has(businessOwnerId)) {
      this.businessConnections.set(businessOwnerId, new Set())
    }
    this.businessConnections.get(businessOwnerId)!.add(socketId)

    console.log(`[ConnectionManager] Added connection ${socketId} for user ${userId} (business: ${businessOwnerId}). Total connections: ${this.connections.size}`)
  }

  /**
   * Remove a connection
   */
  removeConnection(socketId: string): void {
    const connection = this.connections.get(socketId)
    
    if (!connection) {
      return
    }

    const { userId, businessOwnerId } = connection

    // Remove from connections map
    this.connections.delete(socketId)

    // Remove from user's connection set
    const userSockets = this.userConnections.get(userId)
    if (userSockets) {
      userSockets.delete(socketId)
      
      // Clean up empty user entry
      if (userSockets.size === 0) {
        this.userConnections.delete(userId)
      }
    }

    // Remove from business's connection set
    const businessSockets = this.businessConnections.get(businessOwnerId)
    if (businessSockets) {
      businessSockets.delete(socketId)
      
      // Clean up empty business entry
      if (businessSockets.size === 0) {
        this.businessConnections.delete(businessOwnerId)
      }
    }

    console.log(`[ConnectionManager] Removed connection ${socketId} for user ${userId} (business: ${businessOwnerId}). Total connections: ${this.connections.size}`)
  }

  /**
   * Get all socket IDs for a user
   */
  getUserConnections(userId: string): string[] {
    const sockets = this.userConnections.get(userId)
    return sockets ? Array.from(sockets) : []
  }

  /**
   * Get all user IDs connected to a business
   */
  getBusinessUserIds(businessOwnerId: string): string[] {
    const businessSockets = this.businessConnections.get(businessOwnerId)
    if (!businessSockets) {
      return []
    }

    // Get unique user IDs from all business connections
    const userIds = new Set<string>()
    for (const socketId of businessSockets) {
      const connection = this.connections.get(socketId)
      if (connection) {
        userIds.add(connection.userId)
      }
    }

    return Array.from(userIds)
  }

  /**
   * Check if user has active connections
   */
  isUserOnline(userId: string): boolean {
    const sockets = this.userConnections.get(userId)
    return sockets !== undefined && sockets.size > 0
  }

  /**
   * Get connection by socket ID
   */
  getConnection(socketId: string): UserConnection | undefined {
    return this.connections.get(socketId)
  }

  /**
   * Update heartbeat timestamp for a connection
   */
  updateHeartbeat(socketId: string): void {
    const connection = this.connections.get(socketId)
    if (connection) {
      connection.lastHeartbeat = new Date()
    }
  }

  /**
   * Get total number of active connections
   */
  getTotalConnections(): number {
    return this.connections.size
  }

  /**
   * Get number of online users
   */
  getOnlineUsersCount(): number {
    return this.userConnections.size
  }

  /**
   * Get all online user IDs
   */
  getOnlineUserIds(): string[] {
    return Array.from(this.userConnections.keys())
  }

  /**
   * Clean up stale connections (connections that haven't sent heartbeat)
   * @param maxAge Maximum age in milliseconds since last heartbeat
   * @returns Array of removed socket IDs
   */
  cleanupStaleConnections(maxAge: number = 60000): string[] {
    const now = Date.now()
    const staleSocketIds: string[] = []

    for (const [socketId, connection] of this.connections) {
      const age = now - connection.lastHeartbeat.getTime()
      if (age > maxAge) {
        staleSocketIds.push(socketId)
      }
    }

    // Remove stale connections
    for (const socketId of staleSocketIds) {
      this.removeConnection(socketId)
    }

    if (staleSocketIds.length > 0) {
      console.log(`[ConnectionManager] Cleaned up ${staleSocketIds.length} stale connections`)
    }

    return staleSocketIds
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager()
