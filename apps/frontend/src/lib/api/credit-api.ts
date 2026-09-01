/**
 * Credit API Client
 *
 * API client for credit system endpoints: balance, history, top-up.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

// =============================================================================
// Types
// =============================================================================

export interface CreditBalanceData {
  balance: number
  lastUpdated: string
}

export interface CreditTransaction {
  id: string
  type: CreditTransactionType
  amount: number
  balanceBefore: number
  balanceAfter: number
  orderId: string | null
  createdAt: string
}

export type CreditTransactionType =
  | 'TOP_UP'
  | 'PAYMENT_USED'
  | 'PRORATE_EXCESS'
  | 'ADMIN_ADJUSTMENT'
  | 'REFUND'
  | 'AUTO_RENEWAL'
  | 'AFFILIATE_COMMISSION'

export interface CreditHistoryData {
  transactions: CreditTransaction[]
  pagination: {
    total: number
    page: number
    limit: number
    totalPages: number
  }
}

export interface TopUpPackage {
  amount: number
}

export interface TopUpPackagesData {
  packages: TopUpPackage[]
}

export interface TopUpPaymentData {
  orderId: string
  amount: number
  qrString: string | null
  qrUrl: string | null
  vaNumber: string | null
  expiresAt: string
  paymentUrl?: string
}

// =============================================================================
// API Functions
// =============================================================================

export const creditApi = {
  /**
   * Get user's current credit balance
   */
  async getBalance(): Promise<CreditBalanceData> {
    const response = await fetch(`${API_URL}/api/v1/credit/balance`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch credit balance')
    }

    return result.data
  },

  /**
   * Get credit transaction history with pagination
   */
  async getHistory(page: number = 1, limit: number = 10): Promise<CreditHistoryData> {
    const response = await fetch(
      `${API_URL}/api/v1/credit/history?page=${page}&limit=${limit}`,
      {
        method: 'GET',
        credentials: 'include',
      }
    )

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch credit history')
    }

    return result.data
  },

  /**
   * Get available top-up packages
   */
  async getTopUpPackages(): Promise<TopUpPackagesData> {
    const response = await fetch(`${API_URL}/api/v1/credit/topup/packages`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to fetch top-up packages')
    }

    return result.data
  },

  /**
   * Create a top-up payment transaction
   */
  async createTopUp(
    amount: number,
    paymentMethod: string,
    locale: string = 'en'
  ): Promise<TopUpPaymentData> {
    const response = await fetch(`${API_URL}/api/v1/credit/topup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ amount, paymentMethod, locale }),
    })

    const result = await response.json()

    if (!result.success) {
      throw new Error(result.error?.message || 'Failed to create top-up payment')
    }

    return result.data
  },
}
