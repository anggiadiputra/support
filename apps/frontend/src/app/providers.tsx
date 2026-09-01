"use client"

import { useEffect, useState } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import SearchProvider from "@/components/search-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { BrandingProvider } from "@/components/branding-provider"
import { BrandingPageTitle } from "@/components/branding-page-title"
import { SessionWarmup } from "@/components/auth/session-warmup"
import { DEFAULT_CACHE_CONFIG } from "@/lib/cache-config"

interface Props {
  children: React.ReactNode
}

// Export queryClient for use in cache utilities (e.g., logout cleanup)
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Default stale time - data considered fresh for 5 minutes
      staleTime: DEFAULT_CACHE_CONFIG.staleTime,
      // Default garbage collection time - cache retained for 30 minutes
      gcTime: DEFAULT_CACHE_CONFIG.gcTime,
      // Retry logic with exponential backoff (3 retries)
      retry: 3,
      retryDelay: (attemptIndex) =>
        Math.min(1000 * Math.pow(2, attemptIndex), 30000),
      // Don't refetch on window focus to reduce unnecessary requests
      refetchOnWindowFocus: false,
      // Refetch when network reconnects
      refetchOnReconnect: true,
    },
    mutations: {
      // Retry mutations once on failure
      retry: 1,
    },
  },
})

export function Providers({ children }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener("keydown", down)
    return () => document.removeEventListener("keydown", down)
  }, [])

  return (
    <QueryClientProvider client={queryClient}>
      <SessionWarmup />
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <BrandingProvider>
          <BrandingPageTitle />
          <SearchProvider value={{ open, setOpen }}>{children}</SearchProvider>
        </BrandingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  )
}
