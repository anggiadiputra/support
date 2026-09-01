/**
 * Internal Conversations API Routes
 * Handles conversation-level operations like typing indicators
 */
import { Hono } from 'hono';
import type { Context } from 'hono';
import { prisma } from '../utils/database.js';
import { WhatsAppAPI } from '../utils/whatsapp.js';
import { cacheRedis } from '../utils/cache.js';
import { logger } from '../utils/logger.js';
import { instagramService, InstagramError, IGErrorCode } from '../services/InstagramService.js';
import { resolveCredentialsForSending } from '../utils/whatsapp-account-helper.js';
import { resolveContext, getEffectiveUserId } from '../middleware/resolveContext.js';

const app = new Hono();

// Apply context resolution for all conversation routes
// This sets effectiveUserId for agents to access business owner's data
app.use('/*', resolveContext);

// Typing indicator rate limit: 1 request per 3 seconds per customer
const TYPING_RATE_LIMIT_SECONDS = 3;
const TYPING_RATE_LIMIT_KEY_PREFIX = 'ratelimit:typing:';

/**
 * Check typing indicator rate limit
 */
async function checkTypingRateLimit(customerId: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  const key = `${TYPING_RATE_LIMIT_KEY_PREFIX}${customerId}`;
  
  try {
    const exists = await cacheRedis.exists(key);
    
    if (exists) {
      const ttl = await cacheRedis.ttl(key);
      return { allowed: false, retryAfter: ttl > 0 ? ttl : TYPING_RATE_LIMIT_SECONDS };
    }
    
    // Set rate limit key
    await cacheRedis.setex(key, TYPING_RATE_LIMIT_SECONDS, '1');
    return { allowed: true };
  } catch (error) {
    logger.error('Typing rate limit check error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    // Fail open
    return { allowed: true };
  }
}

/**
 * POST /api/v1/conversations/:customerId/typing
 * Send typing indicator to a customer
 * 
 * Uses session auth (internal dashboard)
 */
app.post('/:customerId/typing', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c);
    const customerId = c.req.param('customerId');
    
    if (!customerId) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'customer_id is required',
        },
      }, 400);
    }
    
    // Get customer and verify ownership
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      include: {
        igConversations: {
          include: {
            instagramAccount: true,
          },
        },
      },
    });
    
    if (!customer) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Customer not found',
        },
      }, 404);
    }
    
    if (customer.userId !== userId) {
      return c.json({
        error: {
          code: 'Forbidden',
          message: 'Customer does not belong to authenticated user',
        },
      }, 403);
    }
    
    // Check rate limit (1 request per 3 seconds per customer)
    const rateLimitResult = await checkTypingRateLimit(customer.id);
    if (!rateLimitResult.allowed) {
      return c.json({
        error: {
          code: 'RateLimitExceeded',
          message: 'Typing indicator rate limit exceeded. Maximum 1 request per 3 seconds per customer.',
          retryAfter: rateLimitResult.retryAfter,
        },
      }, 429);
    }
    
    // Get channel from request body
    let requestedChannel: string | undefined;
    try {
      const body = await c.req.json();
      requestedChannel = body?.channel;
    } catch {
      // No body or invalid JSON - will auto-detect channel
    }
    
    // Determine channel based on request or customer data
    const hasWhatsApp = !!customer.phoneNumber;
    const hasInstagram = customer.igConversations && customer.igConversations.length > 0;
    
    // If channel is explicitly specified, use it
    if (requestedChannel === 'instagram') {
      if (!hasInstagram) {
        return c.json({
          error: {
            code: 'ConfigurationError',
            message: 'Customer has no Instagram conversation',
          },
        }, 400);
      }
      return await sendInstagramTyping(c, customer);
    } else if (requestedChannel === 'whatsapp') {
      if (!hasWhatsApp) {
        return c.json({
          error: {
            code: 'ConfigurationError',
            message: 'Customer has no WhatsApp phone number',
          },
        }, 400);
      }
      return await sendWhatsAppTyping(c, userId, customer);
    }

    // Auto-detect: prefer WhatsApp if both are available
    if (hasWhatsApp) {
      return await sendWhatsAppTyping(c, userId, customer);
    } else if (hasInstagram) {
      return await sendInstagramTyping(c, customer);
    } else {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'Customer has no messaging channel configured',
        },
      }, 400);
    }
    
  } catch (error: unknown) {
    logger.error('Typing indicator error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to send typing indicator',
      },
    }, 500);
  }
});

