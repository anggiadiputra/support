/**
 * Facebook Messenger Routes - Main Router
 * Aggregates all Messenger-related routes
 * 
 * This module combines all Facebook Messenger integration routes into a single router.
 * Routes are organized by functionality:
 * - /auth/* - OAuth connection flow
 * - /connection/* - Connection status and management
 * - /webhooks - Webhook handling (no auth, verified by Facebook signature)
 * - /conversations/* - Conversation management
 * - /messages/* - Message sending and reactions
 * 
 * Authentication is applied at the main app level for all routes except webhooks.
 */

import { Hono } from 'hono'
import connectionRoutes from './connection.js'
import webhookRoutes from './webhooks.js'
import conversationRoutes from './conversations.js'
import messageRoutes from './messages.js'

const app = new Hono()

/**
 * Connection routes - OAuth flow and account management
 * 
 * Endpoints:
 * - GET /auth/url - Generate Facebook OAuth URL
 * - GET /auth/callback - Handle OAuth callback
 * - GET /connection/status - Get current connection status
 * - DELETE /connection - Disconnect Facebook Page
 */
app.route('/auth', connectionRoutes)
app.route('/connection', connectionRoutes)

/**
 * Webhook routes - No authentication required
 * Webhooks are verified using Facebook's X-Hub-Signature-256 header
 * 
 * Endpoints:
 * - GET /webhooks - Webhook verification (hub.challenge)
 * - POST /webhooks - Receive webhook events
 */
app.route('/webhooks', webhookRoutes)

/**
 * Conversation routes
 * 
 * Endpoints:
 * - GET /conversations - List conversations with pagination
 * - GET /conversations/search - Search by name or message content
 * - GET /conversations/:id - Get conversation detail
 * - GET /conversations/:id/messages - Get messages with pagination
 * - POST /conversations/:id/read - Mark messages as read
 */
app.route('/conversations', conversationRoutes)

/**
 * Message routes - Sending messages and reactions
 * 
 * Endpoints:
 * - POST /conversations/:id/messages - Send message
 * - POST /messages/:id/react - React to message
 */
app.route('/', messageRoutes)

export default app
