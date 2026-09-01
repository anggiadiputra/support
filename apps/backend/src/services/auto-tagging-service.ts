import { prisma } from '../utils/database.js'
import type { AutoTagRule, PipelineStage } from '@prisma/client'

// Cache structure for rules per user
interface RulesCache {
  rules: AutoTagRuleWithStage[]
  timestamp: number
}

// AutoTagRule with pipeline stage relation
type AutoTagRuleWithStage = AutoTagRule & {
  moveToPipelineStage: PipelineStage | null
}

// Result of processing inbound message
export interface AutoTagResult {
  matched: boolean
  rulesMatched: string[] // Rule names that matched
  tagsAdded: string[] // Tags that were added
  stageChanged: boolean
  newStageId?: string
  newStageName?: string
}

// In-memory cache per user (1 minute TTL)
const rulesCache = new Map<string, RulesCache>()
const CACHE_TTL = 60 * 1000 // 1 minute

export class AutoTaggingService {
  /**
   * Get active rules for a user with caching
   */
  static async getRulesForUser(userId: string): Promise<AutoTagRuleWithStage[]> {
    const cached = rulesCache.get(userId)
    const now = Date.now()

    // Return cached if still valid
    if (cached && now - cached.timestamp < CACHE_TTL) {
      return cached.rules
    }

    // Fetch from database
    const rules = await prisma.autoTagRule.findMany({
      where: {
        userId,
        isActive: true,
      },
      include: {
        moveToPipelineStage: true,
      },
      orderBy: {
        priority: 'desc', // Higher priority first
      },
    })

    // Update cache
    rulesCache.set(userId, {
      rules,
      timestamp: now,
    })

    return rules
  }

  /**
   * Invalidate cache for a user (call after CRUD operations)
   */
  static invalidateCache(userId: string): void {
    rulesCache.delete(userId)
  }

  /**
   * Check if a message matches a rule's keywords (case-insensitive, partial match)
   */
  static matchesRule(message: string, rule: AutoTagRule): boolean {
    const lowerMessage = message.toLowerCase()
    return rule.keywords.some((keyword) =>
      lowerMessage.includes(keyword.toLowerCase())
    )
  }

