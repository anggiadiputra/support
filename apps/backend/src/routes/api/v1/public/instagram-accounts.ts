import { Hono } from 'hono';
import type { Context } from 'hono';
import { prisma } from '../../../../utils/database.js';
import { getApiKeyUserId } from '../../../../middleware/apiKeyAuth.js';

const app = new Hono();

/**
 * GET /api/v1/instagram-accounts
 * List all Instagram accounts connected to the authenticated user.
 * Use the returned `id` as `instagram_account_id` when sending messages.
 */
app.get('/', async (c: Context) => {
  try {
    const userId = getApiKeyUserId(c);

    const accounts = await prisma.instagramAccount.findMany({
      where: {
        userId,
        connectionStatus: 'connected',
      },
      orderBy: { connectedAt: 'asc' },
    });

    return c.json({
      success: true,
      data: accounts.map((acc) => ({
        id: acc.id,
        ig_id: acc.igId,
        username: acc.username,
        profile_pic_url: acc.profilePicUrl,
        connection_status: acc.connectionStatus,
        connected_at: acc.connectedAt,
      })),
    });
  } catch (error) {
    console.error('Public API - List Instagram accounts error:', error);
    return c.json(
      {
        error: {
          code: 'InternalError',
          message: 'Failed to fetch Instagram accounts',
        },
      },
      500
    );
  }
});

export default app;
