// Load environment variables FIRST before any other imports
import 'dotenv/config'
// Initialize Sentry
import './instrument.js'

// Force IPv4 for DNS resolution (fixes ETIMEDOUT issues with Facebook API on some servers)
import dns from 'dns'
dns.setDefaultResultOrder('ipv4first')

// Force restart to pick up Prisma Client changes
console.log('⏳ Backend starting... Loading modules...')
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from '@hono/node-server/serve-static'
import { serve } from '@hono/node-server'
import type { Context } from 'hono'
import { securityHeaders } from './middleware/securityHeaders.js'
import { authRateLimiter, apiRateLimiter, webhookRateLimiter, paymentRateLimiter, paymentStatusRateLimiter } from './middleware/rateLimiter.js'

// Import Better Auth
import { auth } from './lib/auth.js'
import { registerBetterAuthRoutes } from './config/better-auth-routes.js'

// Import routes
import authRoutes from './routes/auth.js'
// Business and business-accounts routes removed - functionality moved to user/WABA
import templateRoutes from './routes/templates/index.js'
import messageRoutes from './routes/messages/index.js'
import customerRoutes from './routes/customers/index.js'
import webhookRoutes from './routes/webhooks/index.js'
import analyticsRoutes from './routes/analytics.js'
import qualityRoutes from './routes/quality.js'
import dashboardRoutes from './routes/dashboard.js'
import mediaRoutes from './routes/media.js'
import settingsRoutes from './routes/settings.js'
import wabaRoutes from './routes/waba/index.js'
import monitoringRoutes from './routes/monitoring.js'
import aiRoutes from './routes/ai/index.js'
import crmRoutes from './routes/crm/index.js'
import instagramRoutes from './routes/instagram/index.js'
import messengerRoutes from './routes/messenger/index.js'
import publicApiRoutes from './routes/api/v1/public/index.js'
import subscriptionRoutes from './routes/subscription.js'
import adminRoutes from './routes/admin/index.js'
import paymentRoutes from './routes/payment.js'
import creditRoutes from './routes/credit.js'
import duitkuWebhookRoutes from './routes/webhooks/duitku.js'
import xenditWebhookRoutes from './routes/webhooks/xendit.js'
import teamRoutes from './routes/team/index.js'
import brandingRoutes from './routes/branding.js'
import channelsRoutes from './routes/channels.js'
import templateVariablesRoutes from './routes/template-variables.js'
import broadcastRoutes from './routes/broadcast/index.js'
import insightsRoutes from './routes/insights.js'
import assignmentRoutes from './routes/assignments/index.js'
import notificationRoutes from './routes/notifications.js'
import conversationRoutes from './routes/conversations.js'
import affiliateRoutes from './routes/affiliate.js'
import quickReplyRoutes from './routes/quick-replies/index.js'

// Import middleware
import { authMiddleware } from './middleware/auth.js'
import { apiKeyAuthMiddleware } from './middleware/apiKeyAuth.js'
import { publicApiGlobalRateLimiter } from './middleware/publicApiRateLimiter.js'
import { adminAuthMiddleware } from './middleware/admin-auth.js'

// Import cron jobs
import { startWindowClosureJob } from './cron/closeExpiredWindows.js'
import { startMessageDeletionJob } from './cron/deleteOldMessages.js'
import { startWABATokenRefreshJob } from './cron/refreshWABATokens.js'
import { startQualityRatingSyncJob } from './cron/syncQualityRatings.js'
import { startWebhookHealthCheckJob } from './cron/webhookHealthCheck.js'
import { startMonitoringCheckJob } from './cron/monitoringCheck.js'
import { startInstagramTokenRefreshJob } from './cron/instagramTokenRefresh.js'
import { startDeliveryLogCleanupJob } from './cron/cleanupDeliveryLogs.js'
import { startApiKeyExpirationNotifyJob } from './cron/apiKeyExpirationNotify.js'
import { startSubscriptionExpiryCheckJob } from './cron/subscriptionExpiryCheck.js'
import { startPaymentExpiryCheckJob } from './cron/paymentExpiryCheck.js'
import { startWABAHealthCheckJob } from './cron/wabaHealthCheck.js'
import { startPhoneNumberStatusCheckJob } from './cron/phoneNumberStatusCheck.js'
import { startMemoryCleanupJobs } from './cron/memoryCleanup.js'
import { startBroadcastRecoveryJob } from './cron/broadcastRecovery.js'
import { startAffiliateCommissionReleaseJob } from './cron/affiliateCommissionRelease.js'

