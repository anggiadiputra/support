/**
 * Assignment Routes
 * 
 * API routes for conversation assignment management in OneInbox.
 * Handles assigning/unassigning conversations to team members and AI Agents.
 * 
 * Requirements: 1.1, 1.2, 1.4, 2.1, 2.2, 3.1, 4.3, 7.1, 7.3, 7.5, 8.2
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { authMiddleware } from '../../middleware/auth.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'
import { assignmentService, ASSIGNMENT_ERRORS, AI_ASSIGNMENT_ERRORS } from '../../services/assignment-service.js'
import { eventEmitter } from '../../websocket/index.js'
import { logDetailedError } from '../../middleware/errorHandler.js'
import { auditLog } from '../../utils/auditLog.js'

// Define ConversationType locally to avoid Prisma client regeneration issues
type ConversationType = 'WHATSAPP' | 'INSTAGRAM'

const app = new Hono()

// ============================================
// Validation Schemas
// ============================================

// Schema for human assignment (legacy support)
const assignConversationSchema = z.object({
  assigneeId: z.string().min(1, 'Assignee ID is required')
})

// Schema for assignment that supports both human and AI Agent
// Requirements: 1.4, 4.3
const assignConversationExtendedSchema = z.object({
  assigneeId: z.string().optional(),
  aiAgentId: z.string().optional(),
}).refine(
  (data) => (data.assigneeId && !data.aiAgentId) || (!data.assigneeId && data.aiAgentId),
  { message: 'Either assigneeId (for human) or aiAgentId (for AI Agent) must be provided, but not both' }
)

// ============================================
// Helper Functions
// ============================================

/**
 * Parse and validate conversation type from URL parameter
 */
function parseConversationType(type: string): ConversationType | null {
  const upperType = type.toUpperCase()
  if (upperType === 'WHATSAPP' || upperType === 'INSTAGRAM' || upperType === 'MESSENGER') {
    return upperType as ConversationType
  }
  return null
}

/**
 * Emit assignment changed WebSocket event to all users in business context
 * Requirements: 2.4
 */
function emitAssignmentChanged(
  businessOwnerId: string,
  conversationId: string,
  _conversationType: ConversationType,
  _assigneeId: string | null,
  _assigneeName: string | null,
  _assignedById: string,
  _action: 'assigned' | 'unassigned'
): void {
  // Emit to business owner
  eventEmitter.emitToUser(businessOwnerId, {
    type: 'conversation_updated',
    timestamp: new Date().toISOString(),
    userId: businessOwnerId,
    payload: {
      conversationId,
      changes: {
        // Use a custom field to indicate assignment change
        // The frontend will handle this appropriately
      }
    }
  })
}

// ============================================
// Routes
// ============================================

/**
 * GET /api/v1/assignments/assignable-users
 * Get list of users that can be assigned to conversations
 * Requirements: 2.1
 */
app.get('/assignable-users', authMiddleware, resolveContext, async (c: Context) => {
  try {
    const businessOwnerId = getEffectiveUserId(c)
    
    if (!businessOwnerId) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const users = await assignmentService.getAssignableUsers(businessOwnerId)

    return c.json({
      success: true,
      data: users
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to fetch assignable users' }
    }, 500)
  }
})

/**
 * GET /api/v1/assignments/assignable-entities
 * Get list of all assignable entities (humans + AI agents)
 * Returns structured response with humans and aiAgents arrays
 * Requirements: 1.1, 1.2
 */
app.get('/assignable-entities', authMiddleware, resolveContext, async (c: Context) => {
  try {
    const businessOwnerId = getEffectiveUserId(c)
    
    if (!businessOwnerId) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const entities = await assignmentService.getAssignableEntities(businessOwnerId)

    // Separate entities into humans and aiAgents arrays for frontend consumption
    const humans = entities.filter(e => e.type === 'HUMAN')
    const aiAgents = entities.filter(e => e.type === 'AI_AGENT')

    return c.json({
      success: true,
      data: {
        humans,
        aiAgents
      }
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to fetch assignable entities' }
    }, 500)
  }
})

/**
 * GET /api/v1/assignments/:conversationType/:conversationId
 * Get current assignment for a conversation
 * Response includes assigneeType, aiAgentId, and aiAgentName for AI assignments
 * Requirements: 2.2, 7.1, 7.3
 */
app.get('/:conversationType/:conversationId', authMiddleware, resolveContext, async (c: Context) => {
  try {
    const businessOwnerId = getEffectiveUserId(c)
    
    if (!businessOwnerId) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const conversationTypeParam = c.req.param('conversationType')
    const conversationId = c.req.param('conversationId')

    const conversationType = parseConversationType(conversationTypeParam)
    if (!conversationType) {
      return c.json({
        error: { code: 'ValidationError', message: 'Invalid conversation type. Must be WHATSAPP, INSTAGRAM, or MESSENGER' }
      }, 400)
    }

    const assignment = await assignmentService.getAssignment(
      conversationId,
      conversationType,
      businessOwnerId
    )

    return c.json({
      success: true,
      data: assignment
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to fetch assignment' }
    }, 500)
  }
})

