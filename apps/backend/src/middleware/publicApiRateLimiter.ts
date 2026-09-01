import type { Context, Next } from 'hono';
import { cacheRedis } from '../utils/cache.js';
import { logger } from '../utils/logger.js';

/**
 * Extend Hono context to include parsed body from rate limiter
 */
declare module 'hono' {
  interface ContextVariableMap {
    parsedBody: Record<string, unknown>;
  }
}

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  max: number; // Max requests per window
  keyPrefix: string; // Redis key prefix
  message?: string; // Custom error message
}

/**
 * Rate limit result
 */
interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number; // Unix timestamp in seconds
  retryAfter?: number; // Seconds until reset
}

// Rate limit configurations
const GLOBAL_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  keyPrefix: 'ratelimit:global:',
  message: 'API rate limit exceeded. Maximum 100 requests per minute.',
};

/**
 * Channel-specific rate limits based on Meta's official limits (2026)
 * 
 * WhatsApp Cloud API: 80 msg/sec default, up to 1000 msg/sec
 * Instagram Messaging API: 200 DMs/hour
 * Messenger Platform: ~200 msg/hour (similar to Instagram)
 * 
 * We apply a 10% safety buffer to prevent hitting Meta's limits
 */
const WHATSAPP_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 messages per minute (1/sec - very conservative vs Meta's 80/sec)
  keyPrefix: 'ratelimit:whatsapp:',
  message: 'WhatsApp rate limit exceeded. Maximum 60 messages per minute.',
};

const INSTAGRAM_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 180, // 180 messages per hour (10% buffer vs Meta's 200/hour)
  keyPrefix: 'ratelimit:instagram:',
  message: 'Instagram rate limit exceeded. Maximum 180 messages per hour.',
};

const MESSENGER_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 180, // 180 messages per hour (10% buffer vs Meta's ~200/hour)
  keyPrefix: 'ratelimit:messenger:',
  message: 'Messenger rate limit exceeded. Maximum 180 messages per hour.',
};

// Legacy send message limit (fallback when channel not specified)
const SEND_MESSAGE_RATE_LIMIT: RateLimitConfig = {
  windowMs: 60 * 1000, // 1 minute
  max: 60, // 60 messages per minute
  keyPrefix: 'ratelimit:send:',
  message: 'Message send rate limit exceeded. Maximum 60 messages per minute.',
};

/**
 * Check rate limit using Redis sliding window counter
 * Uses a simple fixed window approach with Redis INCR and EXPIRE
 */
async function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(config.windowMs / 1000);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / windowSeconds) * windowSeconds;
  const key = `${config.keyPrefix}${identifier}:${windowStart}`;

  try {
    // Increment counter
    const count = await cacheRedis.incr(key);

    // Set expiry on first request in window
    if (count === 1) {
      await cacheRedis.expire(key, windowSeconds + 1); // +1 for safety margin
    }

    const resetTime = windowStart + windowSeconds;
    const remaining = Math.max(0, config.max - count);
    const allowed = count <= config.max;

    return {
      allowed,
      remaining,
      resetTime,
      retryAfter: allowed ? undefined : resetTime - now,
    };
  } catch (error) {
    logger.error('Rate limit check error:', error);
    // Fail open - allow request if Redis is unavailable
    return {
      allowed: true,
      remaining: config.max,
      resetTime: now + windowSeconds,
    };
  }
}


/**
 * Set rate limit headers on response
 */
function setRateLimitHeaders(c: Context, result: RateLimitResult, max: number): void {
  c.header('X-RateLimit-Limit', max.toString());
  c.header('X-RateLimit-Remaining', result.remaining.toString());
  c.header('X-RateLimit-Reset', result.resetTime.toString());
}

/**
 * Global rate limiter middleware for Public API
 * Limits to 100 requests per minute per API key
 * 
 * Requirements: 7.3
 */
export async function publicApiGlobalRateLimiter(c: Context, next: Next): Promise<Response | void> {
  // Skip rate limiting for OPTIONS (CORS preflight)
  if (c.req.method === 'OPTIONS') {
    return await next();
  }

  // Get API key ID from context (set by apiKeyAuthMiddleware)
  const apiKeyId = c.get('apiKeyId');
  
  if (!apiKeyId) {
    // If no API key ID, authentication middleware should have already rejected
    // This is a fallback - use IP-based limiting
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
               c.req.header('x-real-ip') || 
               'unknown';
    
    const result = await checkRateLimit(ip, GLOBAL_RATE_LIMIT);
    
    if (!result.allowed) {
      setRateLimitHeaders(c, result, GLOBAL_RATE_LIMIT.max);
      return c.json(
        {
          error: {
            code: 'RateLimitExceeded',
            message: GLOBAL_RATE_LIMIT.message,
            retryAfter: result.retryAfter,
          },
        },
        429,
        {
          'Retry-After': result.retryAfter?.toString() || '60',
        }
      );
    }
    
    setRateLimitHeaders(c, result, GLOBAL_RATE_LIMIT.max);
    return await next();
  }

  // Check global rate limit for API key
  const result = await checkRateLimit(apiKeyId, GLOBAL_RATE_LIMIT);

  if (!result.allowed) {
    setRateLimitHeaders(c, result, GLOBAL_RATE_LIMIT.max);
    
    logger.warn(`Rate limit exceeded for API key ${apiKeyId.substring(0, 8)}...`);
    
    return c.json(
      {
        error: {
          code: 'RateLimitExceeded',
          message: GLOBAL_RATE_LIMIT.message,
          retryAfter: result.retryAfter,
        },
      },
      429,
      {
        'Retry-After': result.retryAfter?.toString() || '60',
      }
    );
  }

  // Set rate limit headers
  setRateLimitHeaders(c, result, GLOBAL_RATE_LIMIT.max);

  await next();
}

