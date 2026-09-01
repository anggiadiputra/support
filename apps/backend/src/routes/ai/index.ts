import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import { AIOrchestrator } from '../../services/ai/AIOrchestrator.js'
import { adminSettingsService } from '../../services/admin/settings-service.js'
import { checkFeatureAccess } from '../../middleware/subscription.js'
import { createMemoryVectorStore } from '../../services/ai/memory/index.js'
import { OpenAIProvider } from '../../services/ai/providers/OpenAIProvider.js'
import { aiTestChatRateLimiter } from '../../middleware/rateLimiter.js'
import agents from './agents.js'
import knowledge from './knowledge.js'
import {
  getEscalationGroups,
  createEscalationGroup,
  updateEscalationGroup,
  deleteEscalationGroup,
} from '../../services/ai/escalation-groups.js'

// ============================================================================
// Zod Schemas for Escalation Groups
// ============================================================================

const createEscalationGroupSchema = z.object({
  configId: z.string().min(1, 'configId is required'),
  name: z.string().min(1, 'name is required').max(100, 'name must be 100 characters or less'),
  keywords: z.array(z.string().min(1).max(100)).min(1, 'At least one keyword is required').max(50, 'Maximum 50 keywords allowed'),
  assignedAgentId: z.string().min(1, 'assignedAgentId is required'),
})

const updateEscalationGroupSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  keywords: z.array(z.string().min(1).max(100)).min(1).max(50).optional(),
  assignedAgentId: z.string().min(1).optional(),
})

const app = new Hono()
const orchestrator = new AIOrchestrator()

app.route('/agents', agents)
app.route('/knowledge', knowledge)

// GET /api/v1/ai/models - Get available AI models
app.get('/models', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    const result = await adminSettingsService.fetchOpenAIModels()
    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Failed to fetch AI models:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to fetch models',
      },
    }, 500)
  }
})

// GET /api/v1/ai/config - Get AI config
// Supports optional ?whatsappAccountId= for per-account config
app.get('/config', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')

    // Per-account config request
    if (whatsappAccountId) {
      // Verify account belongs to user
      const account = await prisma.whatsAppAccount.findFirst({
        where: { id: whatsappAccountId, userId: c.user.id },
      })
      if (!account) {
        return c.json({ error: { code: 'NotFound', message: 'WhatsApp account not found' } }, 404)
      }

      // Try per-account config
      const accountConfig = await prisma.whatsAppAccountAIConfig.findUnique({
        where: {
          userId_whatsappAccountId: { userId: c.user.id, whatsappAccountId },
        },
      })

      if (accountConfig) {
        return c.json({ success: true, data: accountConfig, isCustomized: true })
      }

      // Fall back to user-level config (return with isCustomized: false)
      let userConfig = await prisma.aIConfig.findUnique({
        where: { userId: c.user.id },
      })
      if (!userConfig) {
        userConfig = await prisma.aIConfig.create({
          data: { userId: c.user.id },
        })
      }
      return c.json({ success: true, data: userConfig, isCustomized: false })
    }

    // Global config (existing behavior)
    const config = await prisma.aIConfig.findUnique({
      where: { userId: c.user.id },
    })

    if (!config) {
      const newConfig = await prisma.aIConfig.create({
        data: { userId: c.user.id },
      })
      return c.json({ success: true, data: newConfig })
    }

    return c.json({ success: true, data: config })
  } catch (error) {
    console.error('Failed to fetch AI config:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch AI config' } }, 500)
  }
})