/**
 * Send typing indicator via WhatsApp
 */
async function sendWhatsAppTyping(
  c: Context,
  userId: string,
  customer: { id: string; phoneNumber: string | null }
): Promise<Response> {
  if (!customer.phoneNumber) {
    return c.json({
      error: {
        code: 'ConfigurationError',
        message: 'Customer has no phone number',
      },
    }, 400);
  }
  
  // Resolve credentials for sending
  const credentials = await resolveCredentialsForSending(userId, customer.id);
  
  if (!credentials) {
    return c.json({
      error: {
        code: 'ConfigurationError',
        message: 'No WhatsApp credentials found. Please connect your WhatsApp Business Account.',
      },
    }, 400);
  }
  
  // Check 24-hour window
  const lastInbound = await prisma.message.findFirst({
    where: {
      customerId: customer.id,
      direction: 'INBOUND',
    },
    orderBy: { createdAt: 'desc' },
  });
  
  if (lastInbound) {
    const hoursSinceLastInbound = (Date.now() - lastInbound.createdAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastInbound > 24) {
      return c.json({
        error: {
          code: 'WindowExpired',
          message: '24-hour messaging window expired. Cannot send typing indicator.',
        },
      }, 400);
    }
  }
  
  // Get the last inbound message to use for typing indicator
  const lastMessage = await prisma.message.findFirst({
    where: {
      customerId: customer.id,
      direction: 'INBOUND',
    },
    orderBy: { createdAt: 'desc' },
    select: { wamId: true },
  });
  
  if (!lastMessage?.wamId) {
    return c.json({
      error: {
        code: 'NotFound',
        message: 'No inbound message found to send typing indicator',
      },
    }, 400);
  }
  
  // Send typing indicator via WhatsApp API
  const waApi = new WhatsAppAPI({ accessToken: credentials.accessToken });
  await waApi.markAsRead(credentials.phoneNumberId, lastMessage.wamId, true); // showTyping = true
  
  return c.json({
    success: true,
    data: {
      typing_sent: true,
      channel: 'whatsapp',
    },
  });
}

/**
 * Send typing indicator via Instagram
 */
async function sendInstagramTyping(
  c: Context,
  customer: { 
    id: string; 
    igConversations: Array<{ 
      participantIgsid: string;
      instagramAccount: { igId: string; accessToken: string } | null;
    }>;
  }
): Promise<Response> {
  // Get the most recent Instagram conversation
  const igConversation = customer.igConversations[0];
  
  if (!igConversation?.instagramAccount?.accessToken) {
    return c.json({
      error: {
        code: 'ConfigurationError',
        message: 'Instagram account not properly configured',
      },
    }, 400);
  }
  
  // Check 24-hour window using the conversation's lastInboundAt
  const conversation = await prisma.iGConversation.findFirst({
    where: {
      participantIgsid: igConversation.participantIgsid,
      instagramAccountId: igConversation.instagramAccount.igId,
    },
    select: { lastInboundAt: true },
  });
  
  if (conversation?.lastInboundAt) {
    const hoursSinceLastInbound = (Date.now() - conversation.lastInboundAt.getTime()) / (1000 * 60 * 60);
    if (hoursSinceLastInbound > 24) {
      return c.json({
        error: {
          code: 'WindowExpired',
          message: '24-hour messaging window expired. Cannot send typing indicator.',
        },
      }, 400);
    }
  }
  
  try {
    // Send typing indicator via Instagram API
    await instagramService.sendTypingOn(
      igConversation.instagramAccount.igId,
      igConversation.participantIgsid
    );
    
    return c.json({
      success: true,
      data: {
        typing_sent: true,
        channel: 'instagram',
      },
    });
  } catch (error) {
    if (error instanceof InstagramError) {
      if (error.code === IGErrorCode.MESSAGING_WINDOW_CLOSED) {
        return c.json({
          error: {
            code: 'WindowExpired',
            message: '24-hour messaging window expired. Cannot send typing indicator.',
          },
        }, 400);
      }
    }
    
    logger.error('Instagram typing indicator error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to send typing indicator',
      },
    }, 500);
  }
}

export default app;
