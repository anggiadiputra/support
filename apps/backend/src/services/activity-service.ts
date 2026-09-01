import { prisma } from '../utils/database.js'

export enum ActivityType {
    MESSAGE_SENT = 'MESSAGE_SENT',
    MESSAGE_RECEIVED = 'MESSAGE_RECEIVED',
    STAGE_CHANGED = 'STAGE_CHANGED',
    FIELD_UPDATED = 'FIELD_UPDATED',
    NOTE_ADDED = 'NOTE_ADDED',
    CUSTOMER_CREATED = 'CUSTOMER_CREATED',
    CONSENT_CHANGED = 'CONSENT_CHANGED',
    CTWA_ATTRIBUTION = 'CTWA_ATTRIBUTION',
}

interface ActivityMetadata {
    messageId?: string
    messagePreview?: string
    fromStage?: string
    toStage?: string
    field?: string
    oldValue?: any
    newValue?: any
    [key: string]: any
}

export class ActivityService {
    /**
     * Generic method to log any activity
     */
    static async logActivity(
        customerId: string,
        userId: string,
        type: ActivityType,
        title: string,
        description?: string,
        metadata?: ActivityMetadata
    ) {
        try {
            const activity = await prisma.customerActivity.create({
                data: {
                    customerId,
                    userId,
                    type,
                    title,
                    description,
                    metadata: metadata || {},
                },
            })
            return activity
        } catch (error) {
            console.error('Failed to log activity:', error)
            // Don't throw - activity logging should not break main flow
            return null
        }
    }

    /**
     * Log message activity (sent or received)
     */
    static async logMessageActivity(
        customerId: string,
        userId: string,
        direction: 'sent' | 'received',
        messageId: string,
        messagePreview?: string
    ) {
        const type = direction === 'sent' ? ActivityType.MESSAGE_SENT : ActivityType.MESSAGE_RECEIVED
        const title = direction === 'sent' ? 'Message sent' : 'Message received'
        const description = messagePreview
            ? `${messagePreview.substring(0, 100)}${messagePreview.length > 100 ? '...' : ''}`
            : undefined

        return this.logActivity(
            customerId,
            userId,
            type,
            title,
            description,
            { messageId, messagePreview }
        )
    }

    /**
     * Log pipeline stage change
     */
    static async logStageChange(
        customerId: string,
        userId: string,
        fromStageName: string | null,
        toStageName: string
    ) {
        const title = fromStageName
            ? `Stage changed from "${fromStageName}" to "${toStageName}"`
            : `Moved to "${toStageName}" stage`

        return this.logActivity(
            customerId,
            userId,
            ActivityType.STAGE_CHANGED,
            title,
            undefined,
            { fromStage: fromStageName, toStage: toStageName }
        )
    }

    /**
     * Log field update
     */
    static async logFieldUpdate(
        customerId: string,
        userId: string,
        fieldName: string,
        oldValue: any,
        newValue: any
    ) {
        const title = `Updated ${fieldName}`
        const description = `Changed from "${oldValue || '(empty)'}" to "${newValue || '(empty)'}"`

        return this.logActivity(
            customerId,
            userId,
            ActivityType.FIELD_UPDATED,
            title,
            description,
            { field: fieldName, oldValue, newValue }
        )
    }

    /**
     * Log manual note
     */
    static async logNote(
        customerId: string,
        userId: string,
        noteContent: string
    ) {
        return this.logActivity(
            customerId,
            userId,
            ActivityType.NOTE_ADDED,
            'Note added',
            noteContent
        )
    }

    /**
     * Log customer creation
     */
    static async logCustomerCreated(
        customerId: string,
        userId: string
    ) {
        return this.logActivity(
            customerId,
            userId,
            ActivityType.CUSTOMER_CREATED,
            'Customer created',
            'New customer added to the system'
        )
    }

    /**
     * Log consent status change
     */
    static async logConsentChange(
        customerId: string,
        userId: string,
        oldStatus: string,
        newStatus: string
    ) {
        const title = 'Consent status changed'
        const description = `Changed from "${oldStatus}" to "${newStatus}"`

        return this.logActivity(
            customerId,
            userId,
            ActivityType.CONSENT_CHANGED,
            title,
            description,
            { oldValue: oldStatus, newValue: newStatus }
        )
    }

    /**
     * Fetch activities for a customer
     */
    static async getActivities(
        customerId: string,
        options: {
            limit?: number
            offset?: number
            type?: ActivityType
        } = {}
    ) {
        const { limit = 20, offset = 0, type } = options

        const where: any = { customerId }
        if (type) {
            where.type = type
        }

        const activities = await prisma.customerActivity.findMany({
            where,
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
            },
            orderBy: {
                timestamp: 'desc',
            },
            take: limit,
            skip: offset,
        })

        const total = await prisma.customerActivity.count({ where })

        return {
            activities,
            total,
            hasMore: offset + limit < total,
        }
    }
}
