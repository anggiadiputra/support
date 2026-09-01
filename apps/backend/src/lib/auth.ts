import { betterAuth } from "better-auth"
import { createAuthMiddleware } from "better-auth/api"
import { prismaAdapter } from "better-auth/adapters/prisma"
import bcrypt from "bcryptjs"
import { emailService } from "../services/email/EmailService.js"
import { affiliateService } from "../services/affiliate-service.js"
import { verifySignedReferralToken } from "../routes/affiliate.js"
import { prisma } from "../utils/database.js"
import { logger } from "../utils/logger.js"

// Helper to check if user was just created (within last 60 seconds)
function isNewUser(createdAt: Date | string | null | undefined): boolean {
  if (!createdAt) return false
  const created = new Date(createdAt)
  const now = new Date()
  const diffMs = now.getTime() - created.getTime()
  // Increased to 60 seconds to account for OAuth flow delays
  return diffMs < 60000 // 60 seconds threshold
}

// Track users who have received welcome email to prevent duplicates
const welcomeEmailSent = new Set<string>()

// Helper to create audit log
async function createAuditLog(
  action: string,
  entityType: string,
  entityId: string,
  details?: Record<string, unknown>,
  userId?: string,
  ipAddress?: string
) {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        details: details ? JSON.stringify(details) : undefined,
        userId,
        ipAddress
      }
    })
  } catch (error) {
    logger.error('Failed to create audit log', {
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql"
  }),
  
  // Database hooks for detecting new user creation
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // email is auto-masked by the serializer (PII_EMAIL_KEYS).
          logger.info('[Database Hook] New user created', { userId: user.id, email: user.email })
          
          // Create FREE subscription for new OAuth users
          try {
            const existingSubscription = await prisma.subscription.findUnique({
              where: { userId: user.id }
            })
            
            if (!existingSubscription) {
              await prisma.subscription.create({
                data: {
                  userId: user.id,
                  tier: 'FREE',
                  status: 'ACTIVE',
                  startDate: new Date(),
                  endDate: null, // FREE plan has no expiry
                  autoRenewEnabled: false
                }
              })
              logger.info('[Database Hook] FREE subscription created', { userId: user.id, email: user.email })
            }
          } catch (error) {
            logger.error('[Database Hook] Failed to create subscription', {
              userId: user.id,
              error: error instanceof Error ? error.message : String(error),
            })
          }
          
          // NOTE: Referral tracking for OAuth users (Google) is handled in the 
          // hooks.after middleware, which has access to the request context (cookies).
          // The referral code is read from the 'referral_code' cookie set by /ref/[code] page.
          
          // Check if this user was created via OAuth by checking accounts
          // We'll send welcome email here for all new users
          // The hook is called after user is created in database
          
          // Prevent duplicate emails using the Set
          if (!welcomeEmailSent.has(user.id)) {
            welcomeEmailSent.add(user.id)
            
            logger.info('[Database Hook] Sending welcome email', { userId: user.id, email: user.email })
            emailService.sendWelcomeEmail({
              to: user.email,
              userName: user.name || 'Pengguna',
            }).then(() => {
              logger.info('[Database Hook] Welcome email sent successfully', { userId: user.id, email: user.email })
              // Clean up after 5 minutes
              setTimeout(() => welcomeEmailSent.delete(user.id), 5 * 60 * 1000)
            }).catch((error) => {
              logger.error('[Database Hook] Failed to send welcome email', {
                userId: user.id,
                error: error instanceof Error ? error.message : String(error),
              })
              welcomeEmailSent.delete(user.id) // Allow retry on failure
            })
          }
        }
      }
    }
  },
  baseURL: process.env.BETTER_AUTH_URL || "http://localhost:3005",
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true, // Auto sign in after registration
    sendResetPasswordEmail: undefined, // Disable password reset
    // Use bcrypt for password hashing (compatible with OTP registration flow)
    password: {
      hash: async (password) => {
        return await bcrypt.hash(password, 12)
      },
      verify: async ({ hash, password }) => {
        return await bcrypt.compare(password, hash)
      }
    }
  },

  // Google OAuth Provider
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      // Enable account linking - allow linking Google to existing email/password accounts
      enabled: true,
    },
  },

  // Account linking configuration
  account: {
    accountLinking: {
      enabled: true, // Allow linking OAuth accounts to existing users
      trustedProviders: ["google"], // Trust Google for auto-linking
      // Backwards-compat for existing users with emailVerified=false in DB.
      // Better Auth 1.6.11 introduced a new default of `true` that would
      // refuse account-linking for such users (CVE-2026-53516 hardening).
      // We keep existing behavior to avoid breaking users who signed up
      // pre-OTP-verification. TODO: backfill emailVerified=true and remove.
      requireLocalEmailVerified: false,
    },
  },

  // Registration is now ENABLED
  // onRequest hook removed to allow sign-up
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 24 hours
    cookieCache: {
      enabled: false,
      maxAge: 60 * 60 * 24 * 7,
    }
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "BUSINESS_OWNER",
      },
      subscriptionTier: {
        type: "string",
        required: false,
        defaultValue: "FREE",
      },
      // NOTE: whatsappAccountCount dan hasConnectedWhatsApp adalah computed fields
      // yang dihitung dari relasi whatsappAccounts, bukan disimpan di database
    },
  },
  trustedOrigins: process.env.CORS_ALLOWED_ORIGINS
    ? process.env.CORS_ALLOWED_ORIGINS.split(",").map(origin => origin.trim())
    : [
        "http://localhost:3000",
        "http://localhost:3001",
        "https://kirim.chat",
        "https://api.kirim.chat"
      ],
  advanced: {
    crossSubDomainCookies: {
      enabled: true,  // Always enable for cross-subdomain support
      domain: process.env.NODE_ENV === 'production' ? process.env.COOKIE_DOMAIN : undefined
    },
    // Use secure cookies in production
    useSecureCookies: process.env.NODE_ENV === 'production',
  },
  
  // Hooks for audit logging
  hooks: {
    after: createAuthMiddleware(async (ctx) => {
      const ip = ctx.headers?.get('x-forwarded-for')?.split(',')[0]?.trim()
        || ctx.headers?.get('x-real-ip')
        || 'unknown'
      
      // Debug logging for all paths with sessions — email is masked by the
      // serializer (PII_EMAIL_KEYS) but we still gate at debug level.
      if (ctx.context.newSession) {
        logger.debug('[Auth Hook]', {
          path: ctx.path,
          userId: ctx.context.newSession.user?.id,
          email: ctx.context.newSession.user?.email,
        })
      }
      
      // Log successful sign-in
      if (ctx.path === "/sign-in/email" && ctx.context.newSession) {
        const user = ctx.context.newSession.user
        await createAuditLog(
          'LOGIN_SUCCESS',
          'User',
          user.id,
          { email: user.email, provider: 'email' },
          user.id,
          ip
        )
      }
      
      // Log successful sign-up (welcome email is sent via databaseHooks)
      if (ctx.path === "/sign-up/email" && ctx.context.newSession) {
        const user = ctx.context.newSession.user
        await createAuditLog(
          'USER_REGISTERED',
          'User',
          user.id,
          { email: user.email, provider: 'email' },
          user.id,
          ip
        )
      }
      
      // Log Google OAuth sign-in/sign-up (welcome email for new users is sent via databaseHooks)
      const isGoogleCallback = ctx.path?.includes('google') || ctx.path?.includes('callback')
      if (isGoogleCallback && ctx.context.newSession) {
        const user = ctx.context.newSession.user
        const isFirstTimeUser = isNewUser(user.createdAt)
        
        logger.info('[Google OAuth]', {
          path: ctx.path,
          userId: user.id,
          email: user.email, // masked by serializer
          isNewUser: isFirstTimeUser,
          createdAt: user.createdAt,
        })

        // Track referral for new Google OAuth users
        if (isFirstTimeUser) {
          // Try to get signed referral token from cookie
          const cookieHeader = ctx.headers?.get('cookie') || ''
          const referralTokenMatch = cookieHeader.match(/referral_token=([^;]+)/)
          const signedToken = referralTokenMatch ? decodeURIComponent(referralTokenMatch[1]) : null

          logger.debug('[Google OAuth] Signed referral token presence', {
            hasToken: !!signedToken,
          })

          if (signedToken) {
            // Verify the signed token to prevent manipulation
            const referralCode = verifySignedReferralToken(signedToken)

            if (referralCode) {
              try {
                await affiliateService.trackReferral(referralCode, user.id)
                logger.info('[Google OAuth] Referral tracked', { userId: user.id, referralCode })

                await createAuditLog(
                  'REFERRAL_TRACKED',
                  'Referral',
                  user.id,
                  { referralCode, provider: 'google' },
                  user.id,
                  ip
                )
              } catch (refError) {
                logger.error('[Google OAuth] Failed to track referral', {
                  error: refError instanceof Error ? refError.message : String(refError),
                })
              }
            } else {
              logger.warn('[Google OAuth] Invalid or expired referral token')
            }
          }
        }
        
        await createAuditLog(
          isFirstTimeUser ? 'USER_REGISTERED' : 'LOGIN_SUCCESS',
          'User',
          user.id,
          { email: user.email, provider: 'google', isNewUser: isFirstTimeUser },
          user.id,
          ip
        )
      }
      
      // Log failed sign-in (check if returned has error)
      if (ctx.path === "/sign-in/email" && !ctx.context.newSession) {
        const body = ctx.body as { email?: string } | undefined
        const email = body?.email || 'unknown'
        await createAuditLog(
          'LOGIN_FAILED',
          'User',
          email,
          { email, reason: 'Invalid credentials or account not found', provider: 'email' },
          undefined,
          ip
        )
      }
      
      // Log sign-out
      if (ctx.path === "/sign-out") {
        const session = ctx.context.session
        if (session?.user) {
          await createAuditLog(
            'LOGOUT',
            'User',
            session.user.id,
            { email: session.user.email },
            session.user.id,
            ip
          )
        }
      }
    }),
  },
})
