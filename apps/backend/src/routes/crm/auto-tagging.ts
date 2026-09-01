import { Hono } from 'hono'
import type { Context } from 'hono'
import { AutoTaggingService } from '../../services/auto-tagging-service.js'
import { auditLog } from '../../utils/auditLog.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// Validation helper for create rule
function validateCreateRule(body: any): { valid: boolean; error?: string } {
  if (!body.name || typeof body.name !== 'string' || body.name.length === 0) {
    return { valid: false, error: 'Name is required' }
  }
  if (body.name.length > 100) {
    return { valid: false, error: 'Name must be 100 characters or less' }
  }
  if (!Array.isArray(body.keywords) || body.keywords.length === 0) {
    return { valid: false, error: 'At least one keyword is required' }
  }
  if (!Array.isArray(body.addTags) || body.addTags.length === 0) {
    return { valid: false, error: 'At least one tag is required' }
  }
  if (body.priority !== undefined) {
    const priority = Number(body.priority)
    if (isNaN(priority) || priority < 1 || priority > 100) {
      return { valid: false, error: 'Priority must be between 1 and 100' }
    }
  }
  return { valid: true }
}

// GET /api/v1/crm/auto-tagging/rules - List all rules
app.get('/auto-tagging/rules', resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const effectiveUserId = getEffectiveUserId(c)
    const rules = await AutoTaggingService.getRules(effectiveUserId)

    return c.json({ success: true, data: rules })
  } catch (error) {
    console.error('List auto-tag rules error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch rules' } }, 500)
  }
})

// GET /api/v1/crm/auto-tagging/rules/:id - Get single rule
app.get('/auto-tagging/rules/:id', resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const ruleId = c.req.param('id')
    const effectiveUserId = getEffectiveUserId(c)
    const rule = await AutoTaggingService.getRule(ruleId, effectiveUserId)

    if (!rule) {
      return c.json({ error: { code: 'NotFound', message: 'Rule not found' } }, 404)
    }

    return c.json({ success: true, data: rule })
  } catch (error) {
    console.error('Get auto-tag rule error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch rule' } }, 500)
  }
})

// POST /api/v1/crm/auto-tagging/rules - Create rule
app.post('/auto-tagging/rules', resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const body = await c.req.json()
    const validation = validateCreateRule(body)
    if (!validation.valid) {
      return c.json({ error: { code: 'ValidationError', message: validation.error } }, 400)
    }

    const effectiveUserId = getEffectiveUserId(c)

    const rule = await AutoTaggingService.createRule(effectiveUserId, {
      name: body.name,
      keywords: body.keywords,
      priority: body.priority ?? 10,
      isActive: body.isActive ?? true,
      addTags: body.addTags,
      moveToPipelineStageId: body.moveToPipelineStageId || null,
    })

    await auditLog('AUTO_TAG_RULE_CREATED', 'AutoTagRule', rule.id, {
      name: rule.name,
      keywords: rule.keywords,
      addTags: rule.addTags,
    }, c.user.id)

    return c.json({ success: true, data: rule }, 201)
  } catch (error) {
    console.error('Create auto-tag rule error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to create rule' } }, 500)
  }
})

// PATCH /api/v1/crm/auto-tagging/rules/:id - Update rule
app.patch('/auto-tagging/rules/:id', resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const ruleId = c.req.param('id')
    const body = await c.req.json()
    const effectiveUserId = getEffectiveUserId(c)

    // Validate if fields are provided
    if (body.name !== undefined && (typeof body.name !== 'string' || body.name.length === 0)) {
      return c.json({ error: { code: 'ValidationError', message: 'Name cannot be empty' } }, 400)
    }
    if (body.keywords !== undefined && (!Array.isArray(body.keywords) || body.keywords.length === 0)) {
      return c.json({ error: { code: 'ValidationError', message: 'Keywords array cannot be empty' } }, 400)
    }
    if (body.addTags !== undefined && (!Array.isArray(body.addTags) || body.addTags.length === 0)) {
      return c.json({ error: { code: 'ValidationError', message: 'Tags array cannot be empty' } }, 400)
    }
    if (body.priority !== undefined) {
      const priority = Number(body.priority)
      if (isNaN(priority) || priority < 1 || priority > 100) {
        return c.json({ error: { code: 'ValidationError', message: 'Priority must be between 1 and 100' } }, 400)
      }
    }

    const rule = await AutoTaggingService.updateRule(ruleId, effectiveUserId, body)

    if (!rule) {
      return c.json({ error: { code: 'NotFound', message: 'Rule not found' } }, 404)
    }

    await auditLog('AUTO_TAG_RULE_UPDATED', 'AutoTagRule', rule.id, body, c.user.id)

    return c.json({ success: true, data: rule })
  } catch (error) {
    console.error('Update auto-tag rule error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to update rule' } }, 500)
  }
})

// DELETE /api/v1/crm/auto-tagging/rules/:id - Delete rule
app.delete('/auto-tagging/rules/:id', resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const ruleId = c.req.param('id')
    const effectiveUserId = getEffectiveUserId(c)

    const deleted = await AutoTaggingService.deleteRule(ruleId, effectiveUserId)

    if (!deleted) {
      return c.json({ error: { code: 'NotFound', message: 'Rule not found' } }, 404)
    }

    await auditLog('AUTO_TAG_RULE_DELETED', 'AutoTagRule', ruleId, {}, c.user.id)

    return c.json({ success: true, message: 'Rule deleted' })
  } catch (error) {
    console.error('Delete auto-tag rule error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete rule' } }, 500)
  }
})

// PATCH /api/v1/crm/auto-tagging/rules/:id/toggle - Toggle active status
app.patch('/auto-tagging/rules/:id/toggle', resolveContext, async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const ruleId = c.req.param('id')
    const effectiveUserId = getEffectiveUserId(c)

    const rule = await AutoTaggingService.toggleRule(ruleId, effectiveUserId)

    if (!rule) {
      return c.json({ error: { code: 'NotFound', message: 'Rule not found' } }, 404)
    }

    await auditLog('AUTO_TAG_RULE_TOGGLED', 'AutoTagRule', rule.id, {
      isActive: rule.isActive,
    }, c.user.id)

    return c.json({ success: true, data: rule })
  } catch (error) {
    console.error('Toggle auto-tag rule error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to toggle rule' } }, 500)
  }
})

export default app
