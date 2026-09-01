/**
 * Facebook Messenger Conversation Routes
 * Handles listing and managing conversations
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'
import { prisma } from '../../utils/database.js'

const app = new Hono()

/**
 * GET / - List conversations with assignment data
 */
app.get('/', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized' } }, 401)
    }

    const effectiveUserId = getEffectiveUserId(c)
    const isAgent = c.user.role === 'AGENT'
    const agentUserId = c.user.id

    const pageId = c.req.query('pageId')
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const cursor = c.req.query('cursor')

    // Get user's pages
    const pages = await prisma.facebookPage.findMany({
      where: { userId: effectiveUserId, connectionStatus: 'connected' },
      select: { id: true },
    })

    const pageIds = pageId ? [pageId] : pages.map(p => p.id)

    // For agents, get the list of conversation IDs assigned to them
    let assignedConversationIds: string[] = []
    if (isAgent) {
      const agentAssignments = await prisma.conversationAssignment.findMany({
        where: {
          businessOwnerId: effectiveUserId,
          conversationType: 'MESSENGER',
          assigneeId: agentUserId,
          assigneeType: 'HUMAN',
          unassignedAt: null,
        },
        select: {
          conversationId: true,
        }
      })
      assignedConversationIds = agentAssignments.map(a => a.conversationId)
      
      // If agent has no assignments, return empty result
      if (assignedConversationIds.length === 0) {
        return c.json({
          success: true,
          data: [],
          pagination: {
            hasMore: false,
            nextCursor: null,
          },
        })
      }
    }

    // Build where clause for conversations
    const conversationWhere: any = {
      facebookPageId: { in: pageIds },
      ...(cursor ? { id: { lt: cursor } } : {}),
    }
    if (isAgent && assignedConversationIds.length > 0) {
      conversationWhere.id = { in: assignedConversationIds }
    }

    // Get conversations and assignments in parallel
    const [conversations, assignmentsRaw] = await Promise.all([
      prisma.messengerConversation.findMany({
        where: conversationWhere,
        include: {
          facebookPage: {
            select: { id: true, pageName: true, profilePicUrl: true },
          },
          customer: {
            select: { id: true, name: true, phoneNumber: true },
          },
          messages: {
            take: 1,
            orderBy: { timestamp: 'desc' },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
        take: limit + 1,
      }),
      // Fetch active assignments for Messenger conversations
      prisma.conversationAssignment.findMany({
        where: {
          businessOwnerId: effectiveUserId,
          conversationType: 'MESSENGER',
          unassignedAt: null,
          ...(isAgent && assignedConversationIds.length > 0 ? { conversationId: { in: assignedConversationIds } } : {})
        },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              image: true,
            }
          },
          aiAgent: {
            select: {
              id: true,
              name: true,
            }
          }
        }
      })
    ])

    // Transform assignments to Record<conversationId, assignment>
    const assignments: Record<string, {
      assigneeId: string | null
      assigneeName: string | null
      assigneeImage: string | null
      assigneeType: 'HUMAN' | 'AI_AGENT'
      aiAgentId: string | null
      aiAgentName: string | null
      assignedAt: Date
    }> = {}
    for (const assignment of assignmentsRaw) {
      assignments[assignment.conversationId] = {
        assigneeId: assignment.assigneeId,
        assigneeName: assignment.assignee?.name || null,
        assigneeImage: assignment.assignee?.image || null,
        assigneeType: assignment.assigneeType as 'HUMAN' | 'AI_AGENT',
        aiAgentId: assignment.aiAgentId,
        aiAgentName: assignment.aiAgent?.name || null,
        assignedAt: assignment.assignedAt,
      }
    }

    const hasMore = conversations.length > limit
    const data = hasMore ? conversations.slice(0, -1) : conversations

    // Check and update window status for each conversation and add assignment data
    const now = new Date()
    const conversationsWithAssignments = data.map(conv => {
      const assignment = assignments[conv.id]
      return {
        id: conv.id,
        participantPsid: conv.participantPsid,
        participantName: conv.participantName,
        participantProfilePic: conv.participantProfilePic,
        unreadCount: conv.unreadCount,
        lastMessageAt: conv.lastMessageAt,
        lastMessagePreview: conv.lastMessagePreview,
        isWindowActive: conv.windowExpiresAt ? conv.windowExpiresAt > now : false,
        windowExpiresAt: conv.windowExpiresAt,
        page: conv.facebookPage,
        customer: conv.customer,
        customerId: conv.customerId,
        lastMessage: conv.messages[0] || null,
        // Assignment fields
        assigneeId: assignment?.assigneeId || null,
        assigneeName: assignment?.assigneeName || null,
        assigneeImage: assignment?.assigneeImage || null,
        assigneeType: assignment?.assigneeType || 'HUMAN',
        aiAgentId: assignment?.aiAgentId || null,
        aiAgentName: assignment?.aiAgentName || null,
        assignedAt: assignment?.assignedAt || null,
      }
    })

    return c.json({
      success: true,
      data: conversationsWithAssignments,
      pagination: {
        hasMore,
        nextCursor: hasMore ? data[data.length - 1].id : null,
      },
    })
  } catch (error) {
    console.error('[Messenger] List conversations error:', error)
    return c.json({ error: { code: 'InternalServerError' } }, 500)
  }
})

