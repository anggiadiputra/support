import { Hono } from 'hono'
import listQuickReplies from './list.js'
import createQuickReply from './create.js'
import updateQuickReply from './update.js'
import deleteQuickReply from './delete.js'
import searchQuickReplies from './search.js'
import shortcutRoute from './shortcut.js'
import categoryRoutes from './categories/index.js'

const app = new Hono()

// Search route (must be before /:id routes to avoid conflict)
app.route('/', searchQuickReplies)

// Shortcut route (must be before /:id routes to avoid conflict)
app.route('/shortcut', shortcutRoute)

// Quick reply CRUD routes
app.route('/', listQuickReplies)
app.route('/', createQuickReply)
app.route('/', updateQuickReply)
app.route('/', deleteQuickReply)

// Category routes
app.route('/categories', categoryRoutes)

export default app
