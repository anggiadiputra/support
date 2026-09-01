import { Hono } from 'hono'
import statsRoutes from './stats.js'
import usersRoutes from './users.js'
import userSupportRoutes from './user-support.js'
import subscriptionsRoutes from './subscriptions.js'
import healthRoutes from './health.js'
import auditRoutes from './audit.js'
import settingsRoutes from './settings.js'
import revenueRoutes from './revenue.js'
import subscriptionPlansRoutes from './subscription-plans.js'
import messageRetentionSettingsRoutes from './message-retention-settings.js'
import notificationsRoutes from './notifications.js'
import emailTemplatesRoutes from './email-templates.js'
import affiliatesRoutes from './affiliates.js'

const app = new Hono()

// Mount admin sub-routes
app.route('/stats', statsRoutes)
app.route('/users', usersRoutes)
app.route('/users', userSupportRoutes) // User support endpoints (nested under /users/:id/...)
app.route('/subscriptions', subscriptionsRoutes)
app.route('/health', healthRoutes)
app.route('/audit', auditRoutes)
app.route('/email-templates', emailTemplatesRoutes)
// IMPORTANT: More specific routes must be registered BEFORE catch-all routes
// /settings/message-retention must come before /settings (which has /:category catch-all)
app.route('/settings/message-retention', messageRetentionSettingsRoutes)
app.route('/settings', settingsRoutes)
app.route('/revenue', revenueRoutes)
app.route('/subscription-plans', subscriptionPlansRoutes)
app.route('/notifications', notificationsRoutes)
app.route('/affiliates', affiliatesRoutes)

// Health check for admin routes
app.get('/', (c) => {
  return c.json({
    message: 'Admin API',
    version: '1.0.0',
    endpoints: [
      '/stats',
      '/users',
      '/subscriptions',
      '/health',
      '/audit',
      '/settings',
      '/settings/message-retention',
      '/revenue',
      '/subscription-plans',
      '/notifications',
      '/email-templates',
      '/affiliates'
    ]
  })
})

export default app
