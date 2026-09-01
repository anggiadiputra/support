const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export interface WABADetails {
    id: string
    wabaId: string
    name: string
    timezone?: string
    currency?: string
    messageTemplateNamespace?: string
    connectionStatus?: string
    connectedAt?: string
    lastSyncAt?: string
    isManualLogin?: boolean
}

export interface ManualConnectResponse {
    waba: WABADetails & {
        isManualLogin: boolean
    }
    phoneNumbers: PhoneNumberDetails[]
    webhook: {
        url: string
        verifyToken: string
        instructions: string
    }
}

export interface WebhookInfoResponse {
    accountId: string
    wabaId: string
    wabaName: string
    webhook: {
        url: string
        verifyToken: string
        instructions: string[]
    }
}

export interface PhoneNumberDetails {
    id: string
    phoneNumberId: string
    displayPhoneNumber: string
    verifiedName?: string
    qualityRating?: 'GREEN' | 'YELLOW' | 'RED'
    messagingLimitTier?: string
    isVerified: boolean
    isPrimary: boolean
}

export interface SignupUrlResponse {
    signupUrl: string
    state: string
    expiresAt: string
    appId?: string
    configId?: string
}

export interface EmbeddedSignupInitResponse {
    appId: string
    configId: string
    state: string
}

export interface CallbackResponse {
    success: boolean
    waba: WABADetails & {
        isCoexistence?: boolean
    }
    phoneNumbers: PhoneNumberDetails[]
    coexistence?: {
        enabled: boolean
        syncStatus: string
        message: string
    }
    warnings?: Array<{
        type: string
        message: string
        recoveryAction?: string
    }>
}

export interface CoexistenceStatus {
    isOnBizApp: boolean
    platformType: string
    isCoexistence: boolean
}

export interface SyncStatus {
    isCoexistence: boolean
    syncStatus: string | null
    overallProgress: number
    contacts: {
        status: string
        progress: number
        completedAt: string | null
        error?: string
    }
    history: {
        status: string
        progress: number
        phase?: number
        completedAt: string | null
        consentGiven: boolean
        error?: string
    }
}

export const wabaApi = {
    async getAccounts(): Promise<WABADetails[]> {
        const response = await fetch(`${API_URL}/api/v1/waba/accounts`, {
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to fetch WhatsApp accounts')
        }

        const result = await response.json()
        return result.data || []
    },

    async initSignup(enableCoexistence = false): Promise<SignupUrlResponse> {
        const response = await fetch(`${API_URL}/api/v1/waba/signup/init`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ enableCoexistence }),
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to initialize WABA signup')
        }

        const result = await response.json()
        return result.data
    },

    async initEmbeddedSignup(enableCoexistence = false): Promise<EmbeddedSignupInitResponse> {
        const result = await this.initSignup(enableCoexistence)

        if (!result.appId || !result.configId) {
            throw new Error("Missing Meta embedded signup configuration")
        }

        return {
            appId: result.appId,
            configId: result.configId,
            state: result.state,
        }
    },

    async handleCallback(code: string, state: string): Promise<CallbackResponse> {
        // Use AbortController with longer timeout for WABA callback (can take up to 2 minutes)
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000) // 2 minutes

        try {
            const response = await fetch(
                `${API_URL}/api/v1/waba/signup/callback?code=${encodeURIComponent(
                    code
                )}&state=${encodeURIComponent(state)}`,
                {
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    signal: controller.signal,
                }
            )

            clearTimeout(timeoutId)

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(
                    error.error?.message || 'Failed to complete WABA connection'
                )
            }

            const result = await response.json()
            return result.data
        } catch (error) {
            clearTimeout(timeoutId)
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Connection timed out. Please refresh the page to check if connection was successful.')
            }
            throw error
        }
    },

    async exchangeEmbeddedSignupCode({
        code,
        state,
        providedWabaId,
    }: {
        code: string
        state: string
        providedWabaId?: string
    }): Promise<CallbackResponse> {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 120000)

        try {
            const response = await fetch(
                `${API_URL}/api/v1/waba/signup/callback?code=${encodeURIComponent(
                    code
                )}&state=${encodeURIComponent(state)}${providedWabaId ? `&providedWabaId=${encodeURIComponent(providedWabaId)}` : ''}`,
                {
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    signal: controller.signal,
                }
            )

            clearTimeout(timeoutId)

            if (!response.ok) {
                const error = await response.json().catch(() => ({}))
                throw new Error(
                    error.error?.message || 'Failed to complete WABA connection'
                )
            }

            const result = await response.json()
            return result.data
        } catch (error) {
            clearTimeout(timeoutId)
            if (error instanceof Error && error.name === 'AbortError') {
                throw new Error('Connection timed out. Please refresh the page to check if connection was successful.')
            }
            throw error
        }
    },

    async getPhoneNumbers(wabaId: string): Promise<PhoneNumberDetails[]> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/phone-numbers`,
            {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to fetch phone numbers')
        }

        const result = await response.json()
        return result.data || []
    },

    async disconnect(wabaId: string, reason?: string): Promise<void> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/disconnect`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ reason }),
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to disconnect WABA')
        }
    },

    async refreshToken(
        wabaId: string
    ): Promise<{ success: boolean; expiresAt: string }> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/refresh-token`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to refresh token')
        }

        const result = await response.json()
        return result.data
    },

    async syncPhoneNumbers(wabaId: string): Promise<{
        phoneNumbers: PhoneNumberDetails[]
        added: number
        deleted: number
        message: string
    }> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/phone-numbers/sync`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to sync phone numbers')
        }

        const result = await response.json()
        return result.data
    },

    // Coexistence methods
    async getCoexistenceStatus(wabaId: string): Promise<CoexistenceStatus> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/coexistence-status`,
            {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to get coexistence status')
        }

        const result = await response.json()
        return result.data
    },

    async getSyncStatus(wabaId: string): Promise<SyncStatus> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/sync-status`,
            {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to get sync status')
        }

        const result = await response.json()
        return result.data
    },

    async syncContacts(
        wabaId: string
    ): Promise<{ requestId: string; message: string }> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/sync-contacts`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to sync contacts')
        }

        const result = await response.json()
        return result.data
    },

    async syncHistory(
        wabaId: string
    ): Promise<{ requestId: string; message: string }> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/${wabaId}/sync-history`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to sync history')
        }

        const result = await response.json()
        return result.data
    },

    // Manual login methods
    async manualConnect(accessToken: string, wabaId: string): Promise<ManualConnectResponse> {
        const response = await fetch(`${API_URL}/api/v1/waba/manual/connect`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ accessToken, wabaId }),
        })

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to connect WABA')
        }

        const result = await response.json()
        return result.data
    },

    async getWebhookInfo(accountId: string): Promise<WebhookInfoResponse> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/manual/webhook-info/${accountId}`,
            {
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to get webhook info')
        }

        const result = await response.json()
        return result.data
    },

    async regenerateVerifyToken(accountId: string): Promise<{ webhook: { url: string; verifyToken: string; message: string } }> {
        const response = await fetch(
            `${API_URL}/api/v1/waba/manual/regenerate-verify-token/${accountId}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            }
        )

        if (!response.ok) {
            const error = await response.json().catch(() => ({}))
            throw new Error(error.error?.message || 'Failed to regenerate verify token')
        }

        const result = await response.json()
        return result.data
    },
}