// Import webhook workers
import './workers/webhookWorker.js'
import './workers/webhookOutboundWorker.js'
import './workers/memoryWorker.js'
import './workers/broadcastWorker.js'
import './workers/documentWorker.js'

// Import WebSocket server and event emitter
import { initializeWebSocket, eventEmitter } from './websocket/index.js'

// Re-export event emitter for use in webhooks
export { eventEmitter }

const app = new Hono()

console.log('🚀 Starting Backend Server... (Forced Restart)')

// Start cron jobs
startWindowClosureJob()
startMessageDeletionJob() // Tier-based message retention (controlled by system settings)
startWABATokenRefreshJob()
startQualityRatingSyncJob()
startWebhookHealthCheckJob()
startInstagramTokenRefreshJob()
startDeliveryLogCleanupJob()
startApiKeyExpirationNotifyJob()
startSubscriptionExpiryCheckJob()
startPaymentExpiryCheckJob()
startWABAHealthCheckJob()
startPhoneNumberStatusCheckJob()
startMemoryCleanupJobs() // Memory cleanup and retry failed embeddings
startBroadcastRecoveryJob() // Recover stuck broadcasts on startup and periodically
startAffiliateCommissionReleaseJob() // Release pending affiliate commissions daily
// Monitoring check disabled - use new monitoring service instead

// Security headers middleware (apply to all routes)
app.use('*', securityHeaders)

// Basic CORS middleware
app.use('*', cors({
  origin: (origin) => {
    // Get allowed origins from environment variable or use defaults
    const corsOriginsEnv = process.env.CORS_ALLOWED_ORIGINS
    const allowedOrigins = corsOriginsEnv
      ? corsOriginsEnv.split(',').map(o => o.trim())
      : [
        'http://localhost:3000',
        'http://localhost:3005',
        'http://localhost:5173',
        'https://app.whoops.web.id',
        'https://dash.whoops.web.id',
        'https://whoops.web.id',
        'https://api.whoops.web.id'
      ]

    // If origin is in allowed list or is whoops.web.id domain, return it
    if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.whoops.web.id') || origin === 'https://whoops.web.id')) {
      return origin
    }

    // In development, allow any origin
    if (process.env.NODE_ENV !== 'production') {
      return origin ?? '*'
    }

    // In production, reject if not in allowed list
    return allowedOrigins[0] ?? '*'
  },
  credentials: true,
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-2FA-Token',
    'Cookie',
    'User-Agent',
    'Accept',
    'Accept-Language',
    'Accept-Encoding',
    'Origin',
    'Referer'
  ],
  exposeHeaders: ['Content-Length', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
}))

// Handle OPTIONS preflight explicitly
app.options('*', (c) => {
  return new Response('', { status: 204 })
})

// Simple logging middleware
app.use('*', async (c, next) => {
  const start = Date.now()
  await next()
  const end = Date.now()
  console.log(`${c.req.method} ${c.req.path} - ${c.res.status} - ${end - start}ms`)
})

// Health check
app.get('/health', (c: Context) => {
  return c.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'kirimchat-backend',
    version: '1.0.0'
  })
})

// API Routes (v1) - Keep old routes for backward compatibility
//
// Rate limiting for auth endpoints
// -------------------------------------------------------------
// Better Auth endpoints (/api/auth/sign-in/*, /api/auth/sign-up/*)
// are the ones used by the frontend (`authClient.signIn.email(...)`)
// and MUST stay rate-limited.
registerBetterAuthRoutes(app, (request) => auth.handler(request), authRateLimiter)

// Custom auth endpoints mounted at /api/v1/auth (see routes/auth.ts).
// The previous `/api/v1/auth/sign-in/*` and `/api/v1/auth/sign-up/*`
// paths did not match ANY real endpoint (the custom routes are `/login`,
// `/register`, `/register/initiate`, etc.), so they used to be dead
// middleware — that's why they were commented as "causing issues".
// Apply the limiter to the actual state-changing paths instead.
// `/me` (GET session info) and `/logout` are intentionally excluded.
app.use('/api/v1/auth/login', authRateLimiter)
app.use('/api/v1/auth/register', authRateLimiter)
app.use('/api/v1/auth/register/*', authRateLimiter) // initiate/verify/resend
app.use('/api/v1/auth/forgot-password', authRateLimiter)
app.use('/api/v1/auth/forgot-password/*', authRateLimiter) // resend
app.use('/api/v1/auth/reset-password', authRateLimiter)
app.use('/api/v1/auth/change-password', authRateLimiter)

