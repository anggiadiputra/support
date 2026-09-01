/**
 * Public Channel Status Routes
 * 
 * Public API endpoint for fetching channel enabled status.
 * No authentication required - used by sidebar to show/hide channel links.
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { settingsCache, CACHE_TTL } from '../services/settings-cache.js'
import { prisma } from '../utils/database.js'
import { logger } from '../utils/logger.js'

const app = new Hono()

const CHANNELS_CACHE_KEY = 'channels:status'

export interface ChannelStatus {
  instagram: boolean
  messenger: boolean
}

const DEFAULT_CHANNEL_STATUS: ChannelStatus = {
  instagram: false,
  messenger: false,
}

/**
 * GET /api/v1/channels/status
 * Public endpoint to fetch channel enabled status
 * Returns { instagram: boolean, messenger: boolean }
 * Cached for 60 seconds
 */
app.get('/status', async (c: Context) => {
  try {
    // Check cache first
    const cached = settingsCache.get<ChannelStatus>(CHANNELS_CACHE_KEY)
    if (cached) {
      return c.json({
        success: true,
        data: cached
      })
    }

    // Fetch instagram enabled status from database
    const instagramEnabled = await prisma.systemSetting.findUnique({
      where: { 
        category_key: { 
          category: 'instagram', 
          key: 'enabled' 
        } 
      }
    })

    // Fetch messenger enabled status from database
    const messengerEnabled = await prisma.systemSetting.findUnique({
      where: { 
        category_key: { 
          category: 'messenger', 
          key: 'enabled' 
        } 
      }
    })

    const channelStatus: ChannelStatus = {
      instagram: instagramEnabled?.value === 'true',
      messenger: messengerEnabled?.value === 'true',
    }

    // Cache the result for 60 seconds
    settingsCache.set(CHANNELS_CACHE_KEY, channelStatus, CACHE_TTL.settings)

    return c.json({
      success: true,
      data: channelStatus
    })
  } catch (error) {
    logger.error('Failed to fetch channel status', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Return defaults on error
    return c.json({
      success: true,
      data: DEFAULT_CHANNEL_STATUS
    })
  }
})

/**
 * Invalidate channel status cache
 * Called by admin settings service when instagram/messenger settings are updated
 */
export function invalidateChannelStatusCache(): void {
  settingsCache.invalidate(CHANNELS_CACHE_KEY)
  logger.debug('Channel status cache invalidated')
}

export default app
