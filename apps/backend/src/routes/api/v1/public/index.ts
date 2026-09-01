import { Hono } from 'hono';
import type { Context } from 'hono';
import messagesRoutes from './messages.js';
import conversationsRoutes from './conversations.js';
import templatesRoutes from './templates.js';
import phoneNumbersRoutes from './phone-numbers.js';
import instagramAccountsRoutes from './instagram-accounts.js';
import facebookPagesRoutes from './facebook-pages.js';
import { getApiKeyUserId } from '../../../../middleware/apiKeyAuth.js';

const app = new Hono();

/**
 * GET /api/v1/public/health
 * Health check endpoint for credential testing
 * Returns basic info about the authenticated user
 */
app.get('/health', (c: Context) => {
  const userId = getApiKeyUserId(c);
  
  return c.json({
    success: true,
    data: {
      status: 'ok',
      authenticated: true,
      user_id: userId,
      timestamp: new Date().toISOString(),
    },
  });
});

// Mount public API routes
app.route('/messages', messagesRoutes);
app.route('/conversations', conversationsRoutes);
app.route('/templates', templatesRoutes);
app.route('/phone-numbers', phoneNumbersRoutes);
app.route('/instagram-accounts', instagramAccountsRoutes);
app.route('/facebook-pages', facebookPagesRoutes);

export default app;
