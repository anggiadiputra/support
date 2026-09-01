"use client"

/**
 * Admin Affiliate Hooks
 *
 * TanStack Query hooks for admin affiliate management.
 */
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import {
  adminAffiliateApi,
  type AdminAffiliatesData,
  type AdminCommissionsData,
  type AffiliateSettingsData,
} from "@/lib/api/admin-affiliate-api"

// =============================================================================
// Query Keys
// =============================================================================

export const adminAffiliateKeys = {
  all: ["admin-affiliate"] as const,
  affiliates: (params: {
    page?: number
    limit?: number
    search?: string
    isActive?: boolean
  }) => [...adminAffiliateKeys.all, "affiliates", params] as const,
  commissions: (params: {
    page?: number
    limit?: number
    status?: string
    affiliateId?: string
    search?: string
  }) => [...adminAffiliateKeys.all, "commissions", params] as const,
  settings: () => [...adminAffiliateKeys.all, "settings"] as const,
}

// =============================================================================
// Query Hooks
// =============================================================================

export function useAdminAffiliates(params: {
  page?: number
  limit?: number
  search?: string
  isActive?: boolean
}) {
  return useQuery<AdminAffiliatesData>({
    queryKey: adminAffiliateKeys.affiliates(params),
    queryFn: () => adminAffiliateApi.getAffiliates(params),
    staleTime: 30 * 1000,
  })
}

export function useAdminCommissions(params: {
  page?: number
  limit?: number
  status?: "PENDING" | "CREDITED" | "CANCELLED"
  affiliateId?: string
  search?: string
}) {
  return useQuery<AdminCommissionsData>({
    queryKey: adminAffiliateKeys.commissions(params),
    queryFn: () => adminAffiliateApi.getCommissions(params),
    staleTime: 30 * 1000,
  })
}

export function useAffiliateSettings() {
  return useQuery<AffiliateSettingsData>({
    queryKey: adminAffiliateKeys.settings(),
    queryFn: () => adminAffiliateApi.getSettings(),
    staleTime: 60 * 1000,
  })
}

// =============================================================================
// Mutation Hooks
// =============================================================================

export function useUpdateAffiliate() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string
      data: {
        tier?: string
        isActive?: boolean
        customCommission?: number | null
      }
    }) => adminAffiliateApi.updateAffiliate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminAffiliateKeys.all })
    },
  })
}

export function useReleaseCommission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => adminAffiliateApi.releaseCommission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminAffiliateKeys.all })
    },
  })
}

export function useCancelCommission() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => adminAffiliateApi.cancelCommission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminAffiliateKeys.all })
    },
  })
}

export function useUpdateAffiliateSettings() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: Partial<AffiliateSettingsData>) =>
      adminAffiliateApi.updateSettings(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: adminAffiliateKeys.settings() })
    },
  })
}
