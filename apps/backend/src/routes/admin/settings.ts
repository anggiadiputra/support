/**
 * Admin Settings Routes
 * 
 * API endpoints for managing admin settings (WhatsApp, Instagram, SMTP, OpenAI, Duitku, Xendit, Branding)
 * Note: Google OAuth is configured via .env only (Better Auth limitation)
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../../middleware/auth.js'
import { adminSettingsService } from '../../services/admin/settings-service.js'
import { isValidCategory, type SettingCategory } from '../../types/admin-settings.js'

const app = new Hono()

// Valid categories for error messages
const VALID_CATEGORIES_MSG = 'whatsapp, instagram, smtp, openai, duitku, xendit, branding'

// All settings routes require ADMIN role
app.use('/*', requireRole(['ADMIN']))

/**
 * GET /api/v1/admin/settings/openai/models
 * Fetch available models from configured OpenAI-compatible endpoint
 * NOTE: This route MUST be defined BEFORE /:category to avoid route conflicts
 */
app.get('/openai/models', async (c: Context) => {
  try {
    const result = await adminSettingsService.fetchOpenAIModels()

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Admin fetch OpenAI models error:', error)
    const message = error instanceof Error ? error.message : 'Failed to fetch models'
    return c.json({
      error: {
        code: 'InternalServerError',
        message
      }
    }, 500)
  }
})

/**
 * GET /api/v1/admin/settings/:category
 * Get settings for a category with masked sensitive values
 */
app.get('/:category', async (c: Context) => {
  try {
    const category = c.req.param('category')

    // Validate category
    if (!isValidCategory(category)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Invalid settings category: ${category}. Valid categories: ${VALID_CATEGORIES_MSG}`
        }
      }, 400)
    }

    const result = await adminSettingsService.getSettings(category as SettingCategory)

    return c.json({
      success: true,
      data: {
        data: result.data,
        source: result.source
      }
    })
  } catch (error) {
    console.error('Admin get settings error:', error)
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch settings'
      }
    }, 500)
  }
})

/**
 * PUT /api/v1/admin/settings/:category
 * Update settings for a category
 */
app.put('/:category', async (c: Context) => {
  try {
    const category = c.req.param('category')

    // Validate category
    if (!isValidCategory(category)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Invalid settings category: ${category}. Valid categories: ${VALID_CATEGORIES_MSG}`
        }
      }, 400)
    }

    const body = await c.req.json()

    // Validate request body
    if (!body || typeof body !== 'object' || Object.keys(body).length === 0) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Request body must be a non-empty object'
        }
      }, 400)
    }

    // Get admin user ID and IP
    const adminId = c.user?.id
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() 
      || c.req.header('x-real-ip') 
      || 'unknown'

    const result = await adminSettingsService.updateSettings(
      category as SettingCategory,
      body,
      adminId,
      ipAddress
    )

    return c.json({
      success: result.success,
      message: result.message
    })
  } catch (error) {
    console.error('Admin update settings error:', error)
    const message = error instanceof Error ? error.message : 'Failed to update settings'
    return c.json({
      error: {
        code: 'InternalServerError',
        message
      }
    }, 500)
  }
})


/**
 * POST /api/v1/admin/settings/:category/test
 * Test connection for a category
 */
app.post('/:category/test', async (c: Context) => {
  try {
    const category = c.req.param('category')

    // Validate category
    if (!isValidCategory(category)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Invalid settings category: ${category}. Valid categories: ${VALID_CATEGORIES_MSG}`
        }
      }, 400)
    }

    // For SMTP, get optional test email from body
    let testEmail: string | undefined
    if (category === 'smtp') {
      try {
        const body = await c.req.json()
        testEmail = body?.testEmail
      } catch {
        // No body provided, that's fine
      }
    }

    const result = await adminSettingsService.testConnection(
      category as SettingCategory,
      testEmail
    )

    return c.json({
      success: result.success,
      message: result.message,
      details: result.details
    })
  } catch (error) {
    console.error('Admin test connection error:', error)
    const message = error instanceof Error ? error.message : 'Failed to test connection'
    return c.json({
      error: {
        code: 'InternalServerError',
        message
      }
    }, 500)
  }
})

/**
 * POST /api/v1/admin/settings/:category/reset
 * Reset settings to .env default values
 */
app.post('/:category/reset', async (c: Context) => {
  try {
    const category = c.req.param('category')

    // Validate category
    if (!isValidCategory(category)) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: `Invalid settings category: ${category}. Valid categories: ${VALID_CATEGORIES_MSG}`
        }
      }, 400)
    }

    // Get admin user ID and IP
    const adminId = c.user?.id
    if (!adminId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Admin user ID not found'
        }
      }, 401)
    }

    const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() 
      || c.req.header('x-real-ip') 
      || 'unknown'

    const result = await adminSettingsService.resetToDefault(
      category as SettingCategory,
      adminId,
      ipAddress
    )

    return c.json({
      success: result.success,
      message: result.message
    })
  } catch (error) {
    console.error('Admin reset settings error:', error)
    const message = error instanceof Error ? error.message : 'Failed to reset settings'
    return c.json({
      error: {
        code: 'InternalServerError',
        message
      }
    }, 500)
  }
})

export default app
