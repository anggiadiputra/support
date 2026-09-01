/**
 * Notification API Routes
 *
 * Handles notification listing, marking as read, and deletion.
 * All routes require authentication.
 *
 * Routes:
 * - GET    /api/v1/notifications          - List notifications with optional filters
 * - POST   /api/v1/notifications/:id/read - Mark single notification as read
 * - POST   /api/v1/notifications/read-all - Mark all notifications as read
 * - DELETE /api/v1/notifications/:id      - Delete single notification
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { notificationService } from '../services/notification-service.js';
import { logger } from '../utils/logger.js';

const app = new Hono();

/**
 * GET /api/v1/notifications
 * Get notifications for the authenticated user
 *
 * Query Parameters:
 * - unreadOnly: boolean (default: false) - Only return unread notifications
 * - limit: number (default: 50, max: 100) - Number of notifications to return
 * - offset: number (default: 0) - Pagination offset
 *
 * Returns:
 * - notifications: Array of notification objects
 * - unreadCount: Total number of unread notifications
 * - total: Total number of notifications (respecting filters)
 */
app.get('/', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const userId = c.user.id;

    // Parse query parameters
    const unreadOnlyParam = c.req.query('unreadOnly');
    const limitParam = c.req.query('limit');
    const offsetParam = c.req.query('offset');

    const unreadOnly = unreadOnlyParam === 'true';
    const limit = Math.min(Math.max(1, parseInt(limitParam || '50', 10) || 50), 100);
    const offset = Math.max(0, parseInt(offsetParam || '0', 10) || 0);

    const result = await notificationService.getByUser(userId, {
      unreadOnly,
      limit,
      offset,
    });

    return c.json({
      success: true,
      data: {
        notifications: result.notifications,
        unreadCount: result.unreadCount,
        total: result.total,
      },
    });
  } catch (error) {
    logger.error('Get notifications error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to get notifications',
      },
    }, 500);
  }
});

/**
 * POST /api/v1/notifications/read-all
 * Mark all notifications as read for the authenticated user
 *
 * NOTE: This route must be defined BEFORE /:id/read to prevent
 * "read-all" from being interpreted as an :id parameter
 */
app.post('/read-all', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const userId = c.user.id;

    await notificationService.markAllAsRead(userId);

    return c.json({
      success: true,
      message: 'All notifications marked as read',
    });
  } catch (error) {
    logger.error('Mark all notifications as read error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to mark all notifications as read',
      },
    }, 500);
  }
});

/**
 * POST /api/v1/notifications/:id/read
 * Mark a single notification as read
 *
 * Path Parameters:
 * - id: Notification ID
 */
app.post('/:id/read', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const userId = c.user.id;
    const notificationId = c.req.param('id');

    if (!notificationId) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Notification ID is required',
        },
      }, 400);
    }

    await notificationService.markAsRead(notificationId, userId);

    return c.json({
      success: true,
      message: 'Notification marked as read',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Notification not found') {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Notification not found',
        },
      }, 404);
    }

    logger.error('Mark notification as read error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to mark notification as read',
      },
    }, 500);
  }
});

/**
 * DELETE /api/v1/notifications/:id
 * Delete a single notification
 *
 * Path Parameters:
 * - id: Notification ID
 */
app.delete('/:id', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required',
        },
      }, 401);
    }

    const userId = c.user.id;
    const notificationId = c.req.param('id');

    if (!notificationId) {
      return c.json({
        error: {
          code: 'BadRequest',
          message: 'Notification ID is required',
        },
      }, 400);
    }

    await notificationService.delete(notificationId, userId);

    return c.json({
      success: true,
      message: 'Notification deleted',
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Notification not found') {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'Notification not found',
        },
      }, 404);
    }

    logger.error('Delete notification error:', error);

    return c.json({
      error: {
        code: 'InternalError',
        message: 'Failed to delete notification',
      },
    }, 500);
  }
});

export default app;