// Mount custom auth routes for additional functionality
app.route('/api/v1/auth', authRoutes) // Custom auth endpoints

// Rate limiting for general API endpoints
app.use('/api/v1/*', apiRateLimiter)

// Protected routes (require authentication)
app.use('/api/v1/templates/*', authMiddleware)
app.use('/api/v1/messages/*', authMiddleware)
app.use('/api/v1/customers/*', authMiddleware)
app.use('/api/v1/analytics/*', authMiddleware)
app.use('/api/v1/quality/*', authMiddleware)
app.use('/api/v1/dashboard/*', authMiddleware)
app.use('/api/v1/media/*', authMiddleware)
app.use('/api/v1/settings/*', authMiddleware)
app.use('/api/v1/waba/*', authMiddleware)
app.use('/api/v1/ai/*', authMiddleware)
app.use('/api/v1/monitoring/*', authMiddleware)
app.use('/api/v1/crm/*', authMiddleware)
// Instagram routes - exclude webhooks (verified by Meta signature)
// Auth routes: /auth/url requires auth, /auth/callback does not (OAuth flow)
app.use('/api/v1/ig/auth/url', authMiddleware)
app.use('/api/v1/ig/connection/*', authMiddleware)
app.use('/api/v1/ig/tokens/*', authMiddleware)
app.use('/api/v1/ig/conversations/*', authMiddleware)
app.use('/api/v1/ig/messages/*', authMiddleware)
// Messenger routes - exclude webhooks (verified by Facebook signature)
app.use('/api/v1/messenger/auth/url', authMiddleware)
app.use('/api/v1/messenger/connection/*', authMiddleware)
app.use('/api/v1/messenger/conversations/*', authMiddleware)
app.use('/api/v1/subscription', authMiddleware)
app.use('/api/v1/payment/*', authMiddleware)
// Credit routes - protected
app.use('/api/v1/credit/*', authMiddleware)
app.use('/api/v1/credit', authMiddleware)
// Payment status polling - higher rate limit (30 req/min) for status checks
app.use('/api/v1/payment/status/*', paymentStatusRateLimiter)
// Payment rate limiting - 10 requests/minute per user for other endpoints (Requirements: 10.4)
app.use('/api/v1/payment/create', paymentRateLimiter)
app.use('/api/v1/payment/cancel/*', paymentRateLimiter)
app.use('/api/v1/payment/history', paymentRateLimiter)
app.use('/api/v1/payment/pricing', paymentRateLimiter)
// Team routes - protected routes require auth, public routes (invitation accept) don't
app.use('/api/v1/team/members', authMiddleware)
app.use('/api/v1/team/members/*', authMiddleware)
app.use('/api/v1/team/limit', authMiddleware)
// Note: /api/v1/team/invitations/* routes handle auth internally via requirePermission middleware
// Public routes: /validate/:token and /accept don't require auth

// Template variables routes - protected
app.use('/api/v1/template-variables/*', authMiddleware)

// Broadcast routes - protected
app.use('/api/v1/broadcast/*', authMiddleware)

// Insights routes - protected (BUSINESS_OWNER and ADMIN only)
app.use('/api/v1/insights/*', authMiddleware)

// Assignment routes - protected
app.use('/api/v1/assignments/*', authMiddleware)

// Notification routes - protected
app.use('/api/v1/notifications/*', authMiddleware)
app.use('/api/v1/notifications', authMiddleware)

// Conversation routes - protected (typing indicators, etc.)
app.use('/api/v1/conversations/*', authMiddleware)

// Affiliate routes - protected (except validate/:code which is public)
app.use('/api/v1/affiliate/status', authMiddleware)
app.use('/api/v1/affiliate/register', authMiddleware)
app.use('/api/v1/affiliate/referrals', authMiddleware)
app.use('/api/v1/affiliate/earnings', authMiddleware)
// Note: /api/v1/affiliate/validate/:code is public (no auth required)

// Quick replies routes - protected
app.use('/api/v1/quick-replies/*', authMiddleware)
app.use('/api/v1/quick-replies', authMiddleware)

