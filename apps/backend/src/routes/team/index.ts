/**
 * Team Routes
 * 
 * API routes for team management functionality.
 * Handles team members listing, removal, and invitation management.
 * 
 * Requirements: 4.1, 4.3, 2.1, 4.2, 4.4, 4.5, 3.1, 3.2, 3.3, 3.4, 3.5, 7.1, 7.2, 7.3
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requirePermission } from '../../middleware/permissions.js'
import { authMiddleware } from '../../middleware/auth.js'
import { teamService } from '../../services/team-service.js'
import { invitationService } from '../../services/invitation-service.js'
import { z } from 'zod'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'

const app = new Hono()

// ============================================
// Protected Team Management Routes
// Requires team:manage permission (Business Owner only)
// ============================================

/**
 * GET /api/v1/team/members
 * List all team members for the authenticated business owner
 * Requirements: 4.1
 */
app.get('/members', requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const teamMembers = await teamService.getTeamMembers(c.user.id)

    return c.json({
      success: true,
      data: teamMembers
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to fetch team members' }
    }, 500)
  }
})

/**
 * DELETE /api/v1/team/members/:id
 * Remove an agent from the team
 * Requirements: 4.3
 */
app.delete('/members/:id', requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const teamMemberId = c.req.param('id')

    await teamService.removeAgent(c.user.id, teamMemberId)

    return c.json({
      success: true,
      message: 'Agent removed successfully'
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error) {
      if (error.message === 'AGENT_NOT_FOUND') {
        return c.json({
          error: { code: 'AGENT_NOT_FOUND', message: 'Agent not found or already removed' }
        }, 404)
      }
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to remove agent' }
    }, 500)
  }
})

// ============================================
// Invitation Management Routes (Protected)
// Requires authentication + team:manage permission
// ============================================

// Validation schema for creating invitation
const createInvitationSchema = z.object({
  email: z.string().email('Invalid email address')
})

/**
 * POST /api/v1/team/invitations
 * Create a new invitation and send email
 * Requirements: 2.1, 4.2, 7.1, 7.2, 7.3
 */
app.post('/invitations', authMiddleware, requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const body = await c.req.json()
    const validation = createInvitationSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { email } = validation.data

    // Check agent limit before creating invitation (Requirements: 7.1, 7.2, 7.3)
    const limitCheck = await invitationService.checkAgentLimit(c.user.id)
    if (!limitCheck.canInvite) {
      return c.json({
        error: {
          code: 'AGENT_LIMIT_REACHED',
          message: `You have reached the maximum number of agents (${limitCheck.limit}) for your ${limitCheck.tier} plan. Please upgrade to add more agents.`,
          data: {
            currentCount: limitCheck.currentCount,
            limit: limitCheck.limit,
            tier: limitCheck.tier
          }
        }
      }, 403)
    }

    const invitation = await invitationService.createInvitation(c.user.id, email)

    return c.json({
      success: true,
      data: invitation
    }, 201)
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error) {
      switch (error.message) {
        case 'AGENT_LIMIT_REACHED':
          return c.json({
            error: { code: 'AGENT_LIMIT_REACHED', message: 'Agent limit reached for your subscription tier' }
          }, 403)
        case 'MAX_PENDING_INVITATIONS_REACHED':
          return c.json({
            error: { code: 'MAX_PENDING_INVITATIONS_REACHED', message: 'Maximum pending invitations limit reached (10)' }
          }, 400)
        case 'INVITATION_EXISTS':
          return c.json({
            error: { code: 'INVITATION_EXISTS', message: 'An invitation has already been sent to this email' }
          }, 409)
        case 'ALREADY_AGENT':
          return c.json({
            error: { code: 'ALREADY_AGENT', message: 'This user is already an agent on your team' }
          }, 409)
        case 'EMAIL_SEND_FAILED':
          return c.json({
            error: { code: 'EMAIL_SEND_FAILED', message: 'Failed to send invitation email' }
          }, 500)
      }
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to create invitation' }
    }, 500)
  }
})

/**
 * GET /api/v1/team/invitations
 * List pending invitations for the business owner
 * Requirements: 4.4
 */
app.get('/invitations', authMiddleware, requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const invitations = await invitationService.getPendingInvitations(c.user.id)

    return c.json({
      success: true,
      data: invitations
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to fetch invitations' }
    }, 500)
  }
})

/**
 * DELETE /api/v1/team/invitations/:id
 * Cancel a pending invitation
 * Requirements: 4.5
 */