/**
 * GET /:id - Get conversation with messages
 */
app.get('/:id', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized' } }, 401)
    }

    const conversationId = c.req.param('id')
    const limit = Math.min(parseInt(c.req.query('limit') || '50'), 100)
    const cursor = c.req.query('cursor')

    const conversation = await prisma.messengerConversation.findFirst({
      where: {
        id: conversationId,
        facebookPage: { userId: c.user.id },
      },
      include: {
        facebookPage: {
          select: { id: true, pageName: true, profilePicUrl: true },
        },
        customer: true,
      },
    })

    if (!conversation) {
      return c.json({ error: { code: 'NotFound' } }, 404)
    }

    const messages = await prisma.messengerMessage.findMany({
      where: {
        conversationId,
        ...(cursor ? { id: { lt: cursor } } : {}),
      },
      orderBy: { timestamp: 'desc' },
      take: limit + 1,
    })

    const hasMore = messages.length > limit
    const messageData = hasMore ? messages.slice(0, -1) : messages

    return c.json({
      success: true,
      data: {
        conversation,
        messages: messageData.reverse(),
        pagination: {
          hasMore,
          nextCursor: hasMore ? messageData[messageData.length - 1].id : null,
        },
      },
    })
  } catch (error) {
    console.error('[Messenger] Get conversation error:', error)
    return c.json({ error: { code: 'InternalServerError' } }, 500)
  }
})

/**
 * POST /:id/read - Mark conversation as read
 */
app.post('/:id/read', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized' } }, 401)
    }

    const conversationId = c.req.param('id')

    const conversation = await prisma.messengerConversation.findFirst({
      where: {
        id: conversationId,
        facebookPage: { userId: c.user.id },
      },
    })

    if (!conversation) {
      return c.json({ error: { code: 'NotFound' } }, 404)
    }

    await prisma.messengerConversation.update({
      where: { id: conversationId },
      data: { unreadCount: 0 },
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('[Messenger] Mark read error:', error)
    return c.json({ error: { code: 'InternalServerError' } }, 500)
  }
})

/**
 * POST /:id/link-customer - Link conversation to existing customer
 */
app.post('/:id/link-customer', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const conversationId = c.req.param('id')
    const body = await c.req.json()
    const { customerId } = body

    if (!customerId) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'customerId is required'
        }
      }, 400)
    }

    // Get conversation with page info
    const conversation = await prisma.messengerConversation.findFirst({
      where: {
        id: conversationId,
        facebookPage: { userId: c.user.id }
      },
      select: {
        id: true,
        participantPsid: true,
        participantName: true,
        customerId: true
      }
    })

    if (!conversation) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Conversation not found'
        }
      }, 404)
    }

    // Verify customer belongs to user
    const customer = await prisma.customer.findFirst({
      where: {
        id: customerId,
        userId: c.user.id
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true
      }
    })

    if (!customer) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Customer not found'
        }
      }, 404)
    }

    // Check if customer is already linked to another Messenger conversation
    const existingLink = await prisma.messengerConversation.findFirst({
      where: {
        customerId,
        id: { not: conversationId }
      },
      select: { id: true }
    })

    if (existingLink) {
      return c.json({
        error: {
          code: 'Conflict',
          message: 'Customer is already linked to another Messenger conversation'
        }
      }, 409)
    }

    // Link conversation to customer
    const updatedConversation = await prisma.messengerConversation.update({
      where: { id: conversationId },
      data: { customerId },
      select: {
        id: true,
        participantPsid: true,
        participantName: true,
        customerId: true,
        customer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true
          }
        }
      }
    })

    return c.json({
      success: true,
      message: 'Customer linked successfully',
      data: {
        conversation: updatedConversation,
        customer: updatedConversation.customer
      }
    })
  } catch (error) {
    console.error('[Messenger] Link customer error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to link customer'
      }
    }, 500)
  }
})

/**
 * DELETE /:id/link-customer - Unlink customer from conversation
 */
app.delete('/:id/link-customer', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const conversationId = c.req.param('id')

    // Get conversation
    const conversation = await prisma.messengerConversation.findFirst({
      where: {
        id: conversationId,
        facebookPage: { userId: c.user.id }
      },
      select: {
        id: true,
        customerId: true
      }
    })

    if (!conversation) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Conversation not found'
        }
      }, 404)
    }

    if (!conversation.customerId) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Conversation is not linked to any customer'
        }
      }, 400)
    }

    // Unlink customer from conversation
    await prisma.messengerConversation.update({
      where: { id: conversationId },
      data: { customerId: null }
    })

    return c.json({
      success: true,
      message: 'Customer unlinked successfully'
    })
  } catch (error) {
    console.error('[Messenger] Unlink customer error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to unlink customer'
      }
    }, 500)
  }
})

export default app
