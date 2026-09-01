const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export interface WhatsAppAccountSummary {
  id: string
  wabaId: string
  wabaName?: string | null
  connectionStatus: string
  connectedAt?: string | null
  phoneNumberCount: number
}

export interface PhoneNumberDetails {
  id: string
  phoneNumberId: string
  displayPhoneNumber: string
  verifiedName?: string
  qualityRating?: "GREEN" | "YELLOW" | "RED" | null
  messagingLimitTier?: string | null
  isVerified: boolean
  isPrimary: boolean
  whatsappAccountId?: string | null
  // Registration status fields
  codeVerificationStatus?: "VERIFIED" | "NOT_VERIFIED" | "PENDING" | null
  accountMode?: "SANDBOX" | "LIVE" | null
  nameStatus?: "APPROVED" | "PENDING" | "DECLINED" | "EXPIRED" | "NONE" | null
  // Operational status from Meta API
  status?:
    | "PENDING"
    | "DELETED"
    | "MIGRATED"
    | "BANNED"
    | "RESTRICTED"
    | "RATE_LIMITED"
    | "FLAGGED"
    | "CONNECTED"
    | "DISCONNECTED"
    | "UNKNOWN"
    | "UNVERIFIED"
    | null
}

export interface WhatsAppAccountWithPhoneNumbers {
  id: string
  wabaId: string
  wabaName?: string | null
  connectionStatus: string
  connectedAt?: string | null
  lastSyncAt?: string | null
  isCoexistence?: boolean
  isManualLogin?: boolean
  messagingTier?: string | null
  phoneNumbers: {
    id: string
    phoneNumberId: string
    displayPhoneNumber: string
    verifiedName?: string | null
    qualityRating?: string | null
    messagingLimitTier?: string | null
    isVerified?: boolean
    isPrimary: boolean
    codeVerificationStatus?: string | null
    accountMode?: string | null
    nameStatus?: string | null
    status?: string | null
  }[]
}

export interface BusinessProfile {
  about: string | null
  address: string | null
  description: string | null
  email: string | null
  profilePictureUrl: string | null
  websites: string[]
  vertical: string | null
}

export interface PhoneNumberStats {
  messages: number
  sent: number
  received: number
  unread: number
  contacts: number
  chats: number
}

export interface WebhookInfo {
  accountId: string
  wabaId: string
  wabaName: string | null
  webhook: {
    url: string
    verifyToken: string
    instructions: string[]
  }
}

