/**
 * Instagram Conversation Routes
 * Handles conversation listing, detail, messages, and read status
 * 
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'
import { prisma } from '../../utils/database.js'

const app = new Hono()

/**
 * GET / - List conversations with pagination
 * Sorted by lastMessageAt in descending order
 * For agents, only show conversations assigned to them
 * Requirements: 4.1
 */
app.get('/', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const effectiveUserId = getEffectiveUserId(c)
    const isAgent = c.user.role === 'AGENT'
    const agentUserId = c.user.id

    // Get pagination parameters
    const page = parseInt(c.req.query('page') || '1', 10)
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100)
    const skip = (page - 1) * limit

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: effectiveUserId,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // For agents, get the list of conversation IDs assigned to them
    let assignedConversationIds: string[] = []
    if (isAgent) {
      const agentAssignments = await prisma.conversationAssignment.findMany({
        where: {
          businessOwnerId: effectiveUserId,
          conversationType: 'INSTAGRAM',
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
          data: {
            conversations: [],
            pagination: {
              page,
              limit,
              total: 0,
              totalPages: 0,
              hasMore: false
            }
          }
        })
      }
    }

    // Build where clause for conversations
    const conversationWhere: any = { instagramAccountId: igAccount.id }
    if (isAgent && assignedConversationIds.length > 0) {
      conversationWhere.id = { in: assignedConversationIds }
    }

    // Get conversations, total count, and assignments in parallel
    const [conversations, total, assignmentsRaw] = await Promise.all([
      prisma.iGConversation.findMany({
        where: conversationWhere,
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          participantIgsid: true,
          participantUsername: true,
          participantName: true,
          participantProfilePic: true,
          followerCount: true,
          isFollower: true,
          isFollowing: true,
          lastInboundAt: true,
          windowExpiresAt: true,
          isWindowActive: true,
          unreadCount: true,
          lastMessageAt: true,
          lastMessagePreview: true,
          folder: true,
          customerId: true,
          createdAt: true,
          updatedAt: true,
        }
      }),
      prisma.iGConversation.count({
        where: conversationWhere
      }),
      // Fetch active assignments for Instagram conversations
      prisma.conversationAssignment.findMany({
        where: {
          businessOwnerId: effectiveUserId,
          conversationType: 'INSTAGRAM',
          unassignedAt: null,
          // For agents, only show their assignments
          ...(isAgent && assignedConversationIds.length > 0 ? { conversationId: { in: assignedConversationIds } } : {})
        },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              image: true,
            }
          }
        }
      })
    ])

    // Transform assignments to Record<conversationId, assignment>
    const assignments: Record<string, {
      assigneeId: string
      assigneeName: string
      assigneeImage: string | null
      assignedAt: Date
    }> = {}
    for (const assignment of assignmentsRaw) {
      assignments[assignment.conversationId] = {
        assigneeId: assignment.assigneeId,
        assigneeName: assignment.assignee.name,
        assigneeImage: assignment.assignee.image,
        assignedAt: assignment.assignedAt,
      }
    }

    // Check and update window status for each conversation and add assignment data
    const now = new Date()
    const conversationsWithWindowStatus = conversations.map(conv => {
      const assignment = assignments[conv.id]
      return {
        ...conv,
        isWindowActive: conv.windowExpiresAt ? conv.windowExpiresAt > now : false,
        assigneeId: assignment?.assigneeId || null,
        assigneeName: assignment?.assigneeName || null,
        assigneeImage: assignment?.assigneeImage || null,
        assignedAt: assignment?.assignedAt || null,
      }
    })

    return c.json({
      success: true,
      data: {
        conversations: conversationsWithWindowStatus,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: skip + conversations.length < total
        }
      }
    })
  } catch (error) {
    console.error('List conversations error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to list conversations'
      }
    }, 500)
  }
})

/**
 * GET /search - Search conversations by username or message content
 * Requirements: 4.5
 */
