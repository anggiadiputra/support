import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// GET /api/v1/messages - List messages
// Only returns messages from connected WhatsApp accounts
// Supports cursor-based pagination for infinite scroll
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ 
        error: { 
          code: 'Unauthorized', 
          message: 'Authentication required' 
        } 
      }, 401)
    }

    // Use effectiveUserId for agents to access business owner's data
    // Requirements: 5.3, 6.2
    const effectiveUserId = getEffectiveUserId(c)
    const customerId = c.req.query('customerId')
    
    // Pagination parameters
    const cursor = c.req.query('cursor') // ISO timestamp of last conversation's most recent message
    const limitParam = c.req.query('limit')
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 200

    // Get phone numbers from connected WhatsApp accounts only
    const connectedPhoneNumbers = await prisma.phoneNumber.findMany({
      where: {
        whatsappAccount: {
          userId: effectiveUserId,
          connectionStatus: 'connected'
        }
      },
      select: { id: true }
    })
    const connectedPhoneNumberIds = connectedPhoneNumbers.map(p => p.id)

    // Build the where clause
    const where: any = { userId: effectiveUserId }
    if (customerId) {
      where.customerId = customerId
    }
    
    // Filter to only show messages from customers linked to connected WhatsApp numbers
    if (connectedPhoneNumberIds.length > 0) {
      where.customer = {
        OR: [
          { whatsappPhoneNumberId: { in: connectedPhoneNumberIds } },
          { whatsappPhoneNumberId: null } // Include non-WhatsApp customers (Instagram, Messenger)
        ]
      }
    } else {
      // No connected WhatsApp accounts - only show non-WhatsApp messages
      where.customer = { whatsappPhoneNumberId: null }
    }

    // Fetch messages, unread counts, and assignments in parallel
    // Requirements: 5.1, 5.2 - Calculate unread counts efficiently using database queries
    // 
    // FIX: Previously we were limiting to 100 messages, which caused conversations to be missing
    // when one customer had many messages. Now we:
    // 1. First get all unique customer IDs with recent messages (with pagination support)
    // 2. Then fetch messages only for those customers
    // This ensures all conversations are visible, not just those with recent messages in the top 100
    
    // Step 1: Get unique customer IDs ordered by most recent message
    // For cursor-based pagination, we need to get customers whose last message is older than cursor
    const recentCustomersWhere = { ...where }
    if (cursor) {
      // Only get conversations with messages older than the cursor timestamp
      recentCustomersWhere.timestamp = { lt: new Date(cursor) }
    }
    
    const recentCustomers = await prisma.message.findMany({
      where: recentCustomersWhere,
      select: {
        customerId: true,
        timestamp: true,
      },
      orderBy: { timestamp: 'desc' },
      distinct: ['customerId'],
      take: limit + 1, // Fetch one extra to check if there are more
    })
    
    // Check if there are more results
    const hasMore = recentCustomers.length > limit
    
    // Only use first `limit` customers
    const customersToFetch = hasMore ? recentCustomers.slice(0, limit) : recentCustomers
    
    // Get the cursor for the next page (timestamp of the last conversation)
    const nextCursor = hasMore && customersToFetch.length > 0 
      ? customersToFetch[customersToFetch.length - 1].timestamp.toISOString()
      : null
    
    const customerIds = customersToFetch.map(c => c.customerId)
    
    // Step 2: Fetch messages for these customers (with a higher limit to ensure all recent messages)
    const [messages, unreadCountsRaw, assignmentsRaw] = await Promise.all([
      prisma.message.findMany({
        where: {
          ...where,
          customerId: { in: customerIds.length > 0 ? customerIds : ['__none__'] }
        },
        include: {
          customer: {
            select: {
              id: true,
              phoneNumber: true,
              name: true,
              whatsappPhoneNumberId: true,
              whatsappPhoneNumber: {
                select: {
                  id: true,
                  displayPhoneNumber: true,
                  phoneNumberId: true,
                }
              }
            }
          },
          user: {
            select: { 
              id: true, 
              name: true, 
              email: true 
            }
          },
          template: {
            select: { 
              id: true, 
              templateName: true, 
              category: true,
              headerType: true,
              headerContent: true,
              footerContent: true,
              buttons: true,
            }
          }
        },
        orderBy: { timestamp: 'desc' },
        take: 2000 // Higher limit since we're fetching for specific customers
      }),
      // Calculate unread counts per customer
      // Requirements: 1.1, 5.1 - Count INBOUND messages with status NOT equal to READ
      prisma.message.groupBy({
        by: ['customerId'],
        where: {
          userId: effectiveUserId,
          direction: 'INBOUND',
          status: { not: 'READ' },
        },
        _count: { id: true }
      }),
      // Fetch active assignments for WhatsApp conversations
      prisma.conversationAssignment.findMany({
        where: {
          businessOwnerId: effectiveUserId,
          conversationType: 'WHATSAPP',
          unassignedAt: null, // Only active assignments
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

    // Transform unread counts to Record<string, number>
    const unreadCounts: Record<string, number> = {}
    for (const item of unreadCountsRaw) {
      unreadCounts[item.customerId] = item._count.id
    }

    // Transform assignments to Record<conversationId, assignment>
    // Support both HUMAN and AI_AGENT assignment types
    const assignments: Record<string, {
      assigneeId: string | null
      assigneeName: string | null
      assigneeImage: string | null
      assigneeType: string
      aiAgentId: string | null
      aiAgentName: string | null
      assignedAt: Date
    }> = {}
    for (const assignment of assignmentsRaw) {
      // Handle both HUMAN and AI_AGENT assignment types
      const isAIAgent = assignment.assigneeType === 'AI_AGENT'
      assignments[assignment.conversationId] = {
        assigneeId: assignment.assigneeId,
        assigneeName: assignment.assignee?.name ?? null,
        assigneeImage: assignment.assignee?.image ?? null,
        assigneeType: assignment.assigneeType,
        aiAgentId: assignment.aiAgentId,
        aiAgentName: assignment.aiAgent?.name ?? null,
        assignedAt: assignment.assignedAt,
      }
    }

    return c.json({ 
      success: true, 
      data: messages,
      unreadCounts,
      assignments,
      pagination: {
        hasMore,
        nextCursor,
        limit
      }
    })
  } catch (error) {
    console.error('List messages error:', error)
    return c.json({ 
      error: { 
        code: 'InternalServerError', 
        message: 'Failed to fetch messages' 
      } 
    }, 500)
  }
})

export default app
