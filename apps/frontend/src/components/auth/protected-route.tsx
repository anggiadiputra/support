"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/i18n/routing"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { RefreshCw } from "lucide-react"

interface ProtectedRouteProps {
  children: React.ReactNode
}

/**
 * ProtectedRoute - Guards routes requiring authentication
 * 
 * Optimized to not block navigation when session is cached:
 * - Uses cached session from React Query
 * - Only shows loading on initial load (not on navigation)
 * - Renders children immediately if session exists in cache
 */
export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const router = useRouter()
  const { isLoading: isLoadingAccount, isAuthenticated } = useBusinessAccount()
  const [hasMounted, setHasMounted] = useState(false)

  // Mark as mounted after first client-side render
  useEffect(() => {
    setHasMounted(true)
  }, [])

  useEffect(() => {
    // Redirect to login if not authenticated and not loading
    if (hasMounted && !isLoadingAccount && !isAuthenticated) {
      router.push("/login")
    }
  }, [hasMounted, isLoadingAccount, isAuthenticated, router])

  // Always render loading on server and initial client render to prevent hydration mismatch
  if (!hasMounted) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // After mount, show loading if still loading
  if (isLoadingAccount) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Show redirect message only if definitely not authenticated
  if (!isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Redirecting to login...</p>
        </div>
      </div>
    )
  }

  // User is authenticated, render children
  return <>{children}</>
}