app.get('/search', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const query = c.req.query('q')
    if (!query || query.trim().length < 2) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Search query must be at least 2 characters'
        }
      }, 400)
    }

    const page = parseInt(c.req.query('page') || '1', 10)
    const limit = Math.min(parseInt(c.req.query('limit') || '20', 10), 100)
    const skip = (page - 1) * limit

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    const searchTerm = query.trim()

    // Search by username or message content (Requirement 4.5)
    const [conversations, total] = await Promise.all([
      prisma.iGConversation.findMany({
        where: {
          instagramAccountId: igAccount.id,
          OR: [
            { participantUsername: { contains: searchTerm, mode: 'insensitive' } },
            { participantName: { contains: searchTerm, mode: 'insensitive' } },
            {
              messages: {
                some: {
                  text: { contains: searchTerm, mode: 'insensitive' }
                }
              }
            }
          ]
        },
        orderBy: { lastMessageAt: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          participantIgsid: true,
          participantUsername: true,
          participantName: true,
          participantProfilePic: true,
          followerCount: true,
          isFollower: true,
          isFollowing: true,
          lastInboundAt: true,
          windowExpiresAt: true,
          isWindowActive: true,
          unreadCount: true,
          lastMessageAt: true,
          lastMessagePreview: true,
          folder: true,
          customerId: true,
          createdAt: true,
          updatedAt: true,
        }
      }),
      prisma.iGConversation.count({
        where: {
          instagramAccountId: igAccount.id,
          OR: [
            { participantUsername: { contains: searchTerm, mode: 'insensitive' } },
            { participantName: { contains: searchTerm, mode: 'insensitive' } },
            {
              messages: {
                some: {
                  text: { contains: searchTerm, mode: 'insensitive' }
                }
              }
            }
          ]
        }
      })
    ])

    // Check and update window status
    const now = new Date()
    const conversationsWithWindowStatus = conversations.map(conv => ({
      ...conv,
      isWindowActive: conv.windowExpiresAt ? conv.windowExpiresAt > now : false,
    }))

    return c.json({
      success: true,
      data: {
        conversations: conversationsWithWindowStatus,
        query: searchTerm,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: skip + conversations.length < total
        }
      }
    })
  } catch (error) {
    console.error('Search conversations error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to search conversations'
      }
    }, 500)
  }
})

/**
 * GET /:id - Get conversation detail
 * Requirements: 4.2
 */
app.get('/:id', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
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

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true, igId: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get conversation detail (Requirement 4.2)
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            instagramUsername: true,
          }
        }
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

    // Check window status
    const now = new Date()
    const isWindowActive = conversation.windowExpiresAt ? conversation.windowExpiresAt > now : false

    return c.json({
      success: true,
      data: {
        ...conversation,
        isWindowActive,
        igAccountId: igAccount.igId
      }
    })
  } catch (error) {
    console.error('Get conversation error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get conversation'
      }
    }, 500)
  }
})

/**
 * GET /:id/messages - Get messages for a conversation with pagination
 * Requirements: 4.2
 */
app.get('/:id/messages', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
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
    const page = parseInt(c.req.query('page') || '1', 10)
    const limit = Math.min(parseInt(c.req.query('limit') || '50', 10), 100)
    const skip = (page - 1) * limit

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Verify conversation belongs to user's Instagram account
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
      },
      select: { id: true }
    })

    if (!conversation) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Conversation not found'
        }
      }, 404)
    }

    // Get messages with pagination (Requirement 4.2)
    const [messages, total] = await Promise.all([
      prisma.iGMessage.findMany({
        where: { conversationId },
        orderBy: { timestamp: 'desc' },
        skip,
        take: limit,
        select: {
          id: true,
          igMessageId: true,
          direction: true,
          messageType: true,
          text: true,
          mediaUrl: true,
          mediaType: true,
          storyId: true,
          sharedPostUrl: true,
          status: true,
          errorCode: true,
          errorSubcode: true,
          errorMessage: true,
          reaction: true,
          timestamp: true,
          readAt: true,
          createdAt: true,
        }
      }),
      prisma.iGMessage.count({
        where: { conversationId }
      })
    ])

    return c.json({
      success: true,
      data: {
        messages: messages.reverse(), // Return in chronological order
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: skip + messages.length < total
        }
      }
    })
  } catch (error) {
    console.error('Get messages error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get messages'
      }
    }, 500)
  }
})

/**
 * POST /:id/read - Mark messages as read
 * Requirements: 4.4
 */
app.post('/:id/read', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
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

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Verify conversation belongs to user's Instagram account
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
      },
      select: { id: true, unreadCount: true }
    })

    if (!conversation) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Conversation not found'
        }
      }, 404)
    }

    // Mark all inbound messages as read and reset unread count (Requirement 4.4)
    const now = new Date()
    
    await Promise.all([
      // Update unread inbound messages
      prisma.iGMessage.updateMany({
        where: {
          conversationId,
          direction: 'INBOUND',
          readAt: null
        },
        data: {
          readAt: now
        }
      }),
      // Reset conversation unread count
      prisma.iGConversation.update({
        where: { id: conversationId },
        data: { unreadCount: 0 }
      })
    ])

    return c.json({
      success: true,
      message: 'Messages marked as read'
    })
  } catch (error) {
    console.error('Mark messages read error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to mark messages as read'
      }
    }, 500)
  }
})

