import type { Socket } from 'socket.io'
import { auth } from '../../lib/auth.js'
import { prisma } from '../../utils/database.js'
import type { AuthenticatedSocket } from '../types.js'

/**
 * WebSocket authentication middleware
 * Validates session/JWT token on connection and attaches user info to socket
 */
export async function authMiddleware(
  socket: Socket,
  next: (err?: Error) => void
): Promise<void> {
  try {
    // Get auth token from handshake
    // Can be passed via query params or auth header
    const token = socket.handshake.auth?.token || socket.handshake.query?.token
    const cookies = socket.handshake.headers.cookie

    // Create headers object for Better Auth session validation
    const headers = new Headers()
    
    if (cookies) {
      headers.set('cookie', cookies)
    }
    
    if (token) {
      headers.set('authorization', `Bearer ${token}`)
    }

    // Validate session using Better Auth
    const session = await auth.api.getSession({ headers })

    if (!session?.user) {
      console.log('[WebSocket Auth] No valid session found')
      return next(new Error('Authentication required'))
    }

    // Verify user exists and is active
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        isActive: true,
        role: true
      }
    })

    if (!user || !user.isActive) {
      console.log('[WebSocket Auth] User not found or inactive')
      return next(new Error('User not found or inactive'))
    }

    // Resolve businessOwnerId based on user role
    let businessOwnerId: string

    if (user.role === 'AGENT') {
      // For agents, look up TeamMember table to get businessOwnerId
      const teamMember = await prisma.teamMember.findFirst({
        where: {
          agentUserId: user.id,
          status: 'ACTIVE'
        },
        select: {
          businessOwnerId: true
        }
      })

      if (!teamMember) {
        console.log('[WebSocket Auth] Agent not associated with any business')
        return next(new Error('Agent not associated with any business'))
      }

      businessOwnerId = teamMember.businessOwnerId
    } else {
      // For BUSINESS_OWNER or ADMIN, businessOwnerId = userId
      businessOwnerId = user.id
    }

    // Attach user info to socket
    const authenticatedSocket = socket as AuthenticatedSocket
    authenticatedSocket.userId = user.id
    authenticatedSocket.sessionId = session.session?.id || ''
    authenticatedSocket.userAgent = socket.handshake.headers['user-agent']
    authenticatedSocket.businessOwnerId = businessOwnerId

    console.log(`[WebSocket Auth] User ${user.id} authenticated (businessOwnerId: ${businessOwnerId})`)
    next()
  } catch (error) {
    console.error('[WebSocket Auth] Authentication error:', error)
    next(new Error('Authentication failed'))
  }
}