export const wabaApi = {
  async getAccounts(): Promise<WhatsAppAccountWithPhoneNumbers[]> {
    const response = await fetch(`${API_URL}/api/v1/waba/accounts`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to fetch accounts")
    }

    const result = await response.json()
    return result.data || []
  },

  async getPhoneNumbers(wabaId: string): Promise<PhoneNumberDetails[]> {
    const response = await fetch(`${API_URL}/api/v1/waba/${wabaId}/phone-numbers`, {
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to fetch phone numbers")
    }

    const result = await response.json()
    const data = result.data || []

    // Map backend response to frontend interface
    return data.map((item: any) => ({
      id: item.id,
      phoneNumberId: item.id, // Backend returns 'id' which is the phoneNumberId
      displayPhoneNumber: item.displayPhoneNumber,
      verifiedName: item.verifiedName,
      qualityRating: item.qualityRating,
      messagingLimitTier: item.messagingLimitTier,
      isVerified: item.isVerified,
      isPrimary: item.isPrimary,
      codeVerificationStatus: item.codeVerificationStatus,
      accountMode: item.accountMode,
      nameStatus: item.nameStatus,
      status: item.status,
    }))
  },

  async syncPhoneNumbers(wabaId: string): Promise<{
    phoneNumbers: PhoneNumberDetails[]
    added: number
    deleted: number
  }> {
    const response = await fetch(`${API_URL}/api/v1/waba/${wabaId}/phone-numbers/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to sync phone numbers")
    }

    const result = await response.json()
    const data = result.data

    // Map phone numbers to match interface
    return {
      phoneNumbers: (data.phoneNumbers || []).map((item: any) => ({
        id: item.id,
        phoneNumberId: item.id,
        displayPhoneNumber: item.displayPhoneNumber,
        verifiedName: item.verifiedName,
        qualityRating: item.qualityRating,
        messagingLimitTier: item.messagingLimitTier,
        isVerified: item.isVerified,
        isPrimary: item.isPrimary,
        codeVerificationStatus: item.codeVerificationStatus,
        accountMode: item.accountMode,
        nameStatus: item.nameStatus,
        status: item.status,
      })),
      added: data.added || 0,
      deleted: data.deleted || 0,
    }
  },

  async disconnect(wabaId: string, reason?: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/waba/${wabaId}/disconnect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ reason }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to disconnect WABA")
    }
  },

  async refreshToken(wabaId: string): Promise<{ success: boolean; expiresAt: string }> {
    const response = await fetch(`${API_URL}/api/v1/waba/${wabaId}/refresh-token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to refresh token")
    }

    const result = await response.json()
    return result.data
  },

  async setPrimaryPhoneNumber(wabaId: string, phoneNumberId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/waba/${wabaId}/phone-numbers/primary`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ phoneNumberId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to set primary phone number")
    }
  },

  async getBusinessProfile(wabaId: string, phoneNumberId: string): Promise<BusinessProfile> {
    const response = await fetch(
      `${API_URL}/api/v1/waba/${wabaId}/phone-numbers/${phoneNumberId}/profile`,
      {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to fetch business profile")
    }

    const result = await response.json()
    return result.data
  },

  async getPhoneNumberStats(wabaId: string): Promise<Record<string, PhoneNumberStats>> {
    const response = await fetch(
      `${API_URL}/api/v1/waba/${wabaId}/phone-numbers/stats`,
      {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to fetch phone number stats")
    }

    const result = await response.json()
    return result.data || {}
  },

  async getWebhookInfo(accountId: string): Promise<WebhookInfo> {
    const response = await fetch(
      `${API_URL}/api/v1/waba/manual/webhook-info/${accountId}`,
      {
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to fetch webhook info")
    }

    const result = await response.json()
    return result.data
  },

  async regenerateVerifyToken(accountId: string): Promise<{ webhook: { url: string; verifyToken: string; message: string } }> {
    const response = await fetch(
      `${API_URL}/api/v1/waba/manual/regenerate-verify-token/${accountId}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      }
    )

    if (!response.ok) {
      const error = await response.json().catch(() => ({}))
      throw new Error(error.error?.message || "Failed to regenerate verify token")
    }

    const result = await response.json()
    return result.data
  },
}

export function getTierInfo(tier?: string | null): { limit: string; color: string } {
  if (!tier) {
    return { limit: "Unknown", color: "text-gray-600" }
  }

  const tierMap: Record<string, { limit: string; color: string }> = {
    // Standard tier names from Meta
    TIER_1K: { limit: "1,000", color: "text-blue-600" },
    TIER_2K: { limit: "2,000", color: "text-blue-600" },
    TIER_10K: { limit: "10,000", color: "text-green-600" },
    TIER_100K: { limit: "100,000", color: "text-purple-600" },
    TIER_UNLIMITED: { limit: "Unlimited", color: "text-orange-600" },
    // Numeric tiers
    TIER_250: { limit: "250", color: "text-blue-600" },
    TIER_1000: { limit: "1,000", color: "text-blue-600" },
    TIER_2000: { limit: "2,000", color: "text-blue-600" },
    TIER_10000: { limit: "10,000", color: "text-green-600" },
    TIER_100000: { limit: "100,000", color: "text-purple-600" },
  }

  // If it's a standard tier, return from map
  if (tierMap[tier]) {
    return tierMap[tier]
  }

  // Handle TIER_XXX format (e.g., "TIER_250", "TIER_1000")
  if (tier.startsWith("TIER_")) {
    const numberPart = tier.replace("TIER_", "")

    // Handle K suffix (e.g., "1K", "10K")
    if (numberPart.endsWith("K")) {
      const numericValue = parseInt(numberPart.replace("K", "")) * 1000
      if (!isNaN(numericValue)) {
        return {
          limit: numericValue.toLocaleString(),
          color: numericValue >= 10000 ? "text-green-600" : "text-blue-600",
        }
      }
    }

    const numericTier = parseInt(numberPart)
    if (!isNaN(numericTier)) {
      return {
        limit: numericTier.toLocaleString(),
        color: numericTier >= 10000 ? "text-green-600" : "text-blue-600",
      }
    }
  }

  // If it's just a number (like "250"), format it with comma
  const numericTier = parseInt(tier)
  if (!isNaN(numericTier)) {
    return {
      limit: numericTier.toLocaleString(),
      color: numericTier >= 10000 ? "text-green-600" : "text-blue-600",
    }
  }

  // Fallback for unknown formats - show raw value
  return { limit: tier, color: "text-gray-600" }
}
