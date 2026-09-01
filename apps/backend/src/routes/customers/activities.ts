import { Hono } from 'hono'
import type { Context } from 'hono'
import { z } from 'zod'
import { ActivityService, ActivityType } from '../../services/activity-service.js'
import { getEffectiveUserId } from '../../middleware/resolveContext.js'
import { handleValidationError, logDetailedError } from '../../middleware/errorHandler.js'
import { prisma } from '../../utils/database.js'
const app = new Hono()

// Validation schemas
const getActivitiesSchema = z.object({
    limit: z.string().optional().transform(val => val ? parseInt(val) : 20),
    offset: z.string().optional().transform(val => val ? parseInt(val) : 0),
    type: z.nativeEnum(ActivityType).optional(),
})

const createActivitySchema = z.object({
    type: z.nativeEnum(ActivityType),
    title: z.string().min(1),
    description: z.string().optional(),
    metadata: z.record(z.string(), z.any()).optional(),
})

/**
 * GET /api/v1/customers/:id/activities
 * Fetch activity timeline for a customer
 */
app.get('/:id/activities', async (c: Context) => {
    try {
        const customerId = c.req.param('id')
        const user = c.user

        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        // Use effectiveUserId for agents to access business owner's customers
        const effectiveUserId = getEffectiveUserId(c)

        // Verify customer belongs to effective user
        const customer = await prisma.customer.findFirst({
            where: {
                id: customerId,
                userId: effectiveUserId,
            },
        })

        if (!customer) {
            return c.json({ success: false, error: 'Customer not found' }, 404)
        }

        // Parse query params
        const queryParams = getActivitiesSchema.safeParse({
            limit: c.req.query('limit'),
            offset: c.req.query('offset'),
            type: c.req.query('type'),
        })

        if (!queryParams.success) {
            return handleValidationError(queryParams.error, c)
        }

        const { limit, offset, type } = queryParams.data

        // Fetch activities
        const result = await ActivityService.getActivities(customerId, {
            limit,
            offset,
            type,
        })

        return c.json({
            success: true,
            data: result.activities,
            pagination: {
                total: result.total,
                limit,
                offset,
                hasMore: result.hasMore,
            },
        })
    } catch (error) {
        logDetailedError(error, { path: c.req.path, method: c.req.method })
        return c.json({
            success: false,
            error: 'Failed to fetch activities'
        }, 500)
    }
})

/**
 * POST /api/v1/customers/:id/activities
 * Create a manual activity (note)
 */
app.post('/:id/activities', async (c: Context) => {
    try {
        const customerId = c.req.param('id')
        const user = c.user

        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401)
        }

        // Use effectiveUserId for agents to access business owner's customers
        const effectiveUserId = getEffectiveUserId(c)

        // Verify customer belongs to effective user
        const customer = await prisma.customer.findFirst({
            where: {
                id: customerId,
                userId: effectiveUserId,
            },
        })

        if (!customer) {
            return c.json({ success: false, error: 'Customer not found' }, 404)
        }

        // Parse and validate request body
        const body = await c.req.json()
        const validation = createActivitySchema.safeParse(body)

        if (!validation.success) {
            return handleValidationError(validation.error, c)
        }

        const { type, title, description, metadata } = validation.data

        // Use transaction to create both activity and note (if NOTE_ADDED)
        const result = await prisma.$transaction(async (tx) => {
            // Create activity
            const activity = await ActivityService.logActivity(
                customerId,
                user.id,
                type,
                title,
                description,
                metadata
            )

            if (!activity) {
                throw new Error('Failed to create activity')
            }

            // If this is a NOTE_ADDED activity, also create CustomerNote
            // This ensures notes sync between Activity Timeline (Customers page) and Notes section (OneInbox)
            if (type === ActivityType.NOTE_ADDED && description) {
                await tx.customerNote.create({
                    data: {
                        content: description,
                        customerId,
                        createdBy: user.id
                    }
                })
            }

            return activity
        })

        // Fetch the created activity with user info
        const activityWithUser = await prisma.customerActivity.findUnique({
            where: { id: result.id },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
        })

        return c.json({
            success: true,
            data: activityWithUser,
        }, 201)
    } catch (error) {
        logDetailedError(error, { path: c.req.path, method: c.req.method })
        return c.json({
            success: false,
            error: 'Failed to create activity'
        }, 500)
    }
})

export default app
