/**
 * Facebook Messenger Connection Routes
 * Handles OAuth flow and page management
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { prisma } from '../../utils/database.js'
import * as messengerService from '../../services/messenger/index.js'
import { MessengerError } from '../../services/messenger/errors.js'
import { auditLog } from '../../utils/auditLog.js'

const app = new Hono()

/**
 * GET /url - Generate Facebook OAuth URL
 */
app.get('/url', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const authResponse = await messengerService.generateAuthUrl(c.user.id)

    return c.json({
      success: true,
      data: {
        authUrl: authResponse.authUrl,
        expiresAt: authResponse.expiresAt,
      },
    })
  } catch (error) {
    console.error('[Messenger] Generate auth URL error:', error)

    if (error instanceof MessengerError) {
      return c.json(error.toJSON(), error.statusCode as any)
    }

    return c.json({
      error: { code: 'InternalServerError', message: 'Failed to generate auth URL' },
    }, 500)
  }
})

/**
 * GET /callback - Handle OAuth callback
 */
app.get('/callback', async (c: Context) => {
  const rawFrontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'
  const frontendUrl = rawFrontendUrl.replace(/^["']|["']$/g, '')
  const redirectBase = `${frontendUrl}/messenger/callback`

  try {
    const code = c.req.query('code')
    const state = c.req.query('state')
    const error = c.req.query('error')
    const errorDescription = c.req.query('error_description')

    if (error === 'access_denied') {
      return c.redirect(`${redirectBase}?error=access_denied&message=${encodeURIComponent(errorDescription || 'Authorization cancelled')}`)
    }

    if (error) {
      return c.redirect(`${redirectBase}?error=${encodeURIComponent(error)}&message=${encodeURIComponent(errorDescription || 'Authorization failed')}`)
    }

    if (!code || !state) {
      return c.redirect(`${redirectBase}?error=invalid_request&message=${encodeURIComponent('Missing code or state')}`)
    }

    // Exchange code for token
    const tokenResponse = await messengerService.exchangeCodeForToken(code, state)
    const userId = tokenResponse.userId

    // Get user's pages
    const pages = await messengerService.getUserPages(tokenResponse.accessToken)

    if (pages.length === 0) {
      return c.redirect(`${redirectBase}?error=no_pages&message=${encodeURIComponent('No Facebook Pages found')}`)
    }

    // Store pages temporarily for selection
    // In a real implementation, you might want to show a page selection UI
    // For now, we'll connect all pages
    let connectedCount = 0
    for (const page of pages) {
      // Check if page already connected
      const existing = await prisma.facebookPage.findUnique({
        where: { pageId: page.id },
      })

      if (existing) {
        if (existing.userId !== userId) {
          console.log(`[Messenger] Page ${page.id} already connected to another user`)
          continue
        }
        // Update existing connection
        const encrypted = messengerService.encryptToken(page.access_token)
        await prisma.facebookPage.update({
          where: { id: existing.id },
          data: {
            pageName: page.name,
            pageCategory: page.category,
            profilePicUrl: page.picture?.data?.url,
            accessToken: encrypted.ciphertext,
            accessTokenIV: encrypted.iv,
            accessTokenTag: encrypted.authTag,
            connectionStatus: 'connected',
            connectedAt: new Date(),
          },
        })
        connectedCount++
      } else {
        // Create new connection
        const encrypted = messengerService.encryptToken(page.access_token)
        await prisma.facebookPage.create({
          data: {
            userId,
            pageId: page.id,
            pageName: page.name,
            pageCategory: page.category,
            profilePicUrl: page.picture?.data?.url,
            accessToken: encrypted.ciphertext,
            accessTokenIV: encrypted.iv,
            accessTokenTag: encrypted.authTag,
            grantedPermissions: ['pages_show_list', 'pages_messaging', 'pages_manage_metadata'],
            connectionStatus: 'connected',
          },
        })
        connectedCount++
      }

      // Subscribe to webhook
      const subscribed = await messengerService.subscribePageWebhook(page.id, page.access_token)
      if (subscribed) {
        await prisma.facebookPage.update({
          where: { pageId: page.id },
          data: {
            webhookSubscribed: true,
            webhookSubscribedAt: new Date(),
          },
        })
      }

      // Log connection
      const fbPage = await prisma.facebookPage.findUnique({
        where: { pageId: page.id },
      })
      if (fbPage) {
        await prisma.messengerConnectionLog.create({
          data: {
            facebookPageId: fbPage.id,
            action: 'connect',
            details: {
              pageName: page.name,
              webhookSubscribed: subscribed,
              connectedBy: userId,
            },
          },
        })
        
        // Audit log for messenger connection
        await auditLog(
          'MESSENGER_PAGE_CONNECTED',
          'FacebookPage',
          fbPage.id,
          {
            pageId: page.id,
            pageName: page.name,
            webhookSubscribed: subscribed,
          },
          userId
        )
      }
    }

    return c.redirect(`${redirectBase}?success=true&pages=${connectedCount}`)
  } catch (error) {
    console.error('[Messenger] OAuth callback error:', error)

    if (error instanceof MessengerError) {
      return c.redirect(`${redirectBase}?error=${encodeURIComponent(error.code)}&message=${encodeURIComponent(error.userMessage || error.message)}`)
    }

    return c.redirect(`${redirectBase}?error=internal_error&message=${encodeURIComponent('Connection failed')}`)
  }
})

/**
 * GET /pages - List connected pages
 */
app.get('/pages', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // For agents, use their business owner's ID
    const userId = c.user.role === 'AGENT' && c.user.businessOwnerId
      ? c.user.businessOwnerId
      : c.user.id

    const pages = await prisma.facebookPage.findMany({
      where: { 
        userId,
        connectionStatus: { in: ['connected', 'requires_reauth'] },
      },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        pageCategory: true,
        profilePicUrl: true,
        connectionStatus: true,
        connectedAt: true,
        webhookSubscribed: true,
        _count: {
          select: { conversations: true },
        },
      },
      orderBy: { connectedAt: 'desc' },
    })

    return c.json({
      success: true,
      data: pages.map(p => ({
        ...p,
        conversationCount: p._count.conversations,
        _count: undefined,
      })),
    })
  } catch (error) {
    console.error('[Messenger] List pages error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to list pages' } }, 500)
  }
})

