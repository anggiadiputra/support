import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import { prisma } from '../utils/database.js'
import { auditLog } from '../utils/auditLog.js'
import { otpService } from '../services/otp-service.js'
import { emailService } from '../services/email/EmailService.js'
import { sanitizeEmail, sanitizeIP, sanitizeName } from '../utils/sanitize.js'
import type { Context } from 'hono'
import { handleValidationError, logDetailedError } from '../middleware/errorHandler.js'
import { affiliateService } from '../services/affiliate-service.js'
import { logger } from '../utils/logger.js'

const app = new Hono()

// Enhanced validation schemas with strict input sanitization
const emailSchema = z.string()
  .min(1, 'Email is required')
  .max(254, 'Email too long')
  .email('Invalid email format')
  .transform(val => val.toLowerCase().trim())

const passwordSchema = z.string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')

const nameSchema = z.string()
  .min(1, 'Name is required')
  .max(100, 'Name too long')
  .transform(val => val.trim())

const otpCodeSchema = z.string()
  .length(6, 'OTP must be 6 digits')
  .regex(/^\d{6}$/, 'OTP must be 6 digits')

// Validation schemas
const loginSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  twoFactorToken: z.string().optional()
})

const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  role: z.enum(['BUSINESS_OWNER', 'AGENT']).default('BUSINESS_OWNER'),
  referralCode: z.string().max(50).optional()
})

const changePasswordSchema = z.object({
  currentPassword: z.string(),
  newPassword: passwordSchema
})

// OTP Registration schemas
const initiateRegistrationSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: nameSchema,
  referralCode: z.string().max(50).optional()
})

const verifyOTPSchema = z.object({
  email: emailSchema,
  otp: otpCodeSchema
})

const resendOTPSchema = z.object({
  email: emailSchema
})

// Password Reset schemas
const forgotPasswordSchema = z.object({
  email: emailSchema
})

const resetPasswordSchema = z.object({
  email: emailSchema,
  otp: otpCodeSchema,
  newPassword: passwordSchema
})

// Helper to get client IP
function getClientIP(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
  const realIP = c.req.header('x-real-ip')
  return sanitizeIP(forwarded || realIP || 'unknown')
}

// Helper function to generate JWT
async function generateJWT(userId: string, email: string, role: string) {
  const secret = new TextEncoder().encode(
    process.env.JWT_SECRET || 'your-secret-key'
  )

  return await new SignJWT({
    userId,
    email,
    role
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('24h')
    .sign(secret)
}

// POST /api/v1/auth/login
app.post('/login', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email, password, twoFactorToken } = loginSchema.parse(body)
    
    // Find user
    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      include: { subscription: true }
    })
    
    if (!user) {
      return c.json({
        error: {
          code: 'InvalidCredentials',
          message: 'Invalid email or password'
        }
      }, 401)
    }
    
    // Check if account is active
    if (!user.isActive) {
      await auditLog('LOGIN_FAILED', 'User', user.id, {
        reason: 'Account deactivated',
        email
      }, user.id)
      
      return c.json({
        error: {
          code: 'AccountDeactivated',
          message: 'Account is deactivated'
        }
      }, 401)
    }
    
    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.passwordHash)
    if (!isValidPassword) {
      await auditLog('LOGIN_FAILED', 'User', user.id, {
        reason: 'Invalid password',
        email
      }, user.id)
      
      return c.json({
        error: {
          code: 'InvalidCredentials',
          message: 'Invalid email or password'
        }
      }, 401)
    }
    
    // Check 2FA if enabled
    if (user.twoFactorEnabled) {
      if (!twoFactorToken) {
        return c.json({
          error: {
            code: 'TwoFactorRequired',
            message: '2FA token is required'
          }
        }, 401)
      }
      
      // TODO: Implement TOTP verification
      // const isValid2FA = await verifyTOTP(user.twoFactorSecret!, twoFactorToken)
      // if (!isValid2FA) {
      //   return c.json({
      //     error: {
      //       code: 'Invalid2FA',
      //       message: 'Invalid 2FA token'
      //     }
      //   }, 401)
      // }
    }
    
    // Generate JWT
    const token = await generateJWT(
      user.id,
      user.email,
      user.role
    )
    
    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    })
    
    // Audit log
    await auditLog('LOGIN_SUCCESS', 'User', user.id, {
      email,
      role: user.role
    }, user.id)
    
    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          subscription: user.subscription ? {
            tier: user.subscription.tier,
            status: user.subscription.status,
            endDate: user.subscription.endDate
          } : {
            tier: 'FREE',
            status: 'ACTIVE',
            endDate: null
          }
        }
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Login failed'
      }
    }, 500)
  }
})