/**
 * Send message rate limiter middleware
 * Limits to 60 messages per minute per API key
 * Apply this to POST /api/v1/messages/send endpoint
 * 
 * Requirements: 6.7
 */
export async function sendMessageRateLimiter(c: Context, next: Next): Promise<Response | void> {
  // Skip rate limiting for OPTIONS (CORS preflight)
  if (c.req.method === 'OPTIONS') {
    return await next();
  }

  // Get API key ID from context
  const apiKeyId = c.get('apiKeyId');
  
  if (!apiKeyId) {
    // Fallback to IP-based limiting
    const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
               c.req.header('x-real-ip') || 
               'unknown';
    
    const result = await checkRateLimit(ip, SEND_MESSAGE_RATE_LIMIT);
    
    if (!result.allowed) {
      c.header('X-RateLimit-Limit-Send', SEND_MESSAGE_RATE_LIMIT.max.toString());
      c.header('X-RateLimit-Remaining-Send', result.remaining.toString());
      c.header('X-RateLimit-Reset-Send', result.resetTime.toString());
      
      return c.json(
        {
          error: {
            code: 'RateLimitExceeded',
            message: SEND_MESSAGE_RATE_LIMIT.message,
            retryAfter: result.retryAfter,
          },
        },
        429,
        {
          'Retry-After': result.retryAfter?.toString() || '60',
        }
      );
    }
    
    return await next();
  }

  // Check send message rate limit for API key
  const result = await checkRateLimit(apiKeyId, SEND_MESSAGE_RATE_LIMIT);

  if (!result.allowed) {
    c.header('X-RateLimit-Limit-Send', SEND_MESSAGE_RATE_LIMIT.max.toString());
    c.header('X-RateLimit-Remaining-Send', result.remaining.toString());
    c.header('X-RateLimit-Reset-Send', result.resetTime.toString());
    
    logger.warn(`Send message rate limit exceeded for API key ${apiKeyId.substring(0, 8)}...`);
    
    return c.json(
      {
        error: {
          code: 'RateLimitExceeded',
          message: SEND_MESSAGE_RATE_LIMIT.message,
          retryAfter: result.retryAfter,
        },
      },
      429,
      {
        'Retry-After': result.retryAfter?.toString() || '60',
      }
    );
  }

  // Set send-specific rate limit headers
  c.header('X-RateLimit-Limit-Send', SEND_MESSAGE_RATE_LIMIT.max.toString());
  c.header('X-RateLimit-Remaining-Send', result.remaining.toString());
  c.header('X-RateLimit-Reset-Send', result.resetTime.toString());

  await next();
}

/**
 * Combined rate limiter that checks both global and endpoint-specific limits
 * Use this for the send message endpoint to apply both limits
 */
export async function combinedSendRateLimiter(c: Context, next: Next): Promise<Response | void> {
  // Skip rate limiting for OPTIONS (CORS preflight)
  if (c.req.method === 'OPTIONS') {
    return await next();
  }

  const apiKeyId = c.get('apiKeyId');
  const identifier = apiKeyId || 
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
    c.req.header('x-real-ip') || 
    'unknown';

  // Check global rate limit first
  const globalResult = await checkRateLimit(identifier, GLOBAL_RATE_LIMIT);
  
  if (!globalResult.allowed) {
    setRateLimitHeaders(c, globalResult, GLOBAL_RATE_LIMIT.max);
    
    return c.json(
      {
        error: {
          code: 'RateLimitExceeded',
          message: GLOBAL_RATE_LIMIT.message,
          retryAfter: globalResult.retryAfter,
        },
      },
      429,
      {
        'Retry-After': globalResult.retryAfter?.toString() || '60',
      }
    );
  }

  // Check send message rate limit
  const sendResult = await checkRateLimit(identifier, SEND_MESSAGE_RATE_LIMIT);
  
  if (!sendResult.allowed) {
    // Set both headers
    setRateLimitHeaders(c, globalResult, GLOBAL_RATE_LIMIT.max);
    c.header('X-RateLimit-Limit-Send', SEND_MESSAGE_RATE_LIMIT.max.toString());
    c.header('X-RateLimit-Remaining-Send', sendResult.remaining.toString());
    c.header('X-RateLimit-Reset-Send', sendResult.resetTime.toString());
    
    return c.json(
      {
        error: {
          code: 'RateLimitExceeded',
          message: SEND_MESSAGE_RATE_LIMIT.message,
          retryAfter: sendResult.retryAfter,
        },
      },
      429,
      {
        'Retry-After': sendResult.retryAfter?.toString() || '60',
      }
    );
  }

  // Set all rate limit headers
  setRateLimitHeaders(c, globalResult, GLOBAL_RATE_LIMIT.max);
  c.header('X-RateLimit-Limit-Send', SEND_MESSAGE_RATE_LIMIT.max.toString());
  c.header('X-RateLimit-Remaining-Send', sendResult.remaining.toString());
  c.header('X-RateLimit-Reset-Send', sendResult.resetTime.toString());

  await next();
}

