import { Hono } from 'hono';
import type { Context } from 'hono';
import { prisma } from '../../../../utils/database.js';
import { WhatsAppAPI } from '../../../../utils/whatsapp.js';
import { getApiKeyUserId } from '../../../../middleware/apiKeyAuth.js';
import { cacheRedis } from '../../../../utils/cache.js';
import { logger } from '../../../../utils/logger.js';
import { instagramService, InstagramError, IGErrorCode } from '../../../../services/InstagramService.js';
import { resolveCredentialsForSending } from '../../../../utils/whatsapp-account-helper.js';

const app = new Hono();

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
 * POST /api/v1/conversations/:customerIdentifier/typing
 * Send typing indicator to a customer
 * Supports customer_id (CUID), phone_number, or instagram_username as identifier
 *
 * Requirements: 5.1, 5.2, 5.3, 5.4
 */
app.post('/:customerIdentifier/typing', async (c: Context) => {
  try {
    const userId = getApiKeyUserId(c);
    const customerIdentifier = c.req.param('customerIdentifier');
    
    if (!customerIdentifier) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'customer_id, phone_number, or instagram_username is required',
        },
      }, 400);
    }
    
    // Determine identifier type:
    // - Phone number: starts with + or contains only digits
    // - Instagram username: starts with ig_ or contains underscore
    // - CUID: default (starts with 'cl' or 'cm')
    const isPhoneNumber = /^\+?\d+$/.test(customerIdentifier);
    const isInstagramUsername = customerIdentifier.startsWith('ig_') || customerIdentifier.includes('_');
    
    // Get customer and verify ownership
    let customer;
    if (isPhoneNumber) {
      customer = await prisma.customer.findFirst({
        where: {
          userId: userId,
          phoneNumber: customerIdentifier
        },
        include: {
          igConversations: {
            include: {
              instagramAccount: true,
            },
          },
        },
      });
    } else if (isInstagramUsername) {
      customer = await prisma.customer.findFirst({
        where: {
          userId: userId,
          instagramUsername: customerIdentifier
        },
        include: {
          igConversations: {
            include: {
              instagramAccount: true,
            },
          },
        },
      });
    } else {
      customer = await prisma.customer.findUnique({
        where: { id: customerIdentifier },
        include: {
          igConversations: {
            include: {
              instagramAccount: true,
            },
          },
        },
      });
    }
    
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
      }, 429, {
        'Retry-After': rateLimitResult.retryAfter?.toString() || '3',
      });
    }
    
    // Get channel and optional whatsapp_phone_number_id from request body
    let requestedChannel: string | undefined;
    let whatsappPhoneNumberId: string | undefined;
    try {
      const body = await c.req.json();
      requestedChannel = body?.channel;
      whatsappPhoneNumberId = body?.whatsapp_phone_number_id;
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
      return await sendInstagramTyping(c, userId, customer);
    } else if (requestedChannel === 'whatsapp') {
      if (!hasWhatsApp) {
        return c.json({
          error: {
            code: 'ConfigurationError',
            message: 'Customer has no WhatsApp phone number',
          },
        }, 400);
      }
      return await sendWhatsAppTyping(c, userId, customer, whatsappPhoneNumberId);
    }

    // Auto-detect: prefer WhatsApp if both are available
    if (hasWhatsApp) {
      return await sendWhatsAppTyping(c, userId, customer, whatsappPhoneNumberId);
    } else if (hasInstagram) {
      return await sendInstagramTyping(c, userId, customer);
    } else {
      return c.json({
        error: {
          code: 'ConfigurationError',
          message: 'Customer has no messaging channel configured',
        },
      }, 400);
    }
    
  } catch (error: unknown) {
    logger.error('Public API typing indicator error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to send typing indicator',
      },
    }, 500);
  }
});

/**
 * Send typing indicator via WhatsApp
 * Supports multi-number: use whatsappPhoneNumberId to specify which phone number to use
 */