app.delete('/invitations/:id', authMiddleware, requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const invitationId = c.req.param('id')

    await invitationService.cancelInvitation(c.user.id, invitationId)

    return c.json({
      success: true,
      message: 'Invitation cancelled successfully'
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error && error.message === 'INVITATION_NOT_FOUND') {
      return c.json({
        error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found or already processed' }
      }, 404)
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to cancel invitation' }
    }, 500)
  }
})

/**
 * POST /api/v1/team/invitations/:id/resend
 * Resend invitation email
 * Requirements: 2.5
 */
app.post('/invitations/:id/resend', authMiddleware, requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const invitationId = c.req.param('id')

    await invitationService.resendInvitation(c.user.id, invitationId)

    return c.json({
      success: true,
      message: 'Invitation resent successfully'
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error) {
      if (error.message === 'INVITATION_NOT_FOUND') {
        return c.json({
          error: { code: 'INVITATION_NOT_FOUND', message: 'Invitation not found' }
        }, 404)
      }
      if (error.message === 'EMAIL_SEND_FAILED') {
        return c.json({
          error: { code: 'EMAIL_SEND_FAILED', message: 'Failed to send invitation email' }
        }, 500)
      }
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to resend invitation' }
    }, 500)
  }
})

// ============================================
// Public Invitation Routes (No Auth Required)
// For invitation acceptance flow
// ============================================

// Validation schema for accepting invitation
const acceptInvitationSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  name: z.string().min(1, 'Name is required').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional()
})

/**
 * GET /api/v1/team/invitations/validate/:token
 * Validate an invitation token (public route)
 * Requirements: 3.1, 3.2, 3.4
 */
app.get('/invitations/validate/:token', async (c: Context) => {
  try {
    const token = c.req.param('token')

    const invitation = await invitationService.validateToken(token)

    if (!invitation) {
      return c.json({
        error: { code: 'INVITATION_INVALID', message: 'Invalid or expired invitation' }
      }, 404)
    }

    // Check if user with this email already exists and their auth method
    const authInfo = await invitationService.checkUserAuthInfo(invitation.email)

    // Return invitation details (without sensitive token)
    return c.json({
      success: true,
      data: {
        id: invitation.id,
        email: invitation.email,
        businessOwnerName: invitation.businessOwner.name,
        expiresAt: invitation.expiresAt,
        userExists: authInfo.exists,
        hasPassword: authInfo.hasPassword
      }
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to validate invitation' }
    }, 500)
  }
})

/**
 * POST /api/v1/team/invitations/accept
 * Accept an invitation (public route)
 * Requirements: 3.3, 3.4, 3.5
 */
app.post('/invitations/accept', async (c: Context) => {
  try {
    const body = await c.req.json()
    const validation = acceptInvitationSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { token, name, password } = validation.data

    // First validate the token
    const invitation = await invitationService.validateToken(token)
    if (!invitation) {
      return c.json({
        error: { code: 'INVITATION_INVALID', message: 'Invalid or expired invitation' }
      }, 404)
    }

    // Accept the invitation
    const userData = name && password ? { name, password } : undefined
    const result = await invitationService.acceptInvitation(token, userData)

    return c.json({
      success: true,
      data: {
        userId: result.userId,
        isNewUser: result.isNewUser,
        message: result.isNewUser
          ? 'Account created successfully. You can now log in.'
          : 'You have been added to the team. Please log in to continue.'
      }
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error) {
      switch (error.message) {
        case 'INVITATION_INVALID':
          return c.json({
            error: { code: 'INVITATION_INVALID', message: 'Invalid or expired invitation' }
          }, 404)
        case 'ALREADY_AGENT_OF_ANOTHER':
          return c.json({
            error: { code: 'ALREADY_AGENT_OF_ANOTHER', message: 'You are already an agent of another business' }
          }, 409)
        case 'USER_DATA_REQUIRED':
          return c.json({
            error: { code: 'USER_DATA_REQUIRED', message: 'Name and password are required for new users' }
          }, 400)
      }
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to accept invitation' }
    }, 500)
  }
})

/**
 * GET /api/v1/team/limit
 * Get current agent count and limit for the business owner
 * Requirements: 7.1, 7.2
 */
app.get('/limit', requirePermission('team:manage'), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const limitInfo = await invitationService.checkAgentLimit(c.user.id)

    return c.json({
      success: true,
      data: limitInfo
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to get agent limit' }
    }, 500)
  }
})

export default app
