import { z } from 'zod'

// Phone number validation (E.164 format)
export const phoneNumberSchema = z.string()
  .regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format. Must be in E.164 format')

/**
 * Normalize phone number for consistent storage and comparison
 * Removes + prefix, spaces, dashes, and other non-digit characters
 * Examples:
 * - +6281234567890 -> 6281234567890
 * - 6281234567890 -> 6281234567890
 * - +62 812 3456 7890 -> 6281234567890
 *
 * BSUID guard: preserves BSUID format (e.g., US.13491208655302741918 or
 * US.ENT.11815...) unchanged. BSUIDs are NOT phone numbers and must not be
 * stripped of their country prefix and dot separator.
 * Reference: docs/bsuid.md
 */
export function normalizePhoneNumber(phone: string | null | undefined): string {
  if (!phone) return ''
  if (/^[A-Z]{2}\.(ENT\.)?[a-zA-Z0-9]{1,128}$/.test(phone)) {
    return phone
  }
  return phone.replace(/[^\d]/g, '')
}

// Email validation
export const emailSchema = z.string()
  .email('Invalid email address')
  .max(255, 'Email too long')

// Message schemas
export const sendMessageSchema = z.object({
  userId: z.string().min(1, 'User ID required'),
  phoneNumber: phoneNumberSchema.optional(),
  customerId: z.string().optional(),
  type: z.enum(['text', 'template', 'image', 'document', 'audio', 'video']),
  text: z.object({
    body: z.string().min(1).max(4096, 'Message too long (max 4096 characters)'),
    preview_url: z.boolean().optional()
  }).optional(),
  template: z.object({
    name: z.string().min(1).max(512),
    language: z.object({
      code: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/, 'Invalid language code')
    }),
    components: z.array(z.any()).optional()
  }).optional(),
  image: z.object({
    link: z.string().url().optional(),
    id: z.string().optional(),
    caption: z.string().max(1024).optional()
  }).optional(),
  document: z.object({
    link: z.string().url().optional(),
    id: z.string().optional(),
    caption: z.string().max(1024).optional(),
    filename: z.string().max(255).optional()
  }).optional()
}).refine(
  data => data.phoneNumber || data.customerId,
  { message: 'Either phoneNumber or customerId must be provided' }
)

// Template schemas
export const createTemplateSchema = z.object({
  userId: z.string().min(1),
  templateName: z.string()
    .min(1, 'Template name required')
    .max(512, 'Template name too long')
    .regex(/^[a-z0-9_]+$/, 'Template name must be lowercase alphanumeric with underscores only'),
  category: z.enum(['MARKETING', 'UTILITY', 'AUTHENTICATION']),
  language: z.string().regex(/^[a-z]{2}_[A-Z]{2}$/, 'Invalid language code'),
  components: z.array(z.object({
    type: z.string(),
    format: z.string().optional(),
    text: z.string().optional(),
    buttons: z.array(z.any()).optional(),
    example: z.any().optional()
  })).min(1, 'At least one component required')
})

// Customer schemas
export const createCustomerSchema = z.object({
  userId: z.string().min(1),
  phoneNumber: phoneNumberSchema,
  name: z.string().max(255).optional(),
  email: emailSchema.optional(),
  consentStatus: z.boolean().default(false),
  isBlacklisted: z.boolean().default(false)
})

export const updateCustomerSchema = z.object({
  name: z.string().max(255).optional(),
  email: emailSchema.optional(),
  consentStatus: z.boolean().optional(),
  isBlacklisted: z.boolean().optional()
})

// Business Account schemas
export const createBusinessAccountSchema = z.object({
  name: z.string().min(1).max(255),
  wabaId: z.string().min(1),
  phoneNumberId: z.string().min(1),
  country: z.string().length(2).optional(),
  currency: z.string().length(3).optional()
})

// Media upload validation
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
export const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/3gpp']
export const ALLOWED_AUDIO_TYPES = ['audio/ogg', 'audio/mpeg', 'audio/amr']

export const MAX_FILE_SIZE = 16 * 1024 * 1024 // 16MB

export function validateFileType(mimeType: string, type: 'image' | 'document' | 'video' | 'audio'): boolean {
  switch (type) {
    case 'image':
      return ALLOWED_IMAGE_TYPES.includes(mimeType)
    case 'document':
      return ALLOWED_DOCUMENT_TYPES.includes(mimeType)
    case 'video':
      return ALLOWED_VIDEO_TYPES.includes(mimeType)
    case 'audio':
      return ALLOWED_AUDIO_TYPES.includes(mimeType)
    default:
      return false
  }
}

// Validation middleware helper
export function validate<T>(schema: z.ZodSchema<T>) {
  return async (data: unknown): Promise<{ success: true; data: T } | { success: false; error: string }> => {
    try {
      const validated = await schema.parseAsync(data)
      return { success: true, data: validated }
    } catch (error) {
      if (error instanceof z.ZodError) {
        const messages = error.issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`).join(', ')
        return { success: false, error: messages }
      }
      return { success: false, error: 'Validation failed' }
    }
  }
}
