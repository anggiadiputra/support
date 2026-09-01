/**
 * Affiliate Hooks
 *
 * TanStack Query hooks for affiliate system: status, register, referrals, earnings.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { queryKeys } from "@/lib/query-keys"
import {
  affiliateApi,
  type AffiliateStatusData,
  type ReferralsData,
  type EarningsData,
  type ValidateCodeData,
} from "@/lib/api/affiliate-api"

// =============================================================================
// Query Hooks
// =============================================================================

/**
 * Hook to get affiliate status
 */
export function useAffiliateStatus() {
  return useQuery<AffiliateStatusData>({
    queryKey: queryKeys.affiliate.status(),
    queryFn: () => affiliateApi.getStatus(),
    staleTime: 30 * 1000, // 30 seconds
  })
}

/**
 * Hook to get referrals list
 */
export function useAffiliateReferrals(page: number = 1, limit: number = 10) {
  return useQuery<ReferralsData>({
    queryKey: queryKeys.affiliate.referrals(page, limit),
    queryFn: () => affiliateApi.getReferrals(page, limit),
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to get earnings
 */
export function useAffiliateEarnings(
  page: number = 1,
  limit: number = 10,
  status?: "PENDING" | "CREDITED" | "CANCELLED"
) {
  return useQuery<EarningsData>({
    queryKey: queryKeys.affiliate.earnings(page, limit, status),
    queryFn: () => affiliateApi.getEarnings(page, limit, status),
    staleTime: 30 * 1000,
  })
}

/**
 * Hook to validate referral code (public)
 */
export function useValidateReferralCode(code: string) {
  return useQuery<ValidateCodeData>({
    queryKey: queryKeys.affiliate.validate(code),
    queryFn: () => affiliateApi.validateCode(code),
    enabled: !!code && code.length >= 4,
    staleTime: 60 * 1000, // 1 minute
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

/**
 * Hook to register as affiliate
 */
export function useRegisterAffiliate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: () => affiliateApi.register(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.affiliate.all })
    },
  })
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Invalidate all affiliate queries
 */
export function invalidateAffiliateCache(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: queryKeys.affiliate.all })
}