/**
 * POST /api/v1/assignments/:conversationType/:conversationId
 * Assign a conversation to a user or AI Agent
 * Accepts either assigneeId (human) or aiAgentId (AI)
 * Requirements: 1.4, 2.2, 4.3, 7.5
 */
app.post('/:conversationType/:conversationId', authMiddleware, resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const businessOwnerId = getEffectiveUserId(c)
    const conversationTypeParam = c.req.param('conversationType')
    const conversationId = c.req.param('conversationId')

    const conversationType = parseConversationType(conversationTypeParam)
    if (!conversationType) {
      return c.json({
        error: { code: 'ValidationError', message: 'Invalid conversation type. Must be WHATSAPP, INSTAGRAM, or MESSENGER' }
      }, 400)
    }

    // Parse request body
    const body = await c.req.json()

    // Try extended schema first (supports both human and AI Agent)
    const extendedValidation = assignConversationExtendedSchema.safeParse(body)
    
    if (!extendedValidation.success) {
      // Fall back to legacy schema for backward compatibility
      const legacyValidation = assignConversationSchema.safeParse(body)
      if (!legacyValidation.success) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: extendedValidation.error.issues[0]?.message || 'Invalid input. Provide either assigneeId or aiAgentId'
          }
        }, 400)
      }
      // Use legacy validation data
      body.assigneeId = legacyValidation.data.assigneeId
    }

    const { assigneeId, aiAgentId } = body

    // Handle AI Agent assignment (Requirement 1.4, 4.3)
    if (aiAgentId) {
      // For agents, check if conversation is available (unassigned or AI-assigned)
      if (c.user.role === 'AGENT') {
        const currentAssignment = await assignmentService.getAssignment(
          conversationId,
          conversationType,
          businessOwnerId
        )

        const isUnassigned = !currentAssignment
        const isAssignedToAI = currentAssignment?.assigneeType === 'AI_AGENT'

        if (!isUnassigned && !isAssignedToAI) {
          return c.json({
            error: {
              code: 'UNAUTHORIZED_ASSIGN',
              message: 'Cannot assign: conversation is already assigned to another agent'
            }
          }, 403)
        }
      }

      try {
        const assignment = await assignmentService.assignToAIAgent(
          conversationId,
          conversationType,
          aiAgentId,
          c.user.id,
          businessOwnerId
        )

        // Audit log
        await auditLog('CONVERSATION_ASSIGNED', 'Conversation', conversationId, {
          assigneeType: 'AI_AGENT',
          aiAgentId,
          aiAgentName: assignment.aiAgentName,
          conversationType,
          assignedBy: c.user.id
        }, businessOwnerId)

        // Emit WebSocket event (Requirements: 2.4)
        emitAssignmentChanged(
          businessOwnerId,
          conversationId,
          conversationType,
          assignment.aiAgentId,
          assignment.aiAgentName,
          c.user.id,
          'assigned'
        )

        return c.json({
          success: true,
          data: assignment
        }, 201)
      } catch (error) {
        if (error instanceof Error) {
          if (error.message === AI_ASSIGNMENT_ERRORS.AI_DISABLED) {
            return c.json({
              error: { code: 'AI_DISABLED', message: AI_ASSIGNMENT_ERRORS.AI_DISABLED }
            }, 400)
          }
          if (error.message === AI_ASSIGNMENT_ERRORS.AI_AGENT_NOT_FOUND) {
            return c.json({
              error: { code: 'AI_AGENT_NOT_FOUND', message: AI_ASSIGNMENT_ERRORS.AI_AGENT_NOT_FOUND }
            }, 404)
          }
          if (error.message === AI_ASSIGNMENT_ERRORS.AI_AGENT_REQUIRED) {
            return c.json({
              error: { code: 'AI_AGENT_REQUIRED', message: AI_ASSIGNMENT_ERRORS.AI_AGENT_REQUIRED }
            }, 400)
          }
          if (error.message === ASSIGNMENT_ERRORS.ALREADY_ASSIGNED) {
            return c.json({
              error: { code: 'ALREADY_ASSIGNED', message: ASSIGNMENT_ERRORS.ALREADY_ASSIGNED }
            }, 409)
          }
        }
        throw error
      }
    }

    // Handle human assignment (existing logic)
    if (assigneeId) {
      // Check permission (Requirements: 7.5)
      const canAssign = await assignmentService.canAssign(
        c.user.id,
        c.user.role,
        assigneeId,
        conversationId,
        conversationType,
        businessOwnerId
      )

      if (!canAssign) {
        return c.json({
          error: {
            code: 'UNAUTHORIZED_ASSIGN',
            message: ASSIGNMENT_ERRORS.UNAUTHORIZED_ASSIGN
          }
        }, 403)
      }

      // Perform assignment
      const assignment = await assignmentService.assignConversation(
        conversationId,
        conversationType,
        assigneeId,
        c.user.id,
        businessOwnerId
      )

      // Audit log
      await auditLog('CONVERSATION_ASSIGNED', 'Conversation', conversationId, {
        assigneeType: 'HUMAN',
        assigneeId,
        assigneeName: assignment.assigneeName,
        conversationType,
        assignedBy: c.user.id
      }, businessOwnerId)

      // Emit WebSocket event (Requirements: 2.4)
      emitAssignmentChanged(
        businessOwnerId,
        conversationId,
        conversationType,
        assignment.assigneeId,
        assignment.assigneeName,
        c.user.id,
        'assigned'
      )

      return c.json({
        success: true,
        data: assignment
      }, 201)
    }

    // Neither assigneeId nor aiAgentId provided
    return c.json({
      error: {
        code: 'ValidationError',
        message: 'Either assigneeId or aiAgentId must be provided'
      }
    }, 400)
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error) {
      if (error.message === ASSIGNMENT_ERRORS.ALREADY_ASSIGNED) {
        return c.json({
          error: { code: 'ALREADY_ASSIGNED', message: ASSIGNMENT_ERRORS.ALREADY_ASSIGNED }
        }, 409)
      }
      if (error.message === ASSIGNMENT_ERRORS.ASSIGNEE_NOT_FOUND) {
        return c.json({
          error: { code: 'ASSIGNEE_NOT_FOUND', message: ASSIGNMENT_ERRORS.ASSIGNEE_NOT_FOUND }
        }, 404)
      }
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to assign conversation' }
    }, 500)
  }
})