/**
 * Get rate limit config based on channel
 */
function getChannelRateLimitConfig(channel: string): RateLimitConfig {
  switch (channel) {
    case 'whatsapp':
      return WHATSAPP_RATE_LIMIT;
    case 'instagram':
      return INSTAGRAM_RATE_LIMIT;
    case 'messenger':
      return MESSENGER_RATE_LIMIT;
    default:
      return SEND_MESSAGE_RATE_LIMIT;
  }
}

/**
 * Channel-aware rate limiter that applies Meta's official limits per channel
 * 
 * Rate limits (with 10% safety buffer):
 * - WhatsApp: 60 msg/min (Meta limit: 80 msg/sec, we're very conservative)
 * - Instagram: 180 msg/hour (Meta limit: 200 msg/hour)
 * - Messenger: 180 msg/hour (Meta limit: ~200 msg/hour)
 * 
 * Use this for the send message endpoint to apply channel-specific limits
 */
export async function channelAwareSendRateLimiter(c: Context, next: Next): Promise<Response | void> {
  // Skip rate limiting for OPTIONS (CORS preflight)
  if (c.req.method === 'OPTIONS') {
    return await next();
  }

  const apiKeyId = c.get('apiKeyId');
  const identifier = apiKeyId || 
    c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || 
    c.req.header('x-real-ip') || 
    'unknown';

  // Check global rate limit first
  const globalResult = await checkRateLimit(identifier, GLOBAL_RATE_LIMIT);
  
  if (!globalResult.allowed) {
    setRateLimitHeaders(c, globalResult, GLOBAL_RATE_LIMIT.max);
    
    return c.json(
      {
        error: {
          code: 'RateLimitExceeded',
          message: GLOBAL_RATE_LIMIT.message,
          retryAfter: globalResult.retryAfter,
        },
      },
      429,
      {
        'Retry-After': globalResult.retryAfter?.toString() || '60',
      }
    );
  }

  // Try to get channel from request body for channel-specific limiting
  let channel: string | undefined;
  try {
    const body = await c.req.json();
    channel = body?.channel;
    // Store body for later use in route handler
    c.set('parsedBody', body);
  } catch {
    // Body parsing failed, will use default rate limit
  }

  // Get channel-specific rate limit config
  const channelConfig = getChannelRateLimitConfig(channel || '');
  const channelResult = await checkRateLimit(identifier, channelConfig);
  
  if (!channelResult.allowed) {
    setRateLimitHeaders(c, globalResult, GLOBAL_RATE_LIMIT.max);
    c.header('X-RateLimit-Limit-Channel', channelConfig.max.toString());
    c.header('X-RateLimit-Remaining-Channel', channelResult.remaining.toString());
    c.header('X-RateLimit-Reset-Channel', channelResult.resetTime.toString());
    c.header('X-RateLimit-Channel', channel || 'unknown');
    
    logger.warn(`Channel rate limit exceeded for ${channel || 'unknown'}, API key ${identifier.substring(0, 8)}...`);
    
    return c.json(
      {
        error: {
          code: 'RateLimitExceeded',
          message: channelConfig.message,
          channel: channel || 'unknown',
          retryAfter: channelResult.retryAfter,
        },
      },
      429,
      {
        'Retry-After': channelResult.retryAfter?.toString() || '60',
      }
    );
  }

  // Set all rate limit headers
  setRateLimitHeaders(c, globalResult, GLOBAL_RATE_LIMIT.max);
  c.header('X-RateLimit-Limit-Channel', channelConfig.max.toString());
  c.header('X-RateLimit-Remaining-Channel', channelResult.remaining.toString());
  c.header('X-RateLimit-Reset-Channel', channelResult.resetTime.toString());
  if (channel) {
    c.header('X-RateLimit-Channel', channel);
  }

  await next();
}