// POST /api/v1/auth/register
app.post('/register', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email, password, name, role, referralCode: bodyReferralCode } = registerSchema.parse(body)
    
    // Get referral code from body or query param
    const referralCode = bodyReferralCode || c.req.query('ref')

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() }
    })

    if (existingUser) {
      return c.json({
        error: {
          code: 'UserExists',
          message: 'User with this email already exists'
        }
      }, 409)
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12)

    // Create user with FREE subscription
    const user = await prisma.$transaction(async (tx) => {
      const newUser = await tx.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash,
          name,
          role,
          emailVerified: false
        }
      })

      // Create FREE subscription for new user
      await tx.subscription.create({
        data: {
          userId: newUser.id,
          tier: 'FREE',
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: null, // FREE plan has no expiry
          autoRenewEnabled: false
        }
      })

      return newUser
    })

    // Track referral if referral code provided (non-blocking)
    if (referralCode) {
      try {
        await affiliateService.trackReferral(referralCode, user.id)
        logger.info('Referral tracked', { userId: user.id, referralCode })
      } catch (error) {
        // Non-critical - log but don't fail registration
        logger.warn('Failed to track referral', {
          userId: user.id,
          referralCode,
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }
    
    // Generate JWT
    const token = await generateJWT(
      user.id,
      user.email,
      user.role
    )
    
    // Audit log
    await auditLog('USER_REGISTERED', 'User', user.id, {
      email,
      role,
      referralCode: referralCode || null
    }, user.id)
    
    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          twoFactorEnabled: user.twoFactorEnabled,
          // New users default to FREE
          subscription: {
            tier: 'FREE',
            status: 'ACTIVE',
            endDate: null
          }
        }
      }
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Registration failed'
      }
    }, 500)
  }
})

// POST /api/v1/auth/register/initiate - Initiate OTP registration
app.post('/register/initiate', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email, password, name, referralCode: bodyReferralCode } = initiateRegistrationSchema.parse(body)
    const normalizedEmail = sanitizeEmail(email) || email.toLowerCase()
    const sanitizedName = sanitizeName(name)
    
    // Get referral code from body or query param
    const referralCode = bodyReferralCode || c.req.query('ref')

    // Get client IP for rate limiting and logging
    const clientIP = getClientIP(c)

    // Check rate limits (email + IP)
    const rateLimitResult = await otpService.checkRateLimit(normalizedEmail, clientIP)
    if (!rateLimitResult.allowed) {
      // Security log: Rate limit violation
      await auditLog('RATE_LIMIT_EXCEEDED', 'Registration', normalizedEmail, {
        email: normalizedEmail,
        ip: clientIP,
        type: 'otp_generation',
        retryAfter: rateLimitResult.retryAfter
      }, undefined, clientIP)

      return c.json({
        error: {
          code: 'RateLimitExceeded',
          message: 'Too many attempts. Please try again later.',
          retryAfter: rateLimitResult.retryAfter
        }
      }, 429)
    }

    // Check if user already exists - return same response to prevent email enumeration
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    // Hash password before storing in pending registration
    const passwordHash = await bcrypt.hash(password, 12)

    // Generate OTP
    const otp = otpService.generateOTP()

    // Store pending registration (even if user exists, to prevent enumeration)
    // Use sanitized name for storage, include referral code if provided
    const { expiresAt } = await otpService.storePendingRegistration(
      normalizedEmail,
      sanitizedName,
      passwordHash,
      otp,
      referralCode
    )

    // Only send email if user doesn't exist
    if (!existingUser) {
      const emailResult = await emailService.sendOTPEmail({
        to: normalizedEmail,
        otp,
        expiresInMinutes: otpService.getOTPExpiryMinutes()
      })

      if (!emailResult.success) {
        logDetailedError(new Error(`Failed to send OTP email: ${emailResult.error}`), { path: c.req.path, method: c.req.method })
        // Don't expose email delivery failure to prevent enumeration
      }
    }

    // Audit log
    await auditLog('REGISTRATION_INITIATED', 'User', normalizedEmail, {
      email: normalizedEmail,
      ip: clientIP
    })

    // Return same response regardless of whether user exists
    return c.json({
      success: true,
      data: {
        message: 'OTP sent to email',
        expiresAt: expiresAt.toISOString(),
        resendCooldown: otpService.getResendCooldown()
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to initiate registration'
      }
    }, 500)
  }
})