/**
 * DELETE /pages/:id - Disconnect a page
 * Accepts either internal database ID or Facebook Page ID
 */
app.delete('/pages/:id', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const idParam = c.req.param('id')

    // Support lookup by either internal ID or Facebook Page ID
    const page = await prisma.facebookPage.findFirst({
      where: {
        userId: c.user.id,
        OR: [
          { id: idParam },
          { pageId: idParam },
        ],
      },
    })

    if (!page) {
      return c.json({ error: { code: 'NotFound', message: 'Page not found' } }, 404)
    }

    // Soft delete - mark as disconnected
    await prisma.facebookPage.update({
      where: { id: page.id },
      data: { connectionStatus: 'disconnected' },
    })

    // Log disconnection
    await prisma.messengerConnectionLog.create({
      data: {
        facebookPageId: page.id,
        action: 'disconnect',
        details: { disconnectedBy: c.user.id },
      },
    })
    
    // Audit log for messenger disconnection
    await auditLog(
      'MESSENGER_PAGE_DISCONNECTED',
      'FacebookPage',
      page.id,
      {
        pageId: page.pageId,
        pageName: page.pageName,
      },
      c.user.id
    )

    return c.json({ success: true, message: 'Page disconnected successfully' })
  } catch (error) {
    console.error('[Messenger] Disconnect page error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to disconnect page' } }, 500)
  }
})

/**
 * GET /status - Get connection status
 */
app.get('/status', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    // For agents, use their business owner's ID
    const userId = c.user.role === 'AGENT' && c.user.businessOwnerId
      ? c.user.businessOwnerId
      : c.user.id

    const connectedPages = await prisma.facebookPage.count({
      where: { userId, connectionStatus: 'connected' },
    })

    const pages = await prisma.facebookPage.findMany({
      where: { userId, connectionStatus: 'connected' },
      select: {
        id: true,
        pageId: true,
        pageName: true,
        profilePicUrl: true,
        webhookSubscribed: true,
        connectedAt: true,
        _count: {
          select: { conversations: true },
        },
      },
    })

    return c.json({
      success: true,
      data: {
        connected: connectedPages > 0,
        pageCount: connectedPages,
        pages: pages.map(p => ({
          id: p.id,
          pageId: p.pageId,
          pageName: p.pageName,
          profilePicUrl: p.profilePicUrl,
          webhookSubscribed: p.webhookSubscribed,
          connectedAt: p.connectedAt,
          conversationCount: p._count.conversations,
        })),
      },
    })
  } catch (error) {
    console.error('[Messenger] Status error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to get status' } }, 500)
  }
})

export default app
