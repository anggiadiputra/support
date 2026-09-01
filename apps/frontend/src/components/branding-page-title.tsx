"use client"

import { useEffect } from "react"
import { useBranding } from "@/hooks/use-branding"

interface BrandingPageTitleProps {
  suffix?: string
}

/**
 * Component to dynamically update page title with branding
 * Requirements: 3.1, 3.2 - Display configured website name in page title
 * 
 * Only updates title after branding data is loaded from API to prevent
 * flash of default value overwriting server-rendered title.
 */
export function BrandingPageTitle({ suffix }: BrandingPageTitleProps) {
  const { websiteName, isLoading } = useBranding()

  useEffect(() => {
    // Don't update title while loading - let server-rendered title stay
    if (isLoading) return
    
    const title = suffix ? `${suffix} | ${websiteName}` : websiteName
    document.title = title
  }, [websiteName, suffix, isLoading])

  return null
}