// POST /api/v1/auth/register/verify - Verify OTP and complete registration
app.post('/register/verify', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email, otp } = verifyOTPSchema.parse(body)
    const normalizedEmail = sanitizeEmail(email) || email.toLowerCase()

    // Get client IP for security logging
    const clientIP = getClientIP(c)

    // Verify OTP
    const verifyResult = await otpService.verifyOTP(normalizedEmail, otp)

    if (!verifyResult.valid) {
      // Security log: Failed verification attempt with IP
      await auditLog('OTP_VERIFICATION_FAILED', 'User', normalizedEmail, {
        email: normalizedEmail,
        ip: clientIP,
        error: verifyResult.error,
        attemptsRemaining: verifyResult.attemptsRemaining,
        timestamp: new Date().toISOString()
      }, undefined, clientIP)

      return c.json({
        error: {
          code: 'InvalidOTP',
          message: verifyResult.error || 'Invalid or expired OTP code',
          attemptsRemaining: verifyResult.attemptsRemaining
        }
      }, 400)
    }

    const pendingReg = verifyResult.pendingRegistration!

    // Check if user already exists (race condition protection)
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (existingUser) {
      // Clean up pending registration
      await otpService.invalidateOTP(normalizedEmail)
      
      return c.json({
        error: {
          code: 'UserExists',
          message: 'User with this email already exists'
        }
      }, 409)
    }

    // Create user with verified email and Better Auth account in a transaction
    const user = await prisma.$transaction(async (tx) => {
      // Create user
      const newUser = await tx.user.create({
        data: {
          email: normalizedEmail,
          passwordHash: pendingReg.passwordHash,
          name: pendingReg.name,
          role: 'BUSINESS_OWNER',
          emailVerified: true,
          emailVerifiedAt: new Date()
        }
      })

      // Create Better Auth credential account for login compatibility
      await tx.account.create({
        data: {
          id: `credential_${newUser.id}`,
          userId: newUser.id,
          accountId: newUser.id,
          providerId: 'credential',
          password: pendingReg.passwordHash
        }
      })

      // Create FREE subscription for new user
      await tx.subscription.create({
        data: {
          userId: newUser.id,
          tier: 'FREE',
          status: 'ACTIVE',
          startDate: new Date(),
          endDate: null, // FREE plan has no expiry
          autoRenewEnabled: false
        }
      })

      return newUser
    })

    // Track referral if referral code was stored during initiation (non-blocking)
    if (pendingReg.referralCode) {
      try {
        await affiliateService.trackReferral(pendingReg.referralCode, user.id)
        logger.info('Referral tracked', { userId: user.id, referralCode: pendingReg.referralCode })
      } catch (error) {
        // Non-critical - log but don't fail registration
        logger.warn('Failed to track referral', {
          userId: user.id,
          referralCode: pendingReg.referralCode,
          error: error instanceof Error ? error.message : 'Unknown',
        })
      }
    }

    // Clean up pending registration
    await otpService.invalidateOTP(normalizedEmail)

    // Generate JWT
    const token = await generateJWT(user.id, user.email, user.role)

    // Send welcome email (non-blocking)
    emailService.sendWelcomeEmail({
      to: user.email,
      userName: user.name || 'Pengguna',
    }).catch((error) => {
      logDetailedError(error, { path: c.req.path, method: c.req.method })
      // Don't fail registration if welcome email fails
    })

    // Audit log
    await auditLog('USER_REGISTERED_OTP', 'User', user.id, {
      email: normalizedEmail,
      role: user.role,
      referralCode: pendingReg.referralCode || null
    }, user.id)

    return c.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          emailVerified: user.emailVerified,
          subscription: {
            tier: 'FREE',
            status: 'ACTIVE',
            endDate: null
          }
        }
      }
    }, 201)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to verify OTP'
      }
    }, 500)
  }
})

