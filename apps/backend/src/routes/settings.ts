import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { prisma } from '../utils/database.js'
import { auditLog } from '../utils/auditLog.js'
import { auth } from '../lib/auth.js'
import { invalidateUserCache } from '../utils/cache.js'
import { handleValidationError, logDetailedError } from '../middleware/errorHandler.js'

// Import settings sub-routes
import settingsSubRoutes from './settings/index.js'

const app = new Hono()

// Mount API keys and webhooks routes
app.route('/', settingsSubRoutes)

// Validation schemas
const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100),
  email: z.string().email('Invalid email address').optional()
})

const changePasswordSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  confirmPassword: z.string().min(1, 'Please confirm your password')
}).refine(data => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword']
})

// GET /api/v1/settings/profile - Get current user profile
app.get('/profile', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const user = await prisma.user.findUnique({
      where: { id: c.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        emailVerified: true,
        createdAt: true,
        updatedAt: true
      }
    })

    if (!user) {
      return c.json({
        error: {
          code: 'NotFound',
          message: 'User not found'
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: user
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch profile'
      }
    }, 500)
  }
})

// POST /api/v1/settings/profile - Update user profile
app.post('/profile', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const body = await c.req.json()
    const data = updateProfileSchema.parse(body)

    // Check if email is being changed and if it's already taken
    if (data.email && data.email !== c.user.email) {
      const existingUser = await prisma.user.findUnique({
        where: { email: data.email }
      })

      if (existingUser) {
        return c.json({
          error: {
            code: 'Conflict',
            message: 'Email already in use'
          }
        }, 409)
      }
    }

    // Update user profile
    const updatedUser = await prisma.user.update({
      where: { id: c.user.id },
      data: {
        name: data.name,
        ...(data.email && { email: data.email, emailVerified: false })
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        image: true,
        emailVerified: true,
        updatedAt: true
      }
    })

    // Audit log
    await auditLog('PROFILE_UPDATED', 'User', c.user.id, {
      changes: data,
      updatedBy: c.user.id
    }, c.user.id)

    // Invalidate user cache (OPTIMIZATION)
    await invalidateUserCache(c.user.id)

    return c.json({
      success: true,
      data: updatedUser,
      message: data.email && data.email !== c.user.email
        ? 'Profile updated. Please verify your new email address.'
        : 'Profile updated successfully'
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update profile'
      }
    }, 500)
  }
})

// Helper to map Better Auth errors to validation errors
function mapBetterAuthError(error: any): string {
  const message = error.body?.message || error.message || 'Failed to change password'

  if (message.includes('Incorrect') || message.includes('Invalid')) {
    return 'Current password is incorrect'
  }

  return message
}

// POST /api/v1/settings/password - Change password
app.post('/password', async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const body = await c.req.json()
    const data = changePasswordSchema.parse(body)

    try {
      // Try changing password using Better Auth
      // If currentPassword is provided, use changePassword
      if (data.currentPassword) {
        await auth.api.changePassword({
          body: {
            currentPassword: data.currentPassword,
            newPassword: data.newPassword,
            revokeOtherSessions: true
          },
          headers: c.req.raw.headers
        })
      } else {
        // If no current password, try setting password directly (for OAuth users)
        await auth.api.setPassword({
            body: {
                newPassword: data.newPassword
            },
            headers: c.req.raw.headers
        })
      }

      // Also update passwordHash (legacy column) to keep it in sync just in case
      // But we need to hash it with bcrypt for that column.
      // const bcrypt = await import('bcryptjs')
      // const hashedPassword = await bcrypt.hash(data.newPassword, 12)
      // await prisma.user.update({ where: { id: c.user.id }, data: { passwordHash: hashedPassword } })

      // Audit log
      await auditLog('PASSWORD_CHANGED', 'User', c.user.id, {
        changedBy: c.user.id,
        timestamp: new Date()
      }, c.user.id)

      return c.json({
        success: true,
        message: 'Password changed successfully'
      })
    } catch (error: any) {
       // Map Better Auth errors
       logDetailedError(error, { path: c.req.path, method: c.req.method })

       const message = mapBetterAuthError(error)

       if (message === 'Current password is incorrect') {
           return c.json({
             error: {
               code: 'Unauthorized',
               message: 'Current password is incorrect'
             }
           }, 401)
       }

       return c.json({
         error: {
           code: 'BadRequest',
           message: message
         }
       }, 400)
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to change password'
      }
    }, 500)
  }
})

export default app
