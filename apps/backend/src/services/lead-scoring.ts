import { prisma } from '../utils/database.js'

export class LeadScoringService {
    static async calculateScore(customerId: string): Promise<number> {
        const customer = await prisma.customer.findUnique({
            where: { id: customerId },
            include: {
                customFields: true,
                pipelineStage: true,
                _count: {
                    select: { messages: true }
                }
            }
        })

        if (!customer) return 0

        let score = 0

        // 1. Profile Completeness
        if (customer.name) score += 10
        // Removed email check as it's not in the schema
        if (customer.tags && customer.tags.length > 0) score += 5 * customer.tags.length

        // 2. Engagement (Messages)
        score += (customer._count.messages || 0) * 2

        // 3. Custom Fields Data
        if (customer.customFields && customer.customFields.length > 0) {
            score += customer.customFields.length * 5
        }

        // 4. Pipeline Stage (Heuristic based on stage name for now)
        if (customer.pipelineStage) {
            const stageName = customer.pipelineStage.name.toLowerCase()
            if (stageName.includes('won') || stageName.includes('deal')) score += 50
            else if (stageName.includes('qualified')) score += 30
            else if (stageName.includes('contacted')) score += 10
        }

        return score
    }

    static async updateCustomerScore(customerId: string): Promise<void> {
        const score = await this.calculateScore(customerId)
        await prisma.customer.update({
            where: { id: customerId },
            data: { leadScore: score }
        })
    }
}
