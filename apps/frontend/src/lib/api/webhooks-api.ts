const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export type WebhookEventType =
  | 'message.received'
  | 'message.sent'
  | 'message.delivered'
  | 'message.read'
  | 'message.failed'

export type WebhookChannel = 'whatsapp' | 'instagram' | 'all'

export interface WebhookEndpoint {
  id: string
  name: string
  url: string
  secret?: string // Only returned on creation
  events: WebhookEventType[]
  channels: WebhookChannel[]
  channelAccountIds: string[]
  isActive: boolean
  failureCount: number
  lastFailedAt: string | null
  disabledAt: string | null
  disableReason: string | null
  createdAt: string
  updatedAt: string
}

export interface WebhookDeliveryLog {
  id: string
  eventId: string
  eventType: string
  responseStatus: number | null
  latencyMs: number | null
  attemptNumber: number
  status: string
  errorMessage: string | null
  createdAt: string
  nextRetryAt: string | null
}

export interface CreateWebhookInput {
  name: string
  url: string
  events: WebhookEventType[]
  channels: WebhookChannel[]
  channelAccountIds?: string[]
}

export interface UpdateWebhookInput {
  name?: string
  url?: string
  events?: WebhookEventType[]
  channels?: WebhookChannel[]
  channelAccountIds?: string[]
  isActive?: boolean
}

export interface TestWebhookResult {
  success: boolean
  statusCode?: number
  latencyMs?: number
  error?: string
}

export const webhooksApi = {
  async list(): Promise<WebhookEndpoint[]> {
    const response = await fetch(`${API_URL}/api/v1/settings/webhooks`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch webhooks')
    }

    return result.data
  },

  async create(input: CreateWebhookInput): Promise<WebhookEndpoint> {
    const response = await fetch(`${API_URL}/api/v1/settings/webhooks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    const result = await response.json()

    if (!result.success) {
      const errorMessage = result.error?.details
        ? result.error.details.map((d: any) => d.message).join(', ')
        : result.error?.message || 'Failed to create webhook'
      throw new Error(errorMessage)
    }

    return result.data
  },

  async update(id: string, input: UpdateWebhookInput): Promise<WebhookEndpoint> {
    const response = await fetch(`${API_URL}/api/v1/settings/webhooks/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    const result = await response.json()

    if (!result.success) {
      const errorMessage = result.error?.details
        ? result.error.details.map((d: any) => d.message).join(', ')
        : result.error?.message || 'Failed to update webhook'
      throw new Error(errorMessage)
    }

    return result.data
  },

  async delete(id: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/settings/webhooks/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to delete webhook')
    }
  },

  async test(id: string): Promise<TestWebhookResult> {
    const response = await fetch(`${API_URL}/api/v1/settings/webhooks/${id}/test`, {
      method: 'POST',
      credentials: 'include',
    })

    const result = await response.json()

    return {
      success: result.success,
      statusCode: result.data?.statusCode,
      latencyMs: result.data?.latencyMs,
      error: result.data?.error,
    }
  },

  async getLogs(id: string, limit = 50): Promise<WebhookDeliveryLog[]> {
    const response = await fetch(
      `${API_URL}/api/v1/settings/webhooks/${id}/logs?limit=${limit}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    )

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch delivery logs')
    }

    return result.data
  },
}
