/**
 * Quick Replies API
 *
 * API functions for managing quick replies and categories.
 * Quick replies are pre-defined message templates with shortcuts
 * for fast customer response.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

// ============================================================================
// Types
// ============================================================================

export interface QuickReplyCategory {
  id: string
  name: string
  order: number
  createdAt: string
  updatedAt: string
}

export interface QuickReply {
  id: string
  shortcut: string
  title: string
  content: string
  category: QuickReplyCategory | null
  createdAt: string
  updatedAt: string
}

export interface CreateQuickReplyCategoryInput {
  name: string
}

export interface UpdateQuickReplyCategoryInput {
  name?: string
  order?: number
}

export interface CreateQuickReplyInput {
  categoryId?: string
  shortcut: string
  title: string
  content: string
}

export interface UpdateQuickReplyInput {
  categoryId?: string | null
  shortcut?: string
  title?: string
  content?: string
}

export interface QuickReplyListParams {
  categoryId?: string
  search?: string
}

// ============================================================================
// API Client
// ============================================================================

export const quickRepliesApi = {
  // ==========================================================================
  // Categories
  // ==========================================================================

  /**
   * List all quick reply categories
   */
  async listCategories(): Promise<QuickReplyCategory[]> {
    const response = await fetch(`${API_URL}/api/v1/quick-replies/categories`, {
      method: "GET",
      credentials: "include",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch categories")
    }

    return result.data
  },

  /**
   * Create a new quick reply category
   */
  async createCategory(
    data: CreateQuickReplyCategoryInput
  ): Promise<QuickReplyCategory> {
    const response = await fetch(`${API_URL}/api/v1/quick-replies/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to create category")
    }

    return result.data
  },

  /**
   * Update an existing quick reply category
   */
  async updateCategory(
    id: string,
    data: UpdateQuickReplyCategoryInput
  ): Promise<QuickReplyCategory> {
    const response = await fetch(
      `${API_URL}/api/v1/quick-replies/categories/${id}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(data),
      }
    )

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to update category")
    }

    return result.data
  },

  /**
   * Delete a quick reply category
   */
  async deleteCategory(id: string): Promise<void> {
    const response = await fetch(
      `${API_URL}/api/v1/quick-replies/categories/${id}`,
      {
        method: "DELETE",
        credentials: "include",
      }
    )

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to delete category")
    }
  },

  // ==========================================================================
  // Quick Replies
  // ==========================================================================

  /**
   * List all quick replies with optional filtering
   */
  async list(params?: QuickReplyListParams): Promise<QuickReply[]> {
    const searchParams = new URLSearchParams()

    if (params?.categoryId) {
      searchParams.set("categoryId", params.categoryId)
    }
    if (params?.search) {
      searchParams.set("search", params.search)
    }

    const queryString = searchParams.toString()
    const url = `${API_URL}/api/v1/quick-replies${queryString ? `?${queryString}` : ""}`

    const response = await fetch(url, {
      method: "GET",
      credentials: "include",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to fetch quick replies")
    }

    return result.data
  },

  /**
   * Search quick replies by query
   */
  async search(query: string): Promise<QuickReply[]> {
    const response = await fetch(
      `${API_URL}/api/v1/quick-replies/search?q=${encodeURIComponent(query)}`,
      {
        method: "GET",
        credentials: "include",
      }
    )

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to search quick replies")
    }

    return result.data
  },

  /**
   * Create a new quick reply
   */
  async create(data: CreateQuickReplyInput): Promise<QuickReply> {
    const response = await fetch(`${API_URL}/api/v1/quick-replies`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to create quick reply")
    }

    return result.data
  },

  /**
   * Update an existing quick reply
   */
  async update(id: string, data: UpdateQuickReplyInput): Promise<QuickReply> {
    const response = await fetch(`${API_URL}/api/v1/quick-replies/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify(data),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to update quick reply")
    }

    return result.data
  },

  /**
   * Delete a quick reply
   */
  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/quick-replies/${id}`, {
      method: "DELETE",
      credentials: "include",
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || "Failed to delete quick reply")
    }
  },

  /**
   * Get a quick reply by its shortcut
   */
  async getByShortcut(shortcut: string): Promise<QuickReply | null> {
    const response = await fetch(
      `${API_URL}/api/v1/quick-replies/shortcut/${encodeURIComponent(shortcut)}`,
      {
        method: "GET",
        credentials: "include",
      }
    )

    const result = await response.json()

    if (!result.success) {
      // Return null if not found (404)
      if (response.status === 404) {
        return null
      }
      throw new Error(
        result.error?.message || "Failed to fetch quick reply by shortcut"
      )
    }

    return result.data
  },
}