  /**
   * Process an inbound message and apply auto-tagging rules
   * @param userId - The business owner's user ID
   * @param customerId - The customer's ID
   * @param messageText - The message content to match against
   * @returns Result of the auto-tagging process
   */
  static async processInboundMessage(
    userId: string,
    customerId: string,
    messageText: string
  ): Promise<AutoTagResult> {
    const result: AutoTagResult = {
      matched: false,
      rulesMatched: [],
      tagsAdded: [],
      stageChanged: false,
    }

    // Skip empty messages
    if (!messageText || messageText.trim() === '') {
      return result
    }

    // Get customer to check current state
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        tags: true,
        pipelineStageId: true,
      },
    })

    if (!customer) {
      console.warn(`[AutoTagging] Customer not found: ${customerId}`)
      return result
    }

    // Get active rules for this user
    const rules = await this.getRulesForUser(userId)

    if (rules.length === 0) {
      return result
    }

    // Find matching rules
    const matchingRules = rules.filter((rule) =>
      this.matchesRule(messageText, rule)
    )

    if (matchingRules.length === 0) {
      return result
    }

    result.matched = true
    result.rulesMatched = matchingRules.map((r) => r.name)

    // Collect all tags to add (deduplicated)
    const existingTags = new Set(customer.tags || [])
    const newTags = new Set<string>()

    for (const rule of matchingRules) {
      for (const tag of rule.addTags) {
        if (!existingTags.has(tag)) {
          newTags.add(tag)
        }
      }
    }

    result.tagsAdded = Array.from(newTags)

    // Get pipeline stage from highest priority rule (first in sorted list)
    const highestPriorityRuleWithStage = matchingRules.find(
      (r) => r.moveToPipelineStageId && r.moveToPipelineStage
    )

    let newStageId: string | undefined
    if (
      highestPriorityRuleWithStage?.moveToPipelineStageId &&
      highestPriorityRuleWithStage.moveToPipelineStageId !== customer.pipelineStageId
    ) {
      newStageId = highestPriorityRuleWithStage.moveToPipelineStageId
      result.stageChanged = true
      result.newStageId = newStageId
      result.newStageName = highestPriorityRuleWithStage.moveToPipelineStage?.name
    }

    // Update customer if there are changes
    if (newTags.size > 0 || newStageId) {
      const updateData: {
        tags?: string[]
        pipelineStageId?: string
      } = {}

      if (newTags.size > 0) {
        updateData.tags = [...existingTags, ...newTags]
      }

      if (newStageId) {
        updateData.pipelineStageId = newStageId
      }

      await prisma.customer.update({
        where: { id: customerId },
        data: updateData,
      })

      console.log(
        `[AutoTagging] Customer ${customerId} updated - Tags: ${result.tagsAdded.join(', ')} | Stage: ${result.newStageName || 'unchanged'}`
      )
    }

    // Update rule statistics
    await prisma.autoTagRule.updateMany({
      where: { id: { in: matchingRules.map((r) => r.id) } },
      data: {
        matchCount: { increment: 1 },
        lastMatchAt: new Date(),
      },
    })

    return result
  }

  // =========================================================================
  // CRUD Operations
  // =========================================================================

  /**
   * Create a new auto-tag rule
   */
  static async createRule(
    userId: string,
    data: {
      name: string
      keywords: string[]
      priority?: number
      isActive?: boolean
      addTags: string[]
      moveToPipelineStageId?: string | null
    }
  ): Promise<AutoTagRuleWithStage> {
    const rule = await prisma.autoTagRule.create({
      data: {
        userId,
        name: data.name,
        keywords: data.keywords.map((k) => k.trim().toLowerCase()), // Normalize keywords
        priority: data.priority ?? 10,
        isActive: data.isActive ?? true,
        addTags: data.addTags,
        moveToPipelineStageId: data.moveToPipelineStageId || null,
      },
      include: {
        moveToPipelineStage: true,
      },
    })

    // Invalidate cache
    this.invalidateCache(userId)

    return rule
  }

  /**
   * Update an existing rule
   */
  static async updateRule(
    ruleId: string,
    userId: string,
    data: {
      name?: string
      keywords?: string[]
      priority?: number
      isActive?: boolean
      addTags?: string[]
      moveToPipelineStageId?: string | null
    }
  ): Promise<AutoTagRuleWithStage | null> {
    // Verify ownership
    const existing = await prisma.autoTagRule.findFirst({
      where: { id: ruleId, userId },
    })

    if (!existing) {
      return null
    }

    const updateData: any = { ...data }

    // Normalize keywords if provided
    if (data.keywords) {
      updateData.keywords = data.keywords.map((k) => k.trim().toLowerCase())
    }

    const rule = await prisma.autoTagRule.update({
      where: { id: ruleId },
      data: updateData,
      include: {
        moveToPipelineStage: true,
      },
    })

    // Invalidate cache
    this.invalidateCache(userId)

    return rule
  }

  /**
   * Delete a rule
   */
  static async deleteRule(ruleId: string, userId: string): Promise<boolean> {
    // Verify ownership
    const existing = await prisma.autoTagRule.findFirst({
      where: { id: ruleId, userId },
    })

    if (!existing) {
      return false
    }

    await prisma.autoTagRule.delete({
      where: { id: ruleId },
    })

    // Invalidate cache
    this.invalidateCache(userId)

    return true
  }

  /**
   * Toggle rule active status
   */
  static async toggleRule(
    ruleId: string,
    userId: string
  ): Promise<AutoTagRuleWithStage | null> {
    // Verify ownership
    const existing = await prisma.autoTagRule.findFirst({
      where: { id: ruleId, userId },
    })

    if (!existing) {
      return null
    }

    const rule = await prisma.autoTagRule.update({
      where: { id: ruleId },
      data: { isActive: !existing.isActive },
      include: {
        moveToPipelineStage: true,
      },
    })

    // Invalidate cache
    this.invalidateCache(userId)

    return rule
  }

  /**
   * Get all rules for a user (for API listing)
   */
  static async getRules(
    userId: string
  ): Promise<AutoTagRuleWithStage[]> {
    return prisma.autoTagRule.findMany({
      where: { userId },
      include: {
        moveToPipelineStage: true,
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'desc' },
      ],
    })
  }

  /**
   * Get a single rule by ID
   */
  static async getRule(
    ruleId: string,
    userId: string
  ): Promise<AutoTagRuleWithStage | null> {
    return prisma.autoTagRule.findFirst({
      where: { id: ruleId, userId },
      include: {
        moveToPipelineStage: true,
      },
    })
  }
}
