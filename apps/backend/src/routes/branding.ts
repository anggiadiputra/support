/**
 * Public Branding Routes
 * 
 * Public API endpoint for fetching branding settings.
 * No authentication required - used by auth pages and public-facing components.
 * 
 * Requirements: 7.1, 7.2
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { settingsCache, CACHE_TTL } from '../services/settings-cache.js'
import { prisma } from '../utils/database.js'
import { logger } from '../utils/logger.js'
import { 
  DEFAULT_BRANDING, 
  BRANDING_SETTINGS_KEYS,
  dbKeyToCamelCase,
  type BrandingSettings 
} from '../types/admin-settings.js'

const app = new Hono()

const BRANDING_CACHE_KEY = 'branding:public'

/**
 * GET /api/v1/branding
 * Public endpoint to fetch branding settings
 * Returns website name, logo URL, support email, support WhatsApp
 * Cached for 60 seconds
 * 
 * Requirements: 7.1, 7.2
 */
app.get('/', async (c: Context) => {
  try {
    // Check cache first
    const cached = settingsCache.get<BrandingSettings>(BRANDING_CACHE_KEY)
    if (cached) {
      return c.json({
        success: true,
        data: cached
      })
    }

    // Fetch from database
    const dbSettings = await prisma.systemSetting.findMany({
      where: { category: 'branding' }
    })

    // Build branding object with defaults for missing values
    const branding: BrandingSettings = { ...DEFAULT_BRANDING }

    for (const setting of dbSettings) {
      const propName = dbKeyToCamelCase(setting.key) as keyof BrandingSettings
      if (propName in branding && setting.value) {
        // Parse JSON for externalLinks
        if (propName === 'externalLinks') {
          try {
            branding.externalLinks = JSON.parse(setting.value)
          } catch {
            branding.externalLinks = []
          }
        } else {
          (branding as unknown as Record<string, string>)[propName] = setting.value
        }
      }
    }

    // Cache the result for 60 seconds
    settingsCache.set(BRANDING_CACHE_KEY, branding, CACHE_TTL.settings)

    return c.json({
      success: true,
      data: branding
    })
  } catch (error) {
    logger.error('Failed to fetch branding settings', {
      error: error instanceof Error ? error.message : 'Unknown error'
    })

    // Return defaults on error
    return c.json({
      success: true,
      data: DEFAULT_BRANDING
    })
  }
})

/**
 * Invalidate branding cache
 * Called by admin settings service when branding is updated
 */
export function invalidateBrandingCache(): void {
  settingsCache.invalidate(BRANDING_CACHE_KEY)
  logger.debug('Branding cache invalidated')
}

export default app