// Admin routes - require both auth and admin role
app.use('/api/v1/admin/*', authMiddleware)
app.use('/api/v1/admin/*', adminAuthMiddleware)

// Business routes removed
app.route('/api/v1/templates', templateRoutes)
app.route('/api/v1/messages', messageRoutes)
app.route('/api/v1/customers', customerRoutes)
app.route('/api/v1/analytics', analyticsRoutes)
app.route('/api/v1/quality', qualityRoutes)
app.route('/api/v1/dashboard', dashboardRoutes)
app.route('/api/v1/media', mediaRoutes)
app.route('/api/v1/settings', settingsRoutes)
app.route('/api/v1/ai', aiRoutes)
app.route('/api/v1/waba', wabaRoutes)
app.route('/api/v1/monitoring', monitoringRoutes)
app.route('/api/v1/crm', crmRoutes)
app.route('/api/v1/ig', instagramRoutes)
app.route('/api/v1/messenger', messengerRoutes)
app.route('/api/v1/subscription', subscriptionRoutes)
app.route('/api/v1/payment', paymentRoutes)
app.route('/api/v1/credit', creditRoutes)
app.route('/api/v1/team', teamRoutes)
app.route('/api/v1/admin', adminRoutes)
app.route('/api/v1/template-variables', templateVariablesRoutes)
app.route('/api/v1/broadcast', broadcastRoutes)
app.route('/api/v1/insights', insightsRoutes)
app.route('/api/v1/assignments', assignmentRoutes)
app.route('/api/v1/notifications', notificationRoutes)
app.route('/api/v1/conversations', conversationRoutes)
app.route('/api/v1/affiliate', affiliateRoutes)
app.route('/api/v1/quick-replies', quickReplyRoutes)

// Public branding route (no auth required - used by auth pages)
app.route('/api/v1/branding', brandingRoutes)

// Public channel status route (no auth required - used by sidebar)
app.route('/api/v1/channels', channelsRoutes)

// Public API routes (API key authentication)
// These routes use API key auth instead of session auth
app.use('/api/v1/public/*', apiKeyAuthMiddleware)
app.use('/api/v1/public/*', publicApiGlobalRateLimiter)
app.route('/api/v1/public', publicApiRoutes)

// Webhook routes (no auth required, verified by Meta)
// Rate limiting for webhooks (protect against spam)
app.use('/api/v1/webhooks/*', webhookRateLimiter)
app.route('/api/v1/webhooks', webhookRoutes)
// Alias for backward compatibility (some webhooks configured with /whatsapp path)
app.route('/api/v1/webhooks/whatsapp', webhookRoutes)
// Duitku payment webhook (no auth, verified by signature)
app.route('/api/v1/webhooks/duitku', duitkuWebhookRoutes)
// Xendit payment webhook (no auth, verified by X-Callback-Token)
app.route('/api/v1/webhooks/xendit', xenditWebhookRoutes)

// 404 handler for unknown payment webhook providers (Requirements: 5.4)
app.all('/api/v1/webhooks/:provider/callback', (c: Context) => {
  const provider = c.req.param('provider')
  console.warn(`Unknown payment webhook provider: ${provider}`)
  return c.json({
    error: 'Provider not found',
    message: `Payment provider '${provider}' is not supported`,
  }, 404)
})

// Serve static files from uploads directory (for media)
app.use('/uploads/*', serveStatic({ root: './' }))

// 404 handler
app.notFound((c: Context) => {
  return c.json({
    error: 'Not Found',
    message: `Route ${c.req.method} ${c.req.path} not found`,
    timestamp: new Date().toISOString()
  }, 404)
})

// Error handler for uncaught errors
app.onError((err, c: Context) => {
  console.error('Uncaught error:', err)
  return c.json({
    error: 'Internal Server Error',
    message: 'Something went wrong',
    timestamp: new Date().toISOString()
  }, 500)
})

// Start server with Node.js
const port = Number(process.env.PORT) || 3005

console.log(`🚀 Server starting on port ${port}`)

const server = serve({
  fetch: app.fetch,
  port,
}, (info) => {
  console.log(`✅ Server running at http://localhost:${info.port}`)
})

// Initialize WebSocket server if enabled
const websocketEnabled = process.env.WEBSOCKET_ENABLED !== 'false'
if (websocketEnabled) {
  // Cast to HTTP server type for Socket.IO compatibility
  initializeWebSocket(server as unknown as import('node:http').Server)
}
