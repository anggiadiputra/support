const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

// Enhanced Stats Response Interface
export interface EnhancedDashboardStats {
  messages: {
    total: number
    today: number
    thisWeek: number
    thisMonth: number
    sent: number
    delivered: number
    read: number
    failed: number
    deliveryRate: number
    readRate: number
    byType: {
      text: number
      image: number
      video: number
      document: number
      template: number
      other: number
    }
    byChannel: {
      whatsapp: number
      instagram: number
    }
  }
  customers: {
    total: number
    newThisWeek: number
    activeWindows: number
    consented: number
    blacklisted: number
    byPipelineStage: Array<{
      stageId: string
      stageName: string
      stageColor: string
      count: number
    }>
    topLeads: Array<{
      id: string
      name: string
      phoneNumber: string
      leadScore: number
      pipelineStage: string | null
    }>
  }
  templates: {
    total: number
    approved: number
    pending: number
    rejected: number
    byCategory: {
      marketing: number
      utility: number
      authentication: number
    }
    usageThisMonth: number
  }
  whatsapp: {
    connected: boolean
    phoneNumber: string | null
    verifiedName: string | null
  }
  instagram: {
    connected: boolean
    conversations: number
    unreadCount: number
    activeWindows: number
    messagesTotal: number
  }
  quality: {
    rating: 'HIGH' | 'MEDIUM' | 'LOW' | null
    messagingTier: string | null
    blockCount7days: number
    spamReportCount7days: number
    status: string | null
  }
  lastUpdated: string
}

// Message Volume Response Interface
export interface MessageVolumeData {
  date: string
  whatsapp: number
  instagram: number
  total: number
}

// Customer Insights Response Interface
export interface CustomerInsights {
  byPipelineStage: Array<{
    stageId: string
    stageName: string
    stageColor: string
    count: number
  }>
  topLeads: Array<{
    id: string
    name: string
    phoneNumber: string
    leadScore: number
    pipelineStage: string | null
  }>
  newThisWeek: number
  consented: number
}

// Quality Metrics Response Interface
export interface QualityMetrics {
  rating: 'HIGH' | 'MEDIUM' | 'LOW' | null
  messagingTier: string | null
  blockCount7days: number
  spamReportCount7days: number
  status: string | null
}

export const dashboardApi = {
  async getStats(filters?: { 
    whatsappPhoneNumberId?: string
    startDate?: string
    endDate?: string 
  }): Promise<EnhancedDashboardStats> {
    const params = new URLSearchParams()
    if (filters?.whatsappPhoneNumberId) {
      params.append('whatsappPhoneNumberId', filters.whatsappPhoneNumberId)
    }
    if (filters?.startDate) {
      params.append('startDate', filters.startDate)
    }
    if (filters?.endDate) {
      params.append('endDate', filters.endDate)
    }
    const queryString = params.toString()
    const url = `${API_URL}/api/v1/dashboard/stats${queryString ? `?${queryString}` : ''}`

    const response = await fetch(url, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch dashboard stats')
    }

    return result.data
  },

  async getMessageVolume(days: number = 30, filters?: { whatsappPhoneNumberId?: string }): Promise<MessageVolumeData[]> {
    const params = new URLSearchParams({ days: String(days) })
    if (filters?.whatsappPhoneNumberId) {
      params.append('whatsappPhoneNumberId', filters.whatsappPhoneNumberId)
    }
    const response = await fetch(`${API_URL}/api/v1/dashboard/message-volume?${params.toString()}`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch message volume')
    }

    return result.data
  },

  async getCustomerInsights(filters?: { whatsappPhoneNumberId?: string }): Promise<CustomerInsights> {
    const params = new URLSearchParams()
    if (filters?.whatsappPhoneNumberId) {
      params.append('whatsappPhoneNumberId', filters.whatsappPhoneNumberId)
    }
    const queryString = params.toString()
    const response = await fetch(`${API_URL}/api/v1/dashboard/customer-insights${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch customer insights')
    }

    return result.data
  },

  async getQualityMetrics(filters?: { whatsappPhoneNumberId?: string }): Promise<QualityMetrics> {
    const params = new URLSearchParams()
    if (filters?.whatsappPhoneNumberId) {
      params.append('whatsappPhoneNumberId', filters.whatsappPhoneNumberId)
    }
    const queryString = params.toString()
    const response = await fetch(`${API_URL}/api/v1/dashboard/quality-metrics${queryString ? `?${queryString}` : ''}`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch quality metrics')
    }

    return result.data
  },
}
