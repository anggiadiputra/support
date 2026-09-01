import { useQuery } from "@tanstack/react-query"
import {
  brandingApi,
  DEFAULT_BRANDING,
  type BrandingSettings,
  type ExternalLink,
} from "@/lib/api/branding-api"

export interface UseBrandingReturn {
  branding: BrandingSettings
  websiteName: string
  logoUrl: string
  supportEmail: string
  supportWhatsapp: string
  termsUrl: string
  privacyUrl: string
  n8nPackageName: string
  externalLinks: ExternalLink[]
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Hook to fetch and cache branding settings
 * Requirements: 3.1, 4.1, 5.1
 * 
 * - Fetches from /api/v1/branding endpoint
 * - Caches for 60 seconds (staleTime)
 * - Returns defaults on error
 */
export function useBranding(): UseBrandingReturn {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["branding"],
    queryFn: brandingApi.get,
    staleTime: 60 * 1000, // 60 seconds cache
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const branding = data ?? DEFAULT_BRANDING

  return {
    branding,
    websiteName: branding.websiteName,
    logoUrl: branding.logoUrl,
    supportEmail: branding.supportEmail,
    supportWhatsapp: branding.supportWhatsapp,
    termsUrl: branding.termsUrl,
    privacyUrl: branding.privacyUrl,
    n8nPackageName: branding.n8nPackageName,
    externalLinks: branding.externalLinks || [],
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