// POST /api/v1/ai/config - Update AI config
// Supports optional ?whatsappAccountId= for per-account config
app.post('/config', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const body = await c.req.json()

    // SECURITY: Check AI feature access before allowing config changes
    // Only check if user is trying to enable AI
    if (body.enabled === true) {
      const hasAccess = await checkFeatureAccess(c.user.id, 'aiChatbot')
      if (!hasAccess) {
        return c.json({ 
          error: { 
            code: 'Forbidden', 
            message: 'AI Chatbot is not available in your current plan. Please upgrade to LITE or higher.' 
          } 
        }, 403)
      }
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')

    // Per-account config update
    if (whatsappAccountId) {
      // Verify account belongs to user
      const account = await prisma.whatsAppAccount.findFirst({
        where: { id: whatsappAccountId, userId: c.user.id },
      })
      if (!account) {
        return c.json({ error: { code: 'NotFound', message: 'WhatsApp account not found' } }, 404)
      }

      const updatedConfig = await prisma.whatsAppAccountAIConfig.upsert({
        where: {
          userId_whatsappAccountId: { userId: c.user.id, whatsappAccountId },
        },
        create: {
          userId: c.user.id,
          whatsappAccountId,
          enabled: body.enabled ?? false,
          activeAgentId: body.activeAgentId ?? null,
          temperature: body.temperature ?? 0.7,
          filterWords: body.filterWords ?? null,
          excludedCustomers: body.excludedCustomers ?? null,
          // Working Hours & Escalation
          timezone: body.timezone ?? 'Asia/Jakarta',
          workingHours: body.workingHours ?? null,
          escalationKeywords: body.escalationKeywords ?? null,
          escalationAutoAssign: body.escalationAutoAssign ?? true,
        },
        update: {
          enabled: body.enabled,
          activeAgentId: body.activeAgentId,
          temperature: body.temperature,
          filterWords: body.filterWords,
          excludedCustomers: body.excludedCustomers,
          // Working Hours & Escalation
          timezone: body.timezone,
          workingHours: body.workingHours,
          escalationKeywords: body.escalationKeywords,
          escalationAutoAssign: body.escalationAutoAssign,
        },
      })

      return c.json({ success: true, data: updatedConfig })
    }

    // Global config update (existing behavior)
    const updatedConfig = await prisma.aIConfig.update({
      where: { userId: c.user.id },
      data: {
        enabled: body.enabled,
        model: body.model,
        temperature: body.temperature,
        filterWords: body.filterWords,
        excludedCustomers: body.excludedCustomers,
        activeAgentId: body.activeAgentId,
        // Working Hours & Escalation
        timezone: body.timezone,
        workingHours: body.workingHours,
        escalationKeywords: body.escalationKeywords,
        escalationAutoAssign: body.escalationAutoAssign,
      },
    })

    return c.json({ success: true, data: updatedConfig })
  } catch (error) {
    console.error('Failed to update AI config:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to update AI config' } }, 500)
  }
})

// DELETE /api/v1/ai/config - Delete per-account config (revert to global defaults)
app.delete('/config', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')
    if (!whatsappAccountId) {
      return c.json({ error: { code: 'BadRequest', message: 'whatsappAccountId is required' } }, 400)
    }

    await prisma.whatsAppAccountAIConfig.deleteMany({
      where: { userId: c.user.id, whatsappAccountId },
    })

    return c.json({ success: true })
  } catch (error) {
    console.error('Failed to delete per-account AI config:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete config' } }, 500)
  }
})

// GET /api/v1/ai/customers/search - Search customers for exclusion filter
app.get('/customers/search', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const query = c.req.query('q') || ''
    const whatsappAccountId = c.req.query('whatsappAccountId')

    // Build where clause - Customer relates to PhoneNumber which relates to WhatsAppAccount
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const whereClause: any = {
      userId: c.user.id,
    }

    // If whatsappAccountId provided, filter customers linked to phone numbers of that account
    if (whatsappAccountId) {
      whereClause.whatsappPhoneNumber = {
        whatsappAccountId: whatsappAccountId,
      }
    }

    // If search query provided, filter by phone or name
    if (query.length > 0) {
      whereClause.OR = [
        { phoneNumber: { contains: query, mode: 'insensitive' } },
        { name: { contains: query, mode: 'insensitive' } },
      ]
    }

    const customers = await prisma.customer.findMany({
      where: whereClause,
      select: {
        id: true,
        phoneNumber: true,
        name: true,
      },
      take: 20,
      orderBy: { updatedAt: 'desc' },
    })

    return c.json({ success: true, data: customers })
  } catch (error) {
    console.error('Failed to search customers:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to search customers' } }, 500)
  }
})

