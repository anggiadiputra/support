import { Hono } from 'hono'
import { describe, expect, it, vi } from 'vitest'
import { registerBetterAuthRoutes } from './better-auth-routes.js'

describe('Better Auth route registration', () => {
  it('runs the sign-in limiter before the Better Auth handler', async () => {
    const app = new Hono()
    const authHandler = vi.fn(async () => new Response('auth handler'))
    const limiter = vi.fn(async (c) => c.json({ error: 'rate limited' }, 429))

    registerBetterAuthRoutes(app, authHandler, limiter)

    const response = await app.request('/api/auth/sign-in/email', {
      method: 'POST',
    })

    expect(response.status).toBe(429)
    expect(authHandler).not.toHaveBeenCalled()
    expect(limiter).toHaveBeenCalledOnce()
  })
})
