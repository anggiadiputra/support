import { Hono } from 'hono'
import type { Context } from 'hono'
import { prisma } from '../../utils/database.js'
import { auditLog } from '../../utils/auditLog.js'
import { resolveContext, getEffectiveUserId } from '../../middleware/resolveContext.js'

const app = new Hono()

// --- Pipelines ---

// GET /api/v1/crm/pipelines - List all pipelines
app.get('/pipelines', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)

        const effectiveUserId = getEffectiveUserId(c)
        const pipelines = await prisma.pipeline.findMany({
            where: { userId: effectiveUserId },
            include: {
                stages: {
                    orderBy: { order: 'asc' }
                }
            }
        })

        return c.json({ success: true, data: pipelines })
    } catch (error) {
        console.error('List pipelines error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch pipelines' } }, 500)
    }
})

// POST /api/v1/crm/pipelines - Create pipeline
app.post('/pipelines', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)

        const body = await c.req.json()
        const { name, description, isDefault, stages } = body

        const effectiveUserId = getEffectiveUserId(c)
        const pipeline = await prisma.pipeline.create({
            data: {
                userId: effectiveUserId,
                name,
                description,
                isDefault: isDefault || false,
                stages: {
                    create: stages?.map((stage: any, index: number) => ({
                        name: stage.name,
                        color: stage.color || '#000000',
                        order: stage.order || index
                    }))
                }
            },
            include: { stages: true }
        })

        await auditLog('PIPELINE_CREATED', 'Pipeline', pipeline.id, { name }, c.user.id)

        return c.json({ success: true, data: pipeline })
    } catch (error) {
        console.error('Create pipeline error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to create pipeline' } }, 500)
    }
})

// PUT /api/v1/crm/pipelines/:id - Update pipeline
app.put('/pipelines/:id', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const id = c.req.param('id')
        const body = await c.req.json()
        const { name, description, isDefault, stages } = body

        const effectiveUserId = getEffectiveUserId(c)

        // Verify ownership
        const existingPipeline = await prisma.pipeline.findUnique({
            where: { id, userId: effectiveUserId },
            include: { stages: true }
        })
        if (!existingPipeline) {
            return c.json({ error: { code: 'NotFound', message: 'Pipeline not found' } }, 404)
        }

        // Update pipeline with stages in a transaction
        const pipeline = await prisma.$transaction(async (tx) => {
            // Update pipeline basic info
            const updatedPipeline = await tx.pipeline.update({
                where: { id, userId: effectiveUserId },
                data: { name, description, isDefault }
            })

            // If stages are provided, sync them
            if (stages && Array.isArray(stages)) {
                const existingStageIds = existingPipeline.stages.map(s => s.id)
                const incomingStageIds = stages.filter((s: any) => s.id).map((s: any) => s.id)

                // Delete stages that are no longer in the list
                const stagesToDelete = existingStageIds.filter(id => !incomingStageIds.includes(id))
                if (stagesToDelete.length > 0) {
                    await tx.pipelineStage.deleteMany({
                        where: { id: { in: stagesToDelete } }
                    })
                }

                // Update or create stages
                for (const stage of stages as any[]) {
                    if (stage.id && existingStageIds.includes(stage.id)) {
                        // Update existing stage
                        await tx.pipelineStage.update({
                            where: { id: stage.id },
                            data: {
                                name: stage.name,
                                color: stage.color,
                                order: stage.order
                            }
                        })
                    } else {
                        // Create new stage
                        await tx.pipelineStage.create({
                            data: {
                                pipelineId: id,
                                name: stage.name,
                                color: stage.color || '#000000',
                                order: stage.order
                            }
                        })
                    }
                }
            }

            // Return updated pipeline with stages
            return tx.pipeline.findUnique({
                where: { id },
                include: { stages: { orderBy: { order: 'asc' } } }
            })
        })

        await auditLog('PIPELINE_UPDATED', 'Pipeline', id, { name, stagesCount: stages?.length }, c.user.id)

        return c.json({ success: true, data: pipeline })
    } catch (error) {
        console.error('Update pipeline error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to update pipeline' } }, 500)
    }
})

// DELETE /api/v1/crm/pipelines/:id - Delete pipeline
app.delete('/pipelines/:id', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const id = c.req.param('id')

        const effectiveUserId = getEffectiveUserId(c)
        await prisma.pipeline.delete({
            where: { id, userId: effectiveUserId }
        })

        await auditLog('PIPELINE_DELETED', 'Pipeline', id, {}, c.user.id)

        return c.json({ success: true, message: 'Pipeline deleted' })
    } catch (error) {
        console.error('Delete pipeline error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete pipeline' } }, 500)
    }
})

// --- Stages ---

// POST /api/v1/crm/pipelines/:id/stages - Add stage
app.post('/pipelines/:id/stages', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const pipelineId = c.req.param('id')
        const body = await c.req.json()
        const { name, color, order } = body

        const effectiveUserId = getEffectiveUserId(c)

        // Verify pipeline ownership
        const pipeline = await prisma.pipeline.findUnique({
            where: { id: pipelineId, userId: effectiveUserId }
        })
        if (!pipeline) return c.json({ error: { code: 'NotFound', message: 'Pipeline not found' } }, 404)

        const stage = await prisma.pipelineStage.create({
            data: {
                pipelineId,
                name,
                color,
                order
            }
        })

        return c.json({ success: true, data: stage })
    } catch (error) {
        console.error('Create stage error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to create stage' } }, 500)
    }
})

// PUT /api/v1/crm/stages/:id - Update stage
app.put('/stages/:id', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const id = c.req.param('id')
        const body = await c.req.json()
        const { name, color, order } = body

        const effectiveUserId = getEffectiveUserId(c)

        // Verify ownership via pipeline
        const stage = await prisma.pipelineStage.findUnique({
            where: { id },
            include: { pipeline: true }
        })
        if (!stage || stage.pipeline.userId !== effectiveUserId) {
            return c.json({ error: { code: 'NotFound', message: 'Stage not found' } }, 404)
        }

        const updatedStage = await prisma.pipelineStage.update({
            where: { id },
            data: { name, color, order }
        })

        return c.json({ success: true, data: updatedStage })
    } catch (error) {
        console.error('Update stage error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to update stage' } }, 500)
    }
})

// DELETE /api/v1/crm/stages/:id - Delete stage
app.delete('/stages/:id', resolveContext, async (c: Context) => {
    try {
        if (!c.user) return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
        const id = c.req.param('id')

        const effectiveUserId = getEffectiveUserId(c)

        // Verify ownership
        const stage = await prisma.pipelineStage.findUnique({
            where: { id },
            include: { pipeline: true }
        })
        if (!stage || stage.pipeline.userId !== effectiveUserId) {
            return c.json({ error: { code: 'NotFound', message: 'Stage not found' } }, 404)
        }

        await prisma.pipelineStage.delete({ where: { id } })

        return c.json({ success: true, message: 'Stage deleted' })
    } catch (error) {
        console.error('Delete stage error:', error)
        return c.json({ error: { code: 'InternalServerError', message: 'Failed to delete stage' } }, 500)
    }
})

export default app
