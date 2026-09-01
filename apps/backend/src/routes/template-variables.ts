/**
 * Template Variable Management Routes
 * 
 * API endpoints for managing template variables (CRUD operations).
 * Variables are user-defined placeholders that can be mapped to template positions.
 * 
 * Base Path: /api/v1/template-variables
 * 
 * Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */

import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { templateVariableService, TEMPLATE_VARIABLE_ERRORS } from '../services/template-variable-service.js'
import { resolveContext, getEffectiveUserId } from '../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../middleware/errorHandler.js'

const app = new Hono()

// Apply context resolution middleware to all routes
// This ensures agents can access their business owner's variables
app.use('*', resolveContext)

/**
 * Validation schemas
 */
// Valid variable types
const VALID_VARIABLE_TYPES = ['TEXT', 'URL', 'CURRENCY', 'DATE', 'IMAGE', 'VIDEO', 'DOCUMENT'] as const

const createVariableSchema = z.object({
  name: z.string()
    .min(1, 'Variable name is required')
    .max(100, 'Variable name must be 100 characters or less')
    .trim(),
  type: z.enum(VALID_VARIABLE_TYPES, {
    message: 'Invalid variable type. Must be one of: TEXT, URL, CURRENCY, DATE, IMAGE, VIDEO, DOCUMENT'
  }),
  description: z.string()
    .max(500, 'Description must be 500 characters or less')
    .optional(),
  exampleValue: z.string()
    .max(500, 'Example value must be 500 characters or less')
    .optional()
})

const updateVariableSchema = z.object({
  name: z.string()
    .min(1, 'Variable name is required')
    .max(100, 'Variable name must be 100 characters or less')
    .trim()
    .optional(),
  type: z.enum(VALID_VARIABLE_TYPES, {
    message: 'Invalid variable type. Must be one of: TEXT, URL, CURRENCY, DATE, IMAGE, VIDEO, DOCUMENT'
  }).optional(),
  description: z.string()
    .max(500, 'Description must be 500 characters or less')
    .nullable()
    .optional(),
  exampleValue: z.string()
    .max(500, 'Example value must be 500 characters or less')
    .nullable()
    .optional()
})

// Valid component types for template mappings
const VALID_COMPONENT_TYPES = ['header', 'body', 'footer', 'button'] as const

const mappingItemSchema = z.object({
  componentType: z.enum(VALID_COMPONENT_TYPES, {
    message: 'Invalid component type. Must be one of: header, body, footer, button'
  }),
  componentIndex: z.number()
    .int('Component index must be an integer')
    .min(0, 'Component index must be 0 or greater'),
  parameterIndex: z.number()
    .int('Parameter index must be an integer')
    .min(0, 'Parameter index must be 0 or greater'),
  variableId: z.string()
    .min(1, 'Variable ID is required')
})

const createMappingsSchema = z.object({
  templateName: z.string()
    .min(1, 'Template name is required')
    .max(512, 'Template name must be 512 characters or less')
    .trim(),
  mappings: z.array(mappingItemSchema)
    .min(1, 'At least one mapping is required')
})

// ============================================
// Variable Mapping Routes (Requirements: 9.6)
// Note: These routes must be defined BEFORE /:id routes to avoid conflicts
// ============================================

/**
 * GET /api/v1/template-variables/mappings/:templateName
 * Get all variable mappings for a specific template
 * 
 * Returns mappings with full variable details, ordered by component position
 * 
 * Requirements: 9.6
 */
app.get('/mappings/:templateName', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const templateName = decodeURIComponent(c.req.param('templateName'))
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    if (!templateName) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Template name is required'
        }
      }, 400)
    }

    const mappings = await templateVariableService.getMappings(userId, templateName)

    return c.json({
      success: true,
      data: mappings
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch template mappings'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/template-variables/mappings
 * Create or update variable mappings for a template
 * 
 * This replaces all existing mappings for the template with the new ones.
 * 
 * Body:
 * - templateName: string (required) - WhatsApp template name
 * - mappings: array (required) - Array of mapping objects:
 *   - componentType: string - "header", "body", "footer", "button"
 *   - componentIndex: number - Index of component (for multiple buttons)
 *   - parameterIndex: number - Position in component ({{1}}, {{2}})
 *   - variableId: string - ID of the variable from library
 * 
 * Requirements: 9.6
 */
app.post('/mappings', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validation = createMappingsSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const { templateName, mappings } = validation.data

    // Check for duplicate positions in the request
    const positionKeys = new Set<string>()
    for (const mapping of mappings) {
      const key = `${mapping.componentType}-${mapping.componentIndex}-${mapping.parameterIndex}`
      if (positionKeys.has(key)) {
        return c.json({
          error: {
            code: 'ValidationError',
            message: `Duplicate mapping position: ${mapping.componentType}[${mapping.componentIndex}] parameter ${mapping.parameterIndex}`
          }
        }, 400)
      }
      positionKeys.add(key)
    }

    const createdMappings = await templateVariableService.saveMappings(
      userId,
      templateName,
      mappings
    )

    return c.json({
      success: true,
      data: createdMappings
    }, 201)
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    // Handle known errors
    if (error instanceof Error) {
      if (error.message === TEMPLATE_VARIABLE_ERRORS.VARIABLE_NOT_FOUND) {
        return c.json({
          error: {
            code: 'NotFound',
            message: 'One or more variables not found'
          }
        }, 404)
      }
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to create template mappings'
      }
    }, 500)
  }
})

/**
 * DELETE /api/v1/template-variables/mappings/:templateName
 * Delete all variable mappings for a specific template
 * 
 * Requirements: 9.6
 */