/**
 * GET /:id/suggested-customers - Find matching customers by Instagram username
 * Requirements: 6.3
 */
app.get('/:id/suggested-customers', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
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

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get conversation with participant info
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
      },
      select: {
        id: true,
        participantUsername: true,
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

    // If already linked, return the linked customer
    if (conversation.customerId) {
      const linkedCustomer = await prisma.customer.findUnique({
        where: { id: conversation.customerId },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          instagramUsername: true,
          instagramIgsid: true,
        }
      })
      return c.json({
        success: true,
        data: {
          linkedCustomer,
          suggestedCustomers: []
        }
      })
    }

    // Find customers matching by Instagram username (Requirement 6.3)
    // Build OR conditions dynamically
    const orConditions = []
    
    if (conversation.participantUsername) {
      orConditions.push({
        instagramUsername: {
          equals: conversation.participantUsername,
          mode: 'insensitive' as const
        }
      })
    }
    
    if (conversation.participantName) {
      orConditions.push({
        name: {
          contains: conversation.participantName,
          mode: 'insensitive' as const
        }
      })
    }

    const suggestedCustomers = orConditions.length > 0 
      ? await prisma.customer.findMany({
          where: {
            userId: c.user.id,
            OR: orConditions
          },
          select: {
            id: true,
            name: true,
            phoneNumber: true,
            instagramUsername: true,
            instagramIgsid: true,
          },
          take: 10
        })
      : []

    return c.json({
      success: true,
      data: {
        linkedCustomer: null,
        suggestedCustomers,
        conversationParticipant: {
          username: conversation.participantUsername,
          name: conversation.participantName
        }
      }
    })
  } catch (error) {
    console.error('Get suggested customers error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get suggested customers'
      }
    }, 500)
  }
})

/**
 * POST /:id/link-customer - Link conversation to existing customer
 * Requirements: 6.1, 6.4
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

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get conversation with participant info
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
      },
      select: {
        id: true,
        participantIgsid: true,
        participantUsername: true,
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
        phoneNumber: true,
        instagramIgsid: true,
        instagramUsername: true
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

    // Check if customer is already linked to another Instagram conversation
    if (customer.instagramIgsid && customer.instagramIgsid !== conversation.participantIgsid) {
      return c.json({
        error: {
          code: 'Conflict',
          message: 'Customer is already linked to another Instagram account'
        }
      }, 409)
    }

    // Link conversation to customer and update customer with Instagram info (Requirements 6.1, 6.4)
    const [updatedConversation, updatedCustomer] = await prisma.$transaction([
      // Update conversation with customer link
      prisma.iGConversation.update({
        where: { id: conversationId },
        data: { customerId },
        select: {
          id: true,
          participantIgsid: true,
          participantUsername: true,
          customerId: true,
          customer: {
            select: {
              id: true,
              name: true,
              phoneNumber: true,
              instagramUsername: true,
              instagramIgsid: true
            }
          }
        }
      }),
      // Update customer with Instagram IGSID and username (Requirement 6.4)
      prisma.customer.update({
        where: { id: customerId },
        data: {
          instagramIgsid: conversation.participantIgsid,
          instagramUsername: conversation.participantUsername
        },
        select: {
          id: true,
          name: true,
          phoneNumber: true,
          instagramUsername: true,
          instagramIgsid: true
        }
      })
    ])

    return c.json({
      success: true,
      message: 'Customer linked successfully',
      data: {
        conversation: updatedConversation,
        customer: updatedCustomer
      }
    })
  } catch (error) {
    console.error('Link customer error:', error)
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
 * Requirements: 6.1
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

    // Get user's Instagram account
    const igAccount = await prisma.instagramAccount.findFirst({
      where: { 
        userId: c.user.id,
        connectionStatus: 'connected'
      },
      select: { id: true }
    })

    if (!igAccount) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'No connected Instagram account found'
        }
      }, 404)
    }

    // Get conversation
    const conversation = await prisma.iGConversation.findFirst({
      where: {
        id: conversationId,
        instagramAccountId: igAccount.id
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
    await prisma.iGConversation.update({
      where: { id: conversationId },
      data: { customerId: null }
    })

    return c.json({
      success: true,
      message: 'Customer unlinked successfully'
    })
  } catch (error) {
    console.error('Unlink customer error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to unlink customer'
      }
    }, 500)
  }
})

export default app