// GET /api/v1/ai/memory/count - Get memory count for a WhatsApp account
app.get('/memory/count', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')
    if (!whatsappAccountId) {
      return c.json({ error: { code: 'BadRequest', message: 'whatsappAccountId is required' } }, 400)
    }

    // Verify account belongs to user
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: whatsappAccountId, userId: c.user.id },
    })
    if (!account) {
      return c.json({ error: { code: 'NotFound', message: 'WhatsApp account not found' } }, 404)
    }

    const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '')
    const memoryStore = createMemoryVectorStore(openaiProvider)
    const count = await memoryStore.getCountByWhatsAppAccountId(c.user.id, whatsappAccountId)

    return c.json({ success: true, data: { count } })
  } catch (error) {
    console.error('Failed to get memory count:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to get memory count' } }, 500)
  }
})

// DELETE /api/v1/ai/memory - Delete all memories for a WhatsApp account
app.delete('/memory', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')
    if (!whatsappAccountId) {
      return c.json({ error: { code: 'BadRequest', message: 'whatsappAccountId is required' } }, 400)
    }

    // Verify account belongs to user
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: whatsappAccountId, userId: c.user.id },
    })
    if (!account) {
      return c.json({ error: { code: 'NotFound', message: 'WhatsApp account not found' } }, 404)
    }

    const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '')
    const memoryStore = createMemoryVectorStore(openaiProvider)
    const deletedCount = await memoryStore.deleteByWhatsAppAccountId(c.user.id, whatsappAccountId)

    return c.json({ success: true, data: { deletedCount } })
  } catch (error) {
    console.error('Failed to delete memories:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete memories' } }, 500)
  }
})

// GET /api/v1/ai/memory/customers - Get list of customers with memory for a WhatsApp account (paginated)
app.get('/memory/customers', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')
    if (!whatsappAccountId) {
      return c.json({ error: { code: 'BadRequest', message: 'whatsappAccountId is required' } }, 400)
    }

    // Pagination params
    const page = parseInt(c.req.query('page') || '1', 10)
    const limit = parseInt(c.req.query('limit') || '20', 10)
    const search = c.req.query('search') || ''

    // Verify account belongs to user
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: whatsappAccountId, userId: c.user.id },
    })
    if (!account) {
      return c.json({ error: { code: 'NotFound', message: 'WhatsApp account not found' } }, 404)
    }

    const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '')
    const memoryStore = createMemoryVectorStore(openaiProvider)
    const result = await memoryStore.getCustomersWithMemory(c.user.id, whatsappAccountId, {
      page,
      limit,
      search,
    })

    return c.json({ success: true, data: result })
  } catch (error) {
    console.error('Failed to get customers with memory:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to get customers' } }, 500)
  }
})

// DELETE /api/v1/ai/memory/customer - Delete memories for a specific customer
app.delete('/memory/customer', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const whatsappAccountId = c.req.query('whatsappAccountId')
    const customerId = c.req.query('customerId')
    
    if (!whatsappAccountId) {
      return c.json({ error: { code: 'BadRequest', message: 'whatsappAccountId is required' } }, 400)
    }
    if (!customerId) {
      return c.json({ error: { code: 'BadRequest', message: 'customerId is required' } }, 400)
    }

    // Verify account belongs to user
    const account = await prisma.whatsAppAccount.findFirst({
      where: { id: whatsappAccountId, userId: c.user.id },
    })
    if (!account) {
      return c.json({ error: { code: 'NotFound', message: 'WhatsApp account not found' } }, 404)
    }

    const openaiProvider = new OpenAIProvider(process.env.OPENAI_API_KEY || '')
    const memoryStore = createMemoryVectorStore(openaiProvider)
    const deletedCount = await memoryStore.deleteByCustomerId(c.user.id, whatsappAccountId, customerId)

    return c.json({ success: true, data: { deletedCount } })
  } catch (error) {
    console.error('Failed to delete customer memories:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete memories' } }, 500)
  }
})