// POST /api/v1/auth/register/resend - Resend OTP
app.post('/register/resend', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email } = resendOTPSchema.parse(body)
    const normalizedEmail = sanitizeEmail(email) || email.toLowerCase()

    // Get client IP for security logging
    const clientIP = getClientIP(c)

    // Check if resend is allowed
    const resendResult = await otpService.resendOTP(normalizedEmail)

    if (!resendResult.success) {
      // Check if it's a cooldown error
      const resendCheck = await otpService.checkResendAllowed(normalizedEmail)
      
      if (resendCheck.cooldownRemaining) {
        // Security log: Cooldown violation attempt
        await auditLog('RESEND_COOLDOWN_VIOLATION', 'Registration', normalizedEmail, {
          email: normalizedEmail,
          ip: clientIP,
          cooldownRemaining: resendCheck.cooldownRemaining,
          timestamp: new Date().toISOString()
        }, undefined, clientIP)

        return c.json({
          error: {
            code: 'CooldownActive',
            message: resendResult.error,
            retryAfter: resendCheck.cooldownRemaining
          }
        }, 429)
      }

      // Security log: Max resends exceeded
      if (resendCheck.resendsRemaining === 0) {
        await auditLog('MAX_RESENDS_EXCEEDED', 'Registration', normalizedEmail, {
          email: normalizedEmail,
          ip: clientIP,
          timestamp: new Date().toISOString()
        }, undefined, clientIP)
      }

      return c.json({
        error: {
          code: 'ResendFailed',
          message: resendResult.error || 'Failed to resend OTP'
        }
      }, 400)
    }

    // Send new OTP email
    const emailResult = await emailService.sendOTPEmail({
      to: normalizedEmail,
      otp: resendResult.otp!,
      expiresInMinutes: otpService.getOTPExpiryMinutes()
    })

    if (!emailResult.success) {
      logDetailedError(new Error(`Failed to send OTP email: ${emailResult.error}`), { path: c.req.path, method: c.req.method })
      // Still return success to prevent enumeration
    }

    // Audit log
    await auditLog('OTP_RESENT', 'User', normalizedEmail, {
      email: normalizedEmail,
      resendsRemaining: resendResult.resendsRemaining
    })

    return c.json({
      success: true,
      data: {
        message: 'OTP resent',
        expiresAt: resendResult.expiresAt!.toISOString(),
        resendCooldown: otpService.getResendCooldown(),
        resendsRemaining: resendResult.resendsRemaining
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to resend OTP'
      }
    }, 500)
  }
})

