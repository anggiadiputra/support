import type { Hono, MiddlewareHandler } from 'hono'

export type BetterAuthHandler = (
  request: Request,
) => Response | Promise<Response>

export function registerBetterAuthRoutes(
  app: Hono,
  authHandler: BetterAuthHandler,
  authRateLimiter: MiddlewareHandler,
): void {
  app.use('/api/auth/sign-in/*', authRateLimiter)
  app.use('/api/auth/sign-up/*', authRateLimiter)
  app.all('/api/auth/*', (c) => authHandler(c.req.raw))
}
