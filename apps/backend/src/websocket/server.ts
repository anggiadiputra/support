import { Server as SocketIOServer } from 'socket.io'
import type { Server as HTTPServer } from 'node:http'
import type { AuthenticatedSocket, WebSocketServerConfig } from './types.js'
import { authMiddleware } from './middleware/auth.js'
import { connectionManager } from './connection-manager.js'

let io: SocketIOServer | null = null

/**
 * Initialize WebSocket server with the HTTP server
 */
export function initializeWebSocket(httpServer: HTTPServer): SocketIOServer {
  // Get allowed origins from environment
  const corsOriginsEnv = process.env.CORS_ALLOWED_ORIGINS
  const allowedOrigins = corsOriginsEnv
    ? corsOriginsEnv.split(',').map(o => o.trim())
    : ['http://localhost:3000', 'http://localhost:3005']

  const config: WebSocketServerConfig = {
    cors: {
      origin: allowedOrigins,
      credentials: true
    },
    pingTimeout: Number(process.env.WEBSOCKET_PING_TIMEOUT) || 10000,
    pingInterval: Number(process.env.WEBSOCKET_PING_INTERVAL) || 30000
  }

  io = new SocketIOServer(httpServer, {
    cors: config.cors,
    pingTimeout: config.pingTimeout,
    pingInterval: config.pingInterval,
    transports: ['websocket', 'polling'],
    allowUpgrades: true
  })

  // Apply authentication middleware
  io.use(authMiddleware)

  // Handle connections
  io.on('connection', (socket: AuthenticatedSocket) => {
    const userId = socket.userId
    const socketId = socket.id
    const businessOwnerId = socket.businessOwnerId

    console.log(`[WebSocket] User ${userId} connected (socket: ${socketId}, business: ${businessOwnerId})`)

    // Add connection to manager with businessOwnerId
    connectionManager.addConnection(userId, socketId, businessOwnerId, socket.userAgent)

    // Join business room for team-wide broadcasts (all team members receive events together)
    socket.join(`business:${businessOwnerId}`)

    // Keep user-specific room for personal notifications
    socket.join(`user:${userId}`)

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`[WebSocket] User ${userId} disconnected (reason: ${reason})`)
      connectionManager.removeConnection(socketId)
    })

    // Handle errors
    socket.on('error', (error) => {
      console.error(`[WebSocket] Socket error for user ${userId}:`, error)
    })
  })

  console.log('✅ WebSocket server initialized')
  return io
}

/**
 * Get the Socket.IO server instance
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('WebSocket server not initialized. Call initializeWebSocket first.')
  }
  return io
}

/**
 * Check if WebSocket server is initialized
 */
export function isWebSocketInitialized(): boolean {
  return io !== null
}
