const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

/**
 * Customer type matching backend response
 */
export interface Customer {
    id: string
    phoneNumber: string
    name: string | null
    email: string | null
    consentStatus: 'CONSENTED' | 'NOT_CONSENTED'
    blacklisted: boolean
    leadScore: number
    pipelineStageId: string | null
    pipelineStage?: {
        id: string
        name: string
        color: string
    } | null
    lastMessageAt: string | null
    hasActiveWindow: boolean
    createdAt: string
    updatedAt: string
    _count?: {
        messages: number
        consentLogs: number
    }
    // WhatsApp BSUID fields
    whatsappBsuid?: string | null
    whatsappParentBsuid?: string | null
    whatsappUsername?: string | null
    bsuidMappedAt?: string | null
}

/**
 * Filters for customers list query
 */
export interface CustomersFilters {
    page?: number
    search?: string
    pipeline?: string
    consentStatus?: boolean
    blacklisted?: boolean
    whatsappPhoneNumberId?: string
}

/**
 * Customer statistics type
 */
export interface CustomerStats {
    total: number
    consented: number
    activeWindow: number
    blacklisted: number
}

export const customersApi = {
    /**
     * Get customer statistics
     * Supports filtering by whatsappPhoneNumberId for multi-number accounts
     */
    async getStats(filters?: { whatsappPhoneNumberId?: string }): Promise<CustomerStats> {
        const params = new URLSearchParams()
        if (filters?.whatsappPhoneNumberId) {
            params.append('whatsappPhoneNumberId', filters.whatsappPhoneNumberId)
        }
        
        const queryString = params.toString()
        const url = `${API_URL}/api/v1/customers/stats${queryString ? `?${queryString}` : ''}`
        
        const response = await fetch(url, {
            credentials: 'include',
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to fetch customer stats')
        }
        return result.data
    },

    /**
     * Get customers list with optional filters
     */
    async getCustomers(filters?: CustomersFilters): Promise<Customer[]> {
        const params = new URLSearchParams()
        
        if (filters?.consentStatus !== undefined) {
            params.append('consentStatus', String(filters.consentStatus))
        }
        if (filters?.blacklisted !== undefined) {
            params.append('blacklisted', String(filters.blacklisted))
        }
        if (filters?.whatsappPhoneNumberId) {
            params.append('whatsappPhoneNumberId', filters.whatsappPhoneNumberId)
        }
        
        const queryString = params.toString()
        const url = `${API_URL}/api/v1/customers${queryString ? `?${queryString}` : ''}`
        
        const response = await fetch(url, {
            credentials: 'include',
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to fetch customers')
        }
        return result.data || []
    },

    /**
     * Get a single customer by ID
     */
    async getCustomer(id: string): Promise<Customer> {
        const response = await fetch(`${API_URL}/api/v1/customers/${id}`, {
            credentials: 'include',
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to fetch customer')
        }
        return result.data
    },

    async createCustomer(data: {
        phoneNumber: string
        name?: string
        whatsappPhoneNumberId: string
        consentStatus: boolean
        consentSource: string
    }) {
        const response = await fetch(`${API_URL}/api/v1/customers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to create customer')
        }
        return result
    },

    async updateCustomer(id: string, data: { name?: string; email?: string | null; pipelineStageId?: string | null }) {
        const response = await fetch(`${API_URL}/api/v1/customers/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(data),
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to update customer')
        }
        return result
    },

    async deleteCustomer(id: string) {
        const response = await fetch(`${API_URL}/api/v1/customers/${id}`, {
            method: 'DELETE',
            credentials: 'include',
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to delete customer')
        }
        return result
    },

    async updateConsent(id: string, consentStatus: boolean) {
        const response = await fetch(`${API_URL}/api/v1/customers/${id}/consent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                action: consentStatus ? 'OPT_IN' : 'OPT_OUT',
                source: 'Admin Dashboard',
                purpose: 'Marketing and Service Messages',
            }),
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to update consent')
        }
        return result
    },

    async toggleBlacklist(id: string, blacklisted: boolean) {
        const response = await fetch(`${API_URL}/api/v1/customers/${id}/blacklist`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ blacklisted: !blacklisted }),
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to update blacklist')
        }
        return result
    },

    async importCustomers(customers: any[]) {
        const response = await fetch(`${API_URL}/api/v1/customers/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ customers }),
        })
        const result = await response.json()
        if (!response.ok) {
            throw new Error(result.error?.message || 'Failed to import customers')
        }
        return result
    },

    async exportCustomers() {
        const response = await fetch(`${API_URL}/api/v1/customers/export`, {
            credentials: 'include',
        })
        if (!response.ok) {
            throw new Error('Failed to export customers')
        }
        return response.blob()
    },
}
