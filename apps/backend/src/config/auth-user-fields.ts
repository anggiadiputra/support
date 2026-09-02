export const serverManagedUserFields = {
  role: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: 'BUSINESS_OWNER',
  },
  subscriptionTier: {
    type: 'string',
    required: false,
    input: false,
    defaultValue: 'FREE',
  },
} as const
