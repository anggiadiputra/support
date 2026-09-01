import { Hono } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { resolveContext } from '../../middleware/resolveContext.js'
import { requirePermission } from '../../middleware/permissions.js'
import listMessages from './list.js'
import sendMessage from './send.js'
import readMessages from './read.js'
import reactionMessages from './reaction.js'

const app = new Hono()

// Apply context resolution for all message routes
// This sets effectiveUserId for agents to access business owner's data
app.use('/*', resolveContext)

// List messages - requires messages:read permission
app.use('/', requirePermission('messages:read'))
app.route('/', listMessages)

// Send messages - requires messages:write permission
app.use('/send', requirePermission('messages:write'))
app.route('/', sendMessage)

// Mark messages as read - requires messages:write permission
app.use('/read', requirePermission('messages:write'))
app.route('/read', readMessages)

// Reaction - requires messages:write permission
app.use('/:messageId/react', requirePermission('messages:write'))
app.route('/', reactionMessages)

export default app
