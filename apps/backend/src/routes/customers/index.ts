import { Hono } from 'hono'
import { resolveContext } from '../../middleware/resolveContext.js'
import { requirePermission } from '../../middleware/permissions.js'
import listCustomers from './list.js'
import getCustomerDetail from './detail.js'
import createCustomer from './create.js'
import updateCustomer from './update.js'
import deleteCustomer from './delete.js'
import getWindowStatus from './window-status.js'
import updateConsent from './consent.js'
import updateBlacklist from './blacklist.js'
import exportCustomers from './export.js'
import importCustomers from './import.js'
import activityRoutes from './activities.js'
import broadcastEligible from './broadcast-eligible.js'
import notesRoutes from './notes.js'
import statsRoutes from './stats.js'

const app = new Hono()

// Apply context resolution for all customer routes
// This sets effectiveUserId for agents to access business owner's data
app.use('/*', resolveContext)

// All customer routes require customers:read permission at minimum
app.use('/*', requirePermission('customers:read'))

// Mount all routes - stats and static paths before /:id pattern
app.route('/', statsRoutes)
app.route('/', broadcastEligible)
app.route('/', listCustomers)
app.route('/', exportCustomers)
app.route('/', getCustomerDetail)
app.route('/', getWindowStatus)
app.route('/', activityRoutes)
app.route('/', notesRoutes)
app.route('/', createCustomer)
app.route('/', updateCustomer)
app.route('/', updateConsent)
app.route('/', updateBlacklist)
app.route('/', importCustomers)
app.route('/', deleteCustomer)

export default app