// POST /api/v1/ai/test-chat - Test chat with AI agent
// Rate limited to prevent OpenAI credit abuse
app.post('/test-chat', aiTestChatRateLimiter, requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const { message, agentId, history } = await c.req.json()

    if (!message || typeof message !== 'string') {
      return c.json({ error: { code: 'BadRequest', message: 'Message is required' } }, 400)
    }

    if (!agentId) {
      return c.json({ error: { code: 'BadRequest', message: 'Agent ID is required' } }, 400)
    }

    // Validate history format if provided
    const validatedHistory: { role: 'user' | 'assistant'; content: string }[] = []
    if (history && Array.isArray(history)) {
      for (const msg of history) {
        if (
          msg &&
          typeof msg === 'object' &&
          (msg.role === 'user' || msg.role === 'assistant') &&
          typeof msg.content === 'string'
        ) {
          validatedHistory.push({ role: msg.role, content: msg.content })
        }
      }
    }

    // Verify the agent belongs to this user
    const agent = await prisma.aIAgent.findFirst({
      where: { id: agentId, userId: c.user.id },
    })

    if (!agent) {
      return c.json({ error: { code: 'NotFound', message: 'Agent not found' } }, 404)
    }

    // Use the orchestrator to generate a response
    // Pass isTestMode=true to bypass enabled/working hours/escalation checks
    // Pass history for conversation context retention in test mode
    const response = await orchestrator.handleMessage(
      c.user.id,
      message,
      undefined, // No customer ID for test
      agentId,   // Use specific agent
      undefined, // No WhatsApp account ID for test
      true,      // isTestMode - allows testing without enabling AI
      validatedHistory.length > 0 ? validatedHistory : undefined // Conversation history for test
    )

    if (!response) {
      return c.json({
        success: true,
        data: {
          response: 'AI tidak dapat merespons. Pastikan agent memiliki knowledge base yang sudah selesai diproses.',
          isError: true,
        },
      })
    }

    return c.json({
      success: true,
      data: {
        response,
        isError: false,
      },
    })
  } catch (error) {
    console.error('Failed to test chat:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to generate response',
      },
    }, 500)
  }
})

// ============================================================================
// Escalation Keyword Groups Routes
// ============================================================================

// GET /api/v1/ai/escalation-groups?configId= - Get escalation groups for a config
app.get('/escalation-groups', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const configId = c.req.query('configId')
    if (!configId) {
      return c.json({ error: { code: 'BadRequest', message: 'configId is required' } }, 400)
    }

    // Verify config belongs to user
    const config = await prisma.whatsAppAccountAIConfig.findFirst({
      where: { id: configId, userId: c.user.id },
    })

    if (!config) {
      return c.json({ error: { code: 'NotFound', message: 'Config not found' } }, 404)
    }

    const groups = await getEscalationGroups(configId)
    return c.json({ success: true, data: groups })
  } catch (error) {
    console.error('Failed to get escalation groups:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get escalation groups',
      },
    }, 500)
  }
})

