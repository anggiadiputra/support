const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export const templatesApi = {
    async getTemplates(filters?: { whatsappAccountId?: string }) {
        const params = new URLSearchParams()
        if (filters?.whatsappAccountId) {
            params.append('whatsappAccountId', filters.whatsappAccountId)
        }
        const queryString = params.toString()
        const url = `${API_URL}/api/v1/templates${queryString ? `?${queryString}` : ''}`

        const response = await fetch(url, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to fetch templates')
        }

        const result = await response.json()
        return result.data || []
    },

    async getTemplate(id: string) {
        const response = await fetch(`${API_URL}/api/v1/templates/${id}`, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to fetch template')
        }

        const result = await response.json()
        return result.data
    },

    async createTemplate(data: {
        userId: string
        templateName: string
        language: string
        category: string
        content: string
        headerType?: string
        headerContent?: string
        footerContent?: string
        buttons?: any[]
        variables?: string[]
        headerMediaId?: string
        whatsappAccountId?: string
    }) {
        const response = await fetch(`${API_URL}/api/v1/templates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to create template')
        }

        return response.json()
    },

    async submitToMeta(id: string) {
        const response = await fetch(`${API_URL}/api/v1/templates/${id}/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to submit template')
        }

        return response.json()
    },

    async deleteTemplate(id: string) {
        const response = await fetch(`${API_URL}/api/v1/templates/${id}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to delete template')
        }

        return response.json()
    },

    async getAnalytics(id: string) {
        const response = await fetch(`${API_URL}/api/v1/templates/${id}/analytics`, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to fetch analytics')
        }

        const result = await response.json()
        return result.data
    },
}
