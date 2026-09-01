import { Hono } from 'hono';
import type { Context } from 'hono';
import { prisma } from '../../../../utils/database.js';
import { getApiKeyUserId } from '../../../../middleware/apiKeyAuth.js';

const app = new Hono();

/**
 * GET /api/v1/facebook-pages
 * List all Facebook Pages (Messenger) connected to the authenticated user.
 * Use the returned `id` as `facebook_page_id` when sending messages.
 */
app.get('/', async (c: Context) => {
  try {
    const userId = getApiKeyUserId(c);

    const pages = await prisma.facebookPage.findMany({
      where: {
        userId,
        connectionStatus: 'connected',
      },
      orderBy: { connectedAt: 'asc' },
    });

    return c.json({
      success: true,
      data: pages.map((page) => ({
        id: page.id,
        page_id: page.pageId,
        page_name: page.pageName,
        page_category: page.pageCategory,
        profile_pic_url: page.profilePicUrl,
        connection_status: page.connectionStatus,
        connected_at: page.connectedAt,
      })),
    });
  } catch (error) {
    console.error('Public API - List Facebook pages error:', error);
    return c.json(
      {
        error: {
          code: 'InternalError',
          message: 'Failed to fetch Facebook pages',
        },
      },
      500
    );
  }
});

export default app;