async function sendWhatsAppTyping(c: Context, userId: string, customer: any, whatsappPhoneNumberId?: string) {
  // Resolve WhatsApp credentials, with optional phone number override
  const credentials = await resolveCredentialsForSending(userId, customer.id, whatsappPhoneNumberId);

  if (!credentials) {
    if (whatsappPhoneNumberId) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'WhatsApp phone number not found, not connected, or does not belong to you',
        },
      }, 404);
    }
    return c.json({
      error: {
        code: 'ConfigurationError',
        message: 'WhatsApp Business Account not connected or no phone number available',
      },
    }, 400);
  }

  // Check if messaging window is active
  if (!customer.isWindowActive) {
    return c.json({
      error: {
        code: 'WindowClosed',
        message: '24-hour messaging window expired. Cannot send typing indicator.',
        windowStatus: {
          expired: true,
          expiredAt: customer.windowExpiresAt,
        },
      },
    }, 400);
  }
  
  // Get the last inbound message to use for typing indicator
  const lastMessage = await prisma.message.findFirst({
    where: {
      customerId: customer.id,
      direction: 'INBOUND',
      wamId: { not: null },
    },
    orderBy: { createdAt: 'desc' },
  });
  
  if (!lastMessage?.wamId) {
    return c.json({
      error: {
        code: 'ValidationError',
        message: 'No inbound message found to send typing indicator',
      },
    }, 400);
  }
  
  // Send typing indicator via WhatsApp API
  // WhatsApp typing indicator is sent via markAsRead with showTyping=true
  const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken });
  await whatsapp.markAsRead(credentials.phoneNumberId, lastMessage.wamId, true);
  
  return c.json({
    success: true,
    data: {
      customer_id: customer.id,
      channel: 'whatsapp',
      typing_sent: true,
      timestamp: new Date().toISOString(),
    },
  });
}

/**
 * Send typing indicator via Instagram
 * Uses Instagram Graph API sender_action: typing_on
 */
async function sendInstagramTyping(c: Context, userId: string, customer: any) {
  const igConversation = customer.igConversations?.[0];
  
  if (!igConversation || !igConversation.instagramAccount) {
    return c.json({
      error: {
        code: 'ConfigurationError',
        message: 'No Instagram conversation found for this customer',
      },
    }, 400);
  }
  
  const igAccount = igConversation.instagramAccount;
  
  if (igAccount.connectionStatus !== 'connected') {
    return c.json({
      error: {
        code: 'ConnectionError',
        message: 'Instagram account is disconnected',
      },
    }, 403);
  }
  
  // Check if messaging window is active
  if (!igConversation.isWindowActive) {
    return c.json({
      error: {
        code: 'WindowClosed',
        message: '24-hour messaging window expired. Cannot send typing indicator.',
        windowStatus: {
          expired: true,
          expiredAt: igConversation.windowExpiresAt,
        },
      },
    }, 400);
  }
  
  try {
    // Send typing indicator via Instagram API
    await instagramService.sendTypingOn(
      igAccount.igId,
      igConversation.participantIgsid
    );
    
    return c.json({
      success: true,
      data: {
        customer_id: customer.id,
        channel: 'instagram',
        typing_sent: true,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: unknown) {
    logger.error('Instagram typing indicator error', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    
    if (error instanceof InstagramError) {
      // Handle specific Instagram errors
      if (error.code === IGErrorCode.TOKEN_INVALID || error.code === IGErrorCode.TOKEN_EXPIRED) {
        return c.json({
          error: {
            code: 'ConnectionError',
            message: 'Instagram account is disconnected',
            details: error.metaError,
          },
        }, 403);
      }
      
      if (error.code === IGErrorCode.MESSAGING_WINDOW_CLOSED) {
        return c.json({
          error: {
            code: 'WindowClosed',
            message: '24-hour messaging window expired. Cannot send typing indicator.',
          },
        }, 400);
      }
      
      if (error.code === IGErrorCode.RATE_LIMIT) {
        return c.json({
          error: {
            code: 'RateLimitExceeded',
            message: 'Instagram API rate limit exceeded. Please try again later.',
          },
        }, 429);
      }
      
      const statusCode = (error.statusCode || 500) as 400 | 403 | 500;
      return c.json({
        error: {
          code: 'SenderActionFailed',
          message: 'Failed to send typing indicator',
          details: error.metaError,
        },
      }, statusCode);
    }
    
    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to send typing indicator',
      },
    }, 500);
  }
}

export default app;
