/**
 * usePaymentHistory Hook
 * Fetches payment history from API with pagination support
 * Requirements: 8.1, 8.5
 */

import { useState, useEffect, useCallback } from 'react'
import { useToast } from '@/hooks/use-toast'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'
export type PaymentMethod = 'QRIS' | 'SHOPEEPAY'

export interface PaymentHistoryItem {
  id: string
  orderId: string
  amount: number
  paymentMethod: PaymentMethod
  targetTier: string
  status: PaymentStatus
  createdAt: string
  paidAt: string | null
}

export interface PaginationInfo {
  total: number
  page: number
  limit: number
  totalPages: number
}

interface UsePaymentHistoryReturn {
  transactions: PaymentHistoryItem[]
  pagination: PaginationInfo | null
  loading: boolean
  error: string | null
  page: number
  setPage: (page: number) => void
  refetch: () => Promise<void>
  checkStatus: (orderId: string) => Promise<void>
}

export function usePaymentHistory(initialLimit = 10): UsePaymentHistoryReturn {
  const [transactions, setTransactions] = useState<PaymentHistoryItem[]>([])
  const [pagination, setPagination] = useState<PaginationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const { toast } = useToast()

  const fetchHistory = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `${API_URL}/api/v1/payment/history?page=${page}&limit=${initialLimit}`,
        {
          method: 'GET',
          credentials: 'include',
        }
      )

      if (!response.ok) {
        throw new Error('Failed to fetch payment history')
      }

      const result = await response.json()
      
      if (result.success && result.data) {
        setTransactions(result.data.transactions)
        setPagination(result.data.pagination)
      } else {
        setTransactions([])
        setPagination(null)
      }
    } catch (err) {
      console.error('Failed to fetch payment history:', err)
      setError('Gagal memuat riwayat pembayaran')
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Gagal memuat riwayat pembayaran',
      })
    } finally {
      setLoading(false)
    }
  }, [page, initialLimit, toast])

  const refetch = useCallback(async () => {
    await fetchHistory()
  }, [fetchHistory])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  const checkStatus = useCallback(async (orderId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/v1/payment/status/${orderId}`, {
        method: 'GET',
        credentials: 'include',
      })
      
      const result = await response.json()
      
      if (result.success) {
        // Refresh history if status changed
        const currentTx = transactions.find(t => t.orderId === orderId)
        if (currentTx && currentTx.status !== result.data.status) {
          toast({
            title: 'Status Diperbarui',
            description: `Pembayaran ${result.data.status === 'COMPLETED' ? 'Berhasil' : result.data.status}`,
          })
          fetchHistory()
        } else {
           toast({
            title: 'Status Belum Berubah',
            description: 'Pembayaran masih menunggu konfirmasi',
          })
        }
      }
    } catch (err) {
      console.error('Failed to check status:', err)
      toast({
        variant: 'destructive',
        title: 'Error',
        description: 'Gagal mengecek status pembayaran',
      })
    }
  }, [transactions, fetchHistory, toast])

  return {
    transactions,
    pagination,
    loading,
    error,
    page,
    setPage,
    refetch,
    checkStatus,
  }
}