// POST /api/v1/ai/escalation-groups - Create escalation group
app.post('/escalation-groups', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const body = await c.req.json()
    
    // Validate input with Zod
    const parseResult = createEscalationGroupSchema.safeParse(body)
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues.map(e => e.message).join(', ')
      return c.json({
        error: { code: 'BadRequest', message: errorMessage },
      }, 400)
    }
    
    const { configId, name, keywords, assignedAgentId } = parseResult.data

    // Verify config belongs to user
    const config = await prisma.whatsAppAccountAIConfig.findFirst({
      where: { id: configId, userId: c.user.id },
    })

    if (!config) {
      return c.json({ error: { code: 'NotFound', message: 'Config not found' } }, 404)
    }

    // Verify agent belongs to user's team
    const agent = await prisma.user.findFirst({
      where: {
        id: assignedAgentId,
        OR: [
          { id: c.user.id }, // Business owner themselves
          { agentMembership: { businessOwnerId: c.user.id } }, // Team member
        ],
      },
    })

    if (!agent) {
      return c.json({ error: { code: 'NotFound', message: 'Agent not found in your team' } }, 404)
    }

    const group = await createEscalationGroup({
      whatsappAccountAIConfigId: configId,
      name,
      keywords,
      assignedAgentId,
    })

    return c.json({ success: true, data: group }, 201)
  } catch (error) {
    console.error('Failed to create escalation group:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to create escalation group',
      },
    }, 500)
  }
})

// PUT /api/v1/ai/escalation-groups/:id - Update escalation group
app.put('/escalation-groups/:id', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const groupId = c.req.param('id')
    const body = await c.req.json()
    
    // Validate input with Zod
    const parseResult = updateEscalationGroupSchema.safeParse(body)
    if (!parseResult.success) {
      const errorMessage = parseResult.error.issues.map(e => e.message).join(', ')
      return c.json({
        error: { code: 'BadRequest', message: errorMessage },
      }, 400)
    }
    
    const { name, keywords, assignedAgentId } = parseResult.data

    // Verify group belongs to user's config
    const existingGroup = await prisma.escalationKeywordGroup.findFirst({
      where: { id: groupId },
      include: { whatsappAccountAIConfig: { select: { userId: true } } },
    })

    if (!existingGroup || existingGroup.whatsappAccountAIConfig.userId !== c.user.id) {
      return c.json({ error: { code: 'NotFound', message: 'Escalation group not found' } }, 404)
    }

    // If updating agent, verify agent belongs to user's team
    if (assignedAgentId) {
      const agent = await prisma.user.findFirst({
        where: {
          id: assignedAgentId,
          OR: [
            { id: c.user.id },
            { agentMembership: { businessOwnerId: c.user.id } },
          ],
        },
      })

      if (!agent) {
        return c.json({ error: { code: 'NotFound', message: 'Agent not found in your team' } }, 404)
      }
    }

    const group = await updateEscalationGroup(groupId, { name, keywords, assignedAgentId })
    return c.json({ success: true, data: group })
  } catch (error) {
    console.error('Failed to update escalation group:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to update escalation group',
      },
    }, 500)
  }
})

// DELETE /api/v1/ai/escalation-groups/:id - Delete escalation group
app.delete('/escalation-groups/:id', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const groupId = c.req.param('id')

    // Verify group belongs to user's config
    const existingGroup = await prisma.escalationKeywordGroup.findFirst({
      where: { id: groupId },
      include: { whatsappAccountAIConfig: { select: { userId: true } } },
    })

    if (!existingGroup || existingGroup.whatsappAccountAIConfig.userId !== c.user.id) {
      return c.json({ error: { code: 'NotFound', message: 'Escalation group not found' } }, 404)
    }

    await deleteEscalationGroup(groupId)
    return c.json({ success: true, message: 'Escalation group deleted' })
  } catch (error) {
    console.error('Failed to delete escalation group:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to delete escalation group',
      },
    }, 500)
  }
})

// GET /api/v1/ai/team-agents - Get agents available for assignment
app.get('/team-agents', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // Get business owner + their team agents
    const agents = await prisma.user.findMany({
      where: {
        OR: [
          { id: c.user.id }, // Business owner
          { agentMembership: { businessOwnerId: c.user.id } }, // Team members
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
      },
      orderBy: { name: 'asc' },
    })

    return c.json({ success: true, data: agents })
  } catch (error) {
    console.error('Failed to get team agents:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Failed to get team agents',
      },
    }, 500)
  }
})

export default app
