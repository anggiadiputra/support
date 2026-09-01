/**
 * Credit Hooks
 *
 * TanStack Query hooks for credit system: balance, history, top-up.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '@/lib/query-keys'
import { creditApi, type CreditBalanceData, type CreditHistoryData, type TopUpPackagesData } from '@/lib/api/credit-api'

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Hook to get user's credit balance
 */
export function useCreditBalance() {
  return useQuery<CreditBalanceData>({
    queryKey: queryKeys.credit.balance(),
    queryFn: () => creditApi.getBalance(),
    staleTime: 0, // Always fresh for balance
    gcTime: 5 * 60 * 1000, // 5 minutes
  })
}

/**
 * Hook to get credit transaction history with pagination
 */
export function useCreditHistory(page: number = 1, limit: number = 10) {
  return useQuery<CreditHistoryData>({
    queryKey: queryKeys.credit.history(page, limit),
    queryFn: () => creditApi.getHistory(page, limit),
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Hook to get available top-up packages
 */
export function useTopUpPackages() {
  return useQuery<TopUpPackagesData>({
    queryKey: queryKeys.credit.packages(),
    queryFn: () => creditApi.getTopUpPackages(),
    staleTime: 30 * 60 * 1000, // 30 minutes (rarely changes)
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Hook to create top-up payment
 */
export function useCreateTopUp() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      amount,
      paymentMethod,
      locale,
    }: {
      amount: number
      paymentMethod: string
      locale: string
    }) => creditApi.createTopUp(amount, paymentMethod, locale),
    onSuccess: () => {
      // Invalidate balance after successful top-up creation
      // Note: Balance won't change until payment is completed (via callback)
    },
  })
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Invalidate all credit-related queries
 */
export function invalidateCreditCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.credit.all })
}

/**
 * Invalidate credit balance
 */
export function invalidateCreditBalance(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.credit.balance() })
}