// POST /api/v1/auth/forgot-password - Request password reset OTP
app.post('/forgot-password', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email } = forgotPasswordSchema.parse(body)
    const normalizedEmail = sanitizeEmail(email) || email.toLowerCase()
    const clientIP = getClientIP(c)

    // Check rate limits
    const rateLimitResult = await otpService.checkRateLimit(normalizedEmail, clientIP)
    if (!rateLimitResult.allowed) {
      await auditLog('RATE_LIMIT_EXCEEDED', 'PasswordReset', normalizedEmail, {
        email: normalizedEmail,
        ip: clientIP,
        type: 'password_reset',
        retryAfter: rateLimitResult.retryAfter
      }, undefined, clientIP)

      return c.json({
        error: {
          code: 'RateLimitExceeded',
          message: 'Too many attempts. Please try again later.',
          retryAfter: rateLimitResult.retryAfter
        }
      }, 429)
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    // Generate OTP
    const otp = otpService.generateOTP()

    // Store pending reset (even if user doesn't exist, to prevent enumeration)
    const { expiresAt } = await otpService.storePendingPasswordReset(normalizedEmail, otp)

    // Only send email if user exists
    if (user) {
      const emailResult = await emailService.sendPasswordResetEmail({
        to: normalizedEmail,
        otp,
        expiresInMinutes: otpService.getOTPExpiryMinutes()
      })

      if (!emailResult.success) {
        logDetailedError(new Error(`Failed to send password reset email: ${emailResult.error}`), { path: c.req.path, method: c.req.method })
      }
    }

    await auditLog('PASSWORD_RESET_REQUESTED', 'User', normalizedEmail, {
      email: normalizedEmail,
      ip: clientIP
    })

    // Return same response regardless of whether user exists
    return c.json({
      success: true,
      data: {
        message: 'If an account exists with this email, you will receive a reset code.',
        expiresAt: expiresAt.toISOString(),
        resendCooldown: otpService.getResendCooldown()
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to process request'
      }
    }, 500)
  }
})

// POST /api/v1/auth/reset-password - Verify OTP and set new password
app.post('/reset-password', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email, otp, newPassword } = resetPasswordSchema.parse(body)
    const normalizedEmail = sanitizeEmail(email) || email.toLowerCase()
    const clientIP = getClientIP(c)

    // Verify OTP
    const verifyResult = await otpService.verifyPasswordResetOTP(normalizedEmail, otp)

    if (!verifyResult.valid) {
      await auditLog('PASSWORD_RESET_OTP_FAILED', 'User', normalizedEmail, {
        email: normalizedEmail,
        ip: clientIP,
        error: verifyResult.error,
        attemptsRemaining: verifyResult.attemptsRemaining
      }, undefined, clientIP)

      return c.json({
        error: {
          code: 'InvalidOTP',
          message: verifyResult.error || 'Invalid or expired OTP code',
          attemptsRemaining: verifyResult.attemptsRemaining
        }
      }, 400)
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (!user) {
      await otpService.invalidatePasswordReset(normalizedEmail)
      return c.json({
        error: {
          code: 'UserNotFound',
          message: 'No account found with this email'
        }
      }, 404)
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12)

    // Update password in transaction
    await prisma.$transaction(async (tx) => {
      // Update user password
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash: newPasswordHash }
      })

      // Update or create Better Auth credential account for login compatibility
      // This handles users who registered via OAuth and never had a credential account
      await tx.account.upsert({
        where: {
          userId_providerId: {
            userId: user.id,
            providerId: 'credential'
          }
        },
        update: { password: newPasswordHash },
        create: {
          id: `credential_${user.id}`,
          userId: user.id,
          accountId: user.id,
          providerId: 'credential',
          password: newPasswordHash
        }
      })
    })

    // Clean up
    await otpService.invalidatePasswordReset(normalizedEmail)

    await auditLog('PASSWORD_RESET_SUCCESS', 'User', user.id, {
      email: normalizedEmail,
      ip: clientIP
    }, user.id)

    return c.json({
      success: true,
      data: {
        message: 'Password has been reset successfully. You can now login with your new password.'
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to reset password'
      }
    }, 500)
  }
})

