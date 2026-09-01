/**
 * Auto Tagging API
 *
 * API functions for managing auto-tagging rules.
 * These rules automatically add tags and move customers to pipeline stages
 * based on keywords in inbound messages.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
  pipelineId: string
}

export interface AutoTagRule {
  id: string
  userId: string
  name: string
  keywords: string[]
  priority: number
  isActive: boolean
  addTags: string[]
  moveToPipelineStageId: string | null
  moveToPipelineStage: PipelineStage | null
  matchCount: number
  lastMatchAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CreateAutoTagRuleInput {
  name: string
  keywords: string[]
  priority?: number
  isActive?: boolean
  addTags: string[]
  moveToPipelineStageId?: string | null
}

export interface UpdateAutoTagRuleInput {
  name?: string
  keywords?: string[]
  priority?: number
  isActive?: boolean
  addTags?: string[]
  moveToPipelineStageId?: string | null
}

export const autoTaggingApi = {
  /**
   * List all auto-tag rules
   */
  async list(): Promise<AutoTagRule[]> {
    const response = await fetch(`${API_URL}/api/v1/crm/auto-tagging/rules`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch auto-tag rules')
    }

    return result.data
  },

  /**
   * Get a single auto-tag rule by ID
   */
  async get(id: string): Promise<AutoTagRule> {
    const response = await fetch(`${API_URL}/api/v1/crm/auto-tagging/rules/${id}`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch auto-tag rule')
    }

    return result.data
  },

  /**
   * Create a new auto-tag rule
   */
  async create(input: CreateAutoTagRuleInput): Promise<AutoTagRule> {
    const response = await fetch(`${API_URL}/api/v1/crm/auto-tagging/rules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to create auto-tag rule')
    }

    return result.data
  },

  /**
   * Update an existing auto-tag rule
   */
  async update(id: string, input: UpdateAutoTagRuleInput): Promise<AutoTagRule> {
    const response = await fetch(`${API_URL}/api/v1/crm/auto-tagging/rules/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to update auto-tag rule')
    }

    return result.data
  },

  /**
   * Delete an auto-tag rule
   */
  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/crm/auto-tagging/rules/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to delete auto-tag rule')
    }
  },

  /**
   * Toggle rule active status
   */
  async toggle(id: string): Promise<AutoTagRule> {
    const response = await fetch(`${API_URL}/api/v1/crm/auto-tagging/rules/${id}/toggle`, {
      method: 'PATCH',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to toggle auto-tag rule')
    }

    return result.data
  },
}