app.delete('/mappings/:templateName', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const templateName = decodeURIComponent(c.req.param('templateName'))
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    if (!templateName) {
      return c.json({
        error: {
          code: 'ValidationError',
          message: 'Template name is required'
        }
      }, 400)
    }

    await templateVariableService.deleteMappings(userId, templateName)

    return c.json({
      success: true,
      message: 'Mappings deleted successfully'
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to delete template mappings'
      }
    }, 500)
  }
})

// ============================================
// Variable CRUD Routes (Requirements: 8.x)
// ============================================

/**
 * GET /api/v1/template-variables
 * List all template variables for the user
 * 
 * Returns variables sorted by usage count (desc) and name (asc)
 * 
 * Requirements: 8.2, 8.5
 */
app.get('/', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const variables = await templateVariableService.getVariables(userId)

    return c.json({
      success: true,
      data: variables
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch template variables'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/template-variables/:id
 * Get a single template variable by ID
 * 
 * Requirements: 8.2
 */
app.get('/:id', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const variableId = c.req.param('id')
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const variable = await templateVariableService.getVariableById(variableId, userId)

    if (!variable) {
      return c.json({
        error: {
          code: 'NotFound',
          message: TEMPLATE_VARIABLE_ERRORS.VARIABLE_NOT_FOUND
        }
      }, 404)
    }

    return c.json({
      success: true,
      data: variable
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch template variable'
      }
    }, 500)
  }
})

/**
 * GET /api/v1/template-variables/:id/usage
 * Get variable usage information (which templates use it)
 * 
 * Requirements: 8.7
 */
app.get('/:id/usage', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const variableId = c.req.param('id')
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    const variable = await templateVariableService.getVariableWithUsage(variableId, userId)

    if (!variable) {
      return c.json({
        error: {
          code: 'NotFound',
          message: TEMPLATE_VARIABLE_ERRORS.VARIABLE_NOT_FOUND
        }
      }, 404)
    }

    // Extract unique template names
    const templates = variable.templateMappings?.map(m => m.templateName) || []

    return c.json({
      success: true,
      data: {
        usageCount: variable.usageCount,
        templates
      }
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })
    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to fetch variable usage'
      }
    }, 500)
  }
})

/**
 * POST /api/v1/template-variables
 * Create a new template variable
 * 
 * Body:
 * - name: string (required) - User-defined name like "Nama Customer", "Link Tracking"
 * - type: VariableType (required) - TEXT, URL, CURRENCY, DATE, IMAGE, VIDEO, DOCUMENT
 * - description: string (optional) - Description of the variable
 * - exampleValue: string (optional) - Example value for the variable
 * 
 * Requirements: 8.3, 8.4
 */
app.post('/', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validation = createVariableSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    const variable = await templateVariableService.createVariable(userId, validation.data)

    return c.json({
      success: true,
      data: variable
    }, 201)
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    // Handle known errors
    if (error instanceof Error) {
      if (error.message === TEMPLATE_VARIABLE_ERRORS.VARIABLE_NAME_EXISTS) {
        return c.json({
          error: {
            code: 'Conflict',
            message: error.message
          }
        }, 409)
      }
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to create template variable'
      }
    }, 500)
  }
})

/**
 * PUT /api/v1/template-variables/:id
 * Update an existing template variable
 * 
 * Body (all optional):
 * - name: string - New name for the variable
 * - type: VariableType - New type
 * - description: string | null - New description
 * - exampleValue: string | null - New example value
 * 
 * Requirements: 8.6
 */
app.put('/:id', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const variableId = c.req.param('id')
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    // Parse and validate request body
    const body = await c.req.json()
    const validation = updateVariableSchema.safeParse(body)

    if (!validation.success) {
      return handleValidationError(validation.error, c)
    }

    // Convert null values to undefined for the service
    const updateData = {
      ...validation.data,
      description: validation.data.description ?? undefined,
      exampleValue: validation.data.exampleValue ?? undefined
    }

    const variable = await templateVariableService.updateVariable(variableId, userId, updateData)

    return c.json({
      success: true,
      data: variable
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    // Handle known errors
    if (error instanceof Error) {
      if (error.message === TEMPLATE_VARIABLE_ERRORS.VARIABLE_NOT_FOUND) {
        return c.json({
          error: {
            code: 'NotFound',
            message: error.message
          }
        }, 404)
      }
      if (error.message === TEMPLATE_VARIABLE_ERRORS.VARIABLE_NAME_EXISTS) {
        return c.json({
          error: {
            code: 'Conflict',
            message: error.message
          }
        }, 409)
      }
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to update template variable'
      }
    }, 500)
  }
})

/**
 * DELETE /api/v1/template-variables/:id
 * Delete a template variable
 * 
 * Note: This will also delete all mappings that use this variable (cascade)
 * 
 * Requirements: 8.7
 */
app.delete('/:id', async (c: Context) => {
  try {
    const userId = getEffectiveUserId(c)
    const variableId = c.req.param('id')
    
    if (!userId) {
      return c.json({
        error: {
          code: 'Unauthorized',
          message: 'Authentication required'
        }
      }, 401)
    }

    await templateVariableService.deleteVariable(variableId, userId)

    return c.json({
      success: true,
      message: 'Variable deleted successfully'
    })
  } catch (error) {
    logDetailedError(error, { path: c.req.path, method: c.req.method })

    // Handle known errors
    if (error instanceof Error) {
      if (error.message === TEMPLATE_VARIABLE_ERRORS.VARIABLE_NOT_FOUND) {
        return c.json({
          error: {
            code: 'NotFound',
            message: error.message
          }
        }, 404)
      }
    }

    return c.json({
      error: {
        code: 'InternalServerError',
        message: 'Failed to delete template variable'
      }
    }, 500)
  }
})

export default app