// POST /api/v1/auth/forgot-password/resend - Resend password reset OTP
app.post('/forgot-password/resend', async (c: Context) => {
  try {
    const body = await c.req.json()
    const { email } = resendOTPSchema.parse(body)
    const normalizedEmail = sanitizeEmail(email) || email.toLowerCase()
    const clientIP = getClientIP(c)

    const resendResult = await otpService.resendPasswordResetOTP(normalizedEmail)

    if (!resendResult.success) {
      const resendCheck = await otpService.checkPasswordResetResendAllowed(normalizedEmail)
      
      if (resendCheck.cooldownRemaining) {
        return c.json({
          error: {
            code: 'CooldownActive',
            message: resendResult.error,
            retryAfter: resendCheck.cooldownRemaining
          }
        }, 429)
      }

      return c.json({
        error: {
          code: 'ResendFailed',
          message: resendResult.error || 'Failed to resend OTP'
        }
      }, 400)
    }

    // Check if user exists before sending email
    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail }
    })

    if (user) {
      const emailResult = await emailService.sendPasswordResetEmail({
        to: normalizedEmail,
        otp: resendResult.otp!,
        expiresInMinutes: otpService.getOTPExpiryMinutes()
      })

      if (!emailResult.success) {
        logDetailedError(new Error(`Failed to send password reset email: ${emailResult.error}`), { path: c.req.path, method: c.req.method })
      }
    }

    await auditLog('PASSWORD_RESET_OTP_RESENT', 'User', normalizedEmail, {
      email: normalizedEmail,
      resendsRemaining: resendResult.resendsRemaining
    })

    return c.json({
      success: true,
      data: {
        message: 'OTP resent',
        expiresAt: resendResult.expiresAt!.toISOString(),
        resendCooldown: otpService.getResendCooldown(),
        resendsRemaining: resendResult.resendsRemaining
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return handleValidationError(error, c)
    }

    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to resend OTP'
      }
    }, 500)
  }
})

// POST /api/v1/auth/logout
app.post('/logout', async (c: Context) => {
  // In a stateless JWT setup, logout is handled client-side
  // But we can still audit the logout attempt
  
  if (c.user) {
    await auditLog('LOGOUT', 'User', c.user.id, {
      email: c.user.email
    }, c.user.id)
  }
  
  return c.json({
    success: true,
    message: 'Logged out successfully'
  })
})

// POST /api/v1/auth/change-password
app.post('/change-password', async (c: Context) => {
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
    const { currentPassword, newPassword } = changePasswordSchema.parse(body)
    
    // Get user with password
    const user = await prisma.user.findUnique({
      where: { id: c.user.id }
    })
    
    if (!user) {
      return c.json({
        error: {
          code: 'UserNotFound',
          message: 'User not found'
        }
      }, 404)
    }
    
    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash)
    if (!isValidPassword) {
      return c.json({
        error: {
          code: 'InvalidCurrentPassword',
          message: 'Current password is incorrect'
        }
      }, 400)
    }
    
    // Hash new password
    const newPasswordHash = await bcrypt.hash(newPassword, 12)
    
    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: newPasswordHash }
    })
    
    // Audit log
    await auditLog('PASSWORD_CHANGED', 'User', user.id, {
      email: user.email
    }, user.id)
    
    return c.json({
      success: true,
      message: 'Password changed successfully'
    })
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

// GET /api/v1/auth/me
app.get('/me', async (c: Context) => {
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
    include: { subscription: true }
  })

  if (!user) {
    return c.json({
      error: {
        code: 'UserNotFound',
        message: 'User not found'
      }
    }, 404)
  }

  // Count connected WhatsApp accounts for this user
  const whatsappAccountCount = await prisma.whatsAppAccount.count({
    where: { userId: user.id, connectionStatus: 'connected' }
  })

  return c.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      lastLoginAt: user.lastLoginAt,
      emailVerified: user.emailVerified,
      whatsappAccountCount,
      hasConnectedWhatsApp: whatsappAccountCount > 0,
      subscription: user.subscription ? {
        tier: user.subscription.tier,
        status: user.subscription.status,
        endDate: user.subscription.endDate
      } : {
        tier: 'FREE',
        status: 'ACTIVE',
        endDate: null
      }
    }
  })
})

export default app
