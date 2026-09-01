import type { Context, Next } from 'hono'
import { RateLimiterRedis } from 'rate-limiter-flexible'
import { Redis } from 'ioredis'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  max: number // Max requests per window
  message?: string
  keyGenerator?: (c: Context) => string
}

// Redis connection for rate limiting (shared across instances)
const redisHost = process.env.REDIS_HOST || 'localhost'
const redisPort = parseInt(process.env.REDIS_PORT || '6379')
const redisPassword = process.env.REDIS_PASSWORD

console.log(`[RateLimiter] Connecting to Redis at ${redisHost}:${redisPort}, password: ${redisPassword ? '***' : 'none'}`)

const redisClient = new Redis({
  host: redisHost,
  port: redisPort,
  password: redisPassword,
  tls: process.env.REDIS_TLS === 'true' ? {} : undefined,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  family: 4,
})

redisClient.on('connect', () => {
  console.log('[RateLimiter] Redis connected successfully')
})

redisClient.on('error', (err) => {
  console.error('[RateLimiter] Redis connection error:', err.message)
})

// Cache of rate limiters by config
const limiterCache = new Map<string, RateLimiterRedis>()

function getRateLimiter(config: RateLimitConfig): RateLimiterRedis {
  const cacheKey = `${config.windowMs}_${config.max}`

  if (!limiterCache.has(cacheKey)) {
    limiterCache.set(cacheKey, new RateLimiterRedis({
      storeClient: redisClient,
      points: config.max,
      duration: Math.ceil(config.windowMs / 1000), // Convert to seconds
      blockDuration: 0, // Don't block, just count
      keyPrefix: 'ratelimit',
    }))
  }

  return limiterCache.get(cacheKey)!
}

export function rateLimiter(config: RateLimitConfig) {
  const {
    message = 'Too many requests, please try again later',
    keyGenerator = (c: Context) => {
      // Use IP address or user ID as key
      const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
      return `${c.req.path}:${ip}`
    }
  } = config

  const limiter = getRateLimiter(config)

  return async (c: Context, next: Next) => {
    // Skip rate limiting for OPTIONS (CORS preflight)
    if (c.req.method === 'OPTIONS') {
      return await next()
    }

    const key = keyGenerator(c)

    try {
      const result = await limiter.consume(key, 1)

      // Add rate limit headers
      c.header('X-RateLimit-Limit', config.max.toString())
      c.header('X-RateLimit-Remaining', result.remainingPoints.toString())

      // Calculate reset time safely
      const resetMs = result.msBeforeNext || config.windowMs
      c.header('X-RateLimit-Reset', new Date(Date.now() + resetMs).toISOString())

      await next()
    } catch (rejRes: any) {
      // Check if this is a rate limit rejection (has remainingPoints property)
      // vs a Redis connection error
      if (typeof rejRes?.remainingPoints === 'number') {
        // Rate limit exceeded
        const msBeforeNext = rejRes?.msBeforeNext || config.windowMs
        const retryAfter = Math.ceil(msBeforeNext / 1000)

        return c.json(
          {
            error: {
              code: 'RateLimitExceeded',
              message,
              retryAfter
            }
          },
          429,
          {
            'Retry-After': retryAfter.toString(),
            'X-RateLimit-Limit': config.max.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': new Date(Date.now() + msBeforeNext).toISOString()
          }
        )
      }

      // Redis connection error - fail open (allow request)
      console.error('Rate limiter Redis error, allowing request:', rejRes?.message || rejRes)
      await next()
    }
  }
}

// Specific rate limiters for different endpoints
export const authRateLimiter = rateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 login attempts per 15 minutes (was 5, too restrictive)
  message: 'Too many login attempts, please try again after 15 minutes'
})

export const apiRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 600, // 600 requests per minute (10 req/sec - allows for modern SPA with multiple simultaneous API calls)
  message: 'Too many API requests, please slow down'
})

export const webhookRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 webhook events per minute
  message: 'Webhook rate limit exceeded'
})

// Payment rate limiter - 10 requests per minute per user
// Requirements: 10.4
export const paymentRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // 10 requests per minute per user
  message: 'Too many payment requests, please try again later',
  keyGenerator: (c: Context) => {
    // Use user ID if available, otherwise fall back to IP
    const userId = (c as any).user?.id
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    return `payment:${userId || ip}`
  }
})

// Payment status polling rate limiter - higher limit for status checks
// Allows 30 requests per minute (polling every 2-3 seconds)
export const paymentStatusRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // 30 requests per minute per user
  message: 'Too many status requests, please try again later',
  keyGenerator: (c: Context) => {
    const userId = (c as any).user?.id
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    return `payment-status:${userId || ip}`
  }
})

// AI Test Chat rate limiter - prevent abuse of OpenAI API credits
// Allows 20 requests per minute per user (generous but prevents abuse)
export const aiTestChatRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 20, // 20 test chats per minute per user
  message: 'Too many AI test chat requests, please wait before testing again',
  keyGenerator: (c: Context) => {
    const userId = (c as any).user?.id
    const ip = c.req.header('x-forwarded-for') || c.req.header('x-real-ip') || 'unknown'
    return `ai-test-chat:${userId || ip}`
  }
})
