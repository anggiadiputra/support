"use client"

import { useEffect, useState } from "react"
import { useRouter, usePathname } from "@/i18n/routing"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { useToast } from "@/hooks/use-toast"
import { useTranslations } from "next-intl"
import { RefreshCw } from "lucide-react"

// Routes that are restricted for agents
const RESTRICTED_ROUTES = [
  "/settings",
  "/templates",
  "/waba",
  "/instagram",
  "/messenger",
  "/subscription",
  "/developers",
  "/ai",
  "/team",
  "/insights",
]

interface RoleGuardProps {
  children: React.ReactNode
  allowedRoles?: string[]
}

/**
 * Component to guard routes based on user role.
 * Redirects agents to /oneinbox if they try to access restricted routes.
 */
export function RoleGuard({ children, allowedRoles = ["BUSINESS_OWNER", "ADMIN", "AGENT"] }: RoleGuardProps) {
  const router = useRouter()
  const pathname = usePathname()
  const { userRole, isLoading } = useBusinessAccount()
  const { toast } = useToast()
  const t = useTranslations("errors")
  const [isChecking, setIsChecking] = useState(true)

  useEffect(() => {
    if (isLoading) return

    const isAgent = userRole === "AGENT"
    const isRestricted = RESTRICTED_ROUTES.some(route => pathname.startsWith(route))

    if (isAgent && isRestricted) {
      toast({
        variant: "destructive",
        title: t("accessDenied"),
        description: t("accessDeniedDescription"),
      })
      router.replace("/oneinbox")
    } else {
      setIsChecking(false)
    }
  }, [userRole, isLoading, pathname, router, toast, t])

  if (isLoading || isChecking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  // Check if user role is allowed
  if (userRole && !allowedRoles.includes(userRole)) {
    return null // Will be redirected by useEffect
  }

  return <>{children}</>
}

/**
 * Hook to check if current user can access a route
 */
export function useRoleAccess() {
  const { userRole, isLoading } = useBusinessAccount()

  const canAccess = (route: string): boolean => {
    if (isLoading) return false
    if (userRole === "AGENT") {
      return !RESTRICTED_ROUTES.some(r => route.startsWith(r))
    }
    return true
  }

  const isAgent = userRole === "AGENT"
  const isBusinessOwner = userRole === "BUSINESS_OWNER"
  const isAdmin = userRole === "ADMIN"

  return {
    canAccess,
    isAgent,
    isBusinessOwner,
    isAdmin,
    isLoading,
  }
}
