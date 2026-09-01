import { z } from "zod"

// WhatsApp Template Button Schema
export const templateButtonSchema = z.object({
  type: z.union([
    z.literal("URL"),
    z.literal("PHONE_NUMBER"),
    z.literal("QUICK_REPLY"),
    z.literal("COPY_CODE"),
    z.literal("OTP"),
  ]),
  text: z.string(),
  url: z.string().optional().nullable(),
  phone_number: z.string().optional().nullable(),
  example: z.array(z.string()).optional().nullable(), // For dynamic URL suffix
})

// WhatsApp Template Component Schema
export const templateComponentSchema = z.object({
  type: z.union([
    z.literal("HEADER"),
    z.literal("BODY"),
    z.literal("FOOTER"),
    z.literal("BUTTONS"),
  ]),
  format: z.union([
    z.literal("TEXT"),
    z.literal("IMAGE"),
    z.literal("VIDEO"),
    z.literal("DOCUMENT"),
  ]).optional().nullable(),
  text: z.string().optional().nullable(),
  example: z.object({
    header_text: z.array(z.string()).optional(),
    body_text: z.array(z.array(z.string())).optional(),
    header_handle: z.array(z.string()).optional(),
  }).optional().nullable(),
  buttons: z.array(templateButtonSchema).optional().nullable(),
})

// WhatsApp Message Template Schema
export const templateSchema = z.object({
  id: z.string(),
  templateName: z.string(), // Matches Prisma: templateName
  category: z.union([
    z.literal("MARKETING"),
    z.literal("UTILITY"),
    z.literal("AUTHENTICATION"),
  ]),
  language: z.string(), // e.g., "en_US", "id" (Indonesian uses "id" without locale)
  status: z.union([
    z.literal("APPROVED"),
    z.literal("PENDING"),
    z.literal("REJECTED"),
  ]),
  content: z.string(), // Body text
  headerType: z
    .union([
      z.literal("TEXT"),
      z.literal("IMAGE"),
      z.literal("VIDEO"),
      z.literal("DOCUMENT"),
      z.null(),
    ])
    .optional()
    .nullable(),
  headerContent: z.string().optional().nullable(),
  footerText: z.string().optional().nullable(),
  metaTemplateId: z.string().optional().nullable(),
  quality: z
    .union([z.literal("HIGH"), z.literal("MEDIUM"), z.literal("LOW"), z.null()])
    .optional()
    .nullable(),
  buttons: z.array(templateButtonSchema).optional().nullable(),
  // Components from WhatsApp API (for variable parsing)
  components: z.array(templateComponentSchema).optional().nullable(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date().optional(),
})

export type Template = z.infer<typeof templateSchema>
export type TemplateComponent = z.infer<typeof templateComponentSchema>
export type TemplateButton = z.infer<typeof templateButtonSchema>

export const templateListSchema = z.array(templateSchema)

/**
 * Count variables in a template
 * Variables are in format {{1}}, {{2}}, etc.
 */
export function countTemplateVariables(template: Template): number {
  let count = 0
  const variableRegex = /\{\{(\d+)\}\}/g

  // Count in body content
  if (template.content) {
    const matches = template.content.match(variableRegex)
    if (matches) count += matches.length
  }

  // Count in header content (if text type)
  if (template.headerType === "TEXT" && template.headerContent) {
    const matches = template.headerContent.match(variableRegex)
    if (matches) count += matches.length
  }

  // Count media header as 1 variable if present
  if (template.headerType && ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType)) {
    count += 1
  }

  // Count in components if available
  if (template.components) {
    for (const component of template.components) {
      if (component.type === "BUTTONS" && component.buttons) {
        for (const button of component.buttons) {
          // Dynamic URL buttons have variables
          if (button.type === "URL" && button.example && button.example.length > 0) {
            count += button.example.length
          }
        }
      }
    }
  }

  return count
}

/**
 * Check if template has dynamic URL buttons
 */
export function hasDynamicUrl(template: Template): boolean {
  if (!template.components) return false

  for (const component of template.components) {
    if (component.type === "BUTTONS" && component.buttons) {
      for (const button of component.buttons) {
        if (button.type === "URL" && button.example && button.example.length > 0) {
          return true
        }
      }
    }
  }

  return false
}