/**
 * DELETE /api/v1/assignments/:conversationType/:conversationId
 * Unassign a conversation
 * Requirements: 3.1, 7.5
 */
app.delete('/:conversationType/:conversationId', authMiddleware, resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const businessOwnerId = getEffectiveUserId(c)
    const conversationTypeParam = c.req.param('conversationType')
    const conversationId = c.req.param('conversationId')

    const conversationType = parseConversationType(conversationTypeParam)
    if (!conversationType) {
      return c.json({
        error: { code: 'ValidationError', message: 'Invalid conversation type. Must be WHATSAPP, INSTAGRAM, or MESSENGER' }
      }, 400)
    }

    // Check permission (Requirements: 7.5)
    const canUnassign = await assignmentService.canUnassign(
      c.user.id,
      c.user.role,
      conversationId,
      conversationType,
      businessOwnerId
    )

    if (!canUnassign) {
      return c.json({
        error: {
          code: 'UNAUTHORIZED_UNASSIGN',
          message: ASSIGNMENT_ERRORS.UNAUTHORIZED_UNASSIGN
        }
      }, 403)
    }

    // Perform unassignment
    await assignmentService.unassignConversation(
      conversationId,
      conversationType,
      c.user.id,
      businessOwnerId
    )

    // Audit log
    await auditLog('CONVERSATION_UNASSIGNED', 'Conversation', conversationId, {
      conversationType,
      unassignedBy: c.user.id
    }, businessOwnerId)

    // Emit WebSocket event (Requirements: 2.4)
    emitAssignmentChanged(
      businessOwnerId,
      conversationId,
      conversationType,
      null,
      null,
      c.user.id,
      'unassigned'
    )

    return c.json({
      success: true,
      message: 'Conversation unassigned successfully'
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    if (error instanceof Error) {
      if (error.message === ASSIGNMENT_ERRORS.NOT_ASSIGNED) {
        return c.json({
          error: { code: 'NOT_ASSIGNED', message: ASSIGNMENT_ERRORS.NOT_ASSIGNED }
        }, 404)
      }
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to unassign conversation' }
    }, 500)
  }
})

/**
 * GET /api/v1/assignments/:conversationType/:conversationId/history
 * Get assignment history for a conversation
 * Response includes assigneeType, aiAgentId, and aiAgentName for AI assignments
 * Requirements: 7.1, 7.2, 7.3, 8.2
 */
app.get('/:conversationType/:conversationId/history', authMiddleware, resolveContext, async (c: Context) => {
  try {
    const businessOwnerId = getEffectiveUserId(c)
    
    if (!businessOwnerId) {
      return c.json({
        error: { code: 'Unauthorized', message: 'Authentication required' }
      }, 401)
    }

    const conversationTypeParam = c.req.param('conversationType')
    const conversationId = c.req.param('conversationId')

    const conversationType = parseConversationType(conversationTypeParam)
    if (!conversationType) {
      return c.json({
        error: { code: 'ValidationError', message: 'Invalid conversation type. Must be WHATSAPP, INSTAGRAM, or MESSENGER' }
      }, 400)
    }

    const history = await assignmentService.getAssignmentHistory(
      conversationId,
      conversationType,
      businessOwnerId
    )

    return c.json({
      success: true,
      data: history
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to fetch assignment history' }
    }, 500)
  }
})

export default app
