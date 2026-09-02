import { describe, expect, it } from 'vitest'
import { serverManagedUserFields } from './auth-user-fields.js'

describe('server-managed Better Auth user fields', () => {
  it('rejects role and subscription tier from public auth input', () => {
    expect(serverManagedUserFields.role).toMatchObject({
      type: 'string',
      input: false,
      defaultValue: 'BUSINESS_OWNER',
    })
    expect(serverManagedUserFields.subscriptionTier).toMatchObject({
      type: 'string',
      input: false,
      defaultValue: 'FREE',
    })
  })
})
