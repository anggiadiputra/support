import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// GET /api/v1/crm/custom-fields - List definitions
app.get('/custom-fields', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)

        const effectiveUserId = getEffectiveUserId(c)
        const fields = await prisma.customFieldDefinition.findMany({
            where: { userId: effectiveUserId },
            orderBy: { order: 'asc' }
        })

        return c.json({ success: true, data: fields })
    } catch (error) {
        console.error('List custom fields error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch custom fields' } }, 500)
    }
})

// POST /api/v1/crm/custom-fields - Create definition
app.post('/custom-fields', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)

        const body = await c.req.json()
        const { name, key, type, description, options, required, order } = body

        const effectiveUserId = getEffectiveUserId(c)
        const field = await prisma.customFieldDefinition.create({
            data: {
                userId: effectiveUserId,
                name,
                key,
                type,
                description,
                options,
                required: required || false,
                order: order || 0
            }
        })

        await auditLog('CUSTOM_FIELD_CREATED', 'CustomField', field.id, { name, key }, c.user.id)

        return c.json({ success: true, data: field })
    } catch (error) {
        console.error('Create custom field error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to create custom field' } }, 500)
    }
})

// PUT /api/v1/crm/custom-fields/:id - Update definition
app.put('/custom-fields/:id', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const id = c.req.param('id')
        const body = await c.req.json()
        const { name, description, options, required, order } = body

        const effectiveUserId = getEffectiveUserId(c)
        const field = await prisma.customFieldDefinition.update({
            where: { id, userId: effectiveUserId },
            data: { name, description, options, required, order }
        })

        return c.json({ success: true, data: field })
    } catch (error) {
        console.error('Update custom field error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to update custom field' } }, 500)
    }
})

// DELETE /api/v1/crm/custom-fields/:id - Delete definition
app.delete('/custom-fields/:id', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const id = c.req.param('id')

        const effectiveUserId = getEffectiveUserId(c)
        await prisma.customFieldDefinition.delete({
            where: { id, userId: effectiveUserId }
        })

        await auditLog('CUSTOM_FIELD_DELETED', 'CustomField', id, {}, c.user.id)

        return c.json({ success: true, message: 'Custom field deleted' })
    } catch (error) {
        console.error('Delete custom field error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete custom field' } }, 500)
    }
})

export default app
