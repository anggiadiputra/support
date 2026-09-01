"use client"

import { useCallback, useState, useTransition, type ReactNode, type ComponentProps } from "react"
import { Link, useRouter } from "@/i18n/routing"
import { usePrefetch, type PrefetchType } from "@/hooks/use-prefetch"

interface OptimizedLinkProps extends Omit<ComponentProps<typeof Link>, "href"> {
  href: string
  children: ReactNode
  /**
   * Type of data to prefetch on hover
   */
  prefetchType?: PrefetchType
  /**
   * Use router.push for instant navigation (skips full page load)
   * Default: true
   */
  useRouterNavigation?: boolean
  className?: string
}

/**
 * OptimizedLink - High-performance navigation component
 * 
 * Features:
 * 1. Prefetches page data on hover (React Query)
 * 2. Uses router.push for instant client-side navigation
 * 3. useTransition for non-blocking navigation
 * 4. Falls back to regular Link behavior if needed
 * 
 * This solves the slow navigation issue by:
 * - Pre-loading data before click
 * - Using client-side routing instead of full page navigation
 * - Not blocking UI during transition
 */
export function OptimizedLink({
  href,
  children,
  prefetchType,
  useRouterNavigation = true,
  className,
  onClick,
  ...props
}: OptimizedLinkProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const { prefetchDashboard, prefetchTemplates, prefetchCustomers } = usePrefetch()

  const handleMouseEnter = useCallback(() => {
    // Prefetch data based on type
    switch (prefetchType) {
      case "dashboard":
        void prefetchDashboard()
        break
      case "templates":
        void prefetchTemplates()
        break
      case "customers":
        void prefetchCustomers()
        break
    }
    
    // Also prefetch the route itself
    if (useRouterNavigation) {
      router.prefetch(href)
    }
  }, [prefetchType, prefetchDashboard, prefetchTemplates, prefetchCustomers, router, href, useRouterNavigation])

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      // Call original onClick if provided
      onClick?.(e)

      // If using router navigation, prevent default and use router.push
      if (useRouterNavigation && !e.defaultPrevented) {
        e.preventDefault()
        
        // Use startTransition for non-blocking navigation
        startTransition(() => {
          router.push(href)
        })
      }
    },
    [onClick, useRouterNavigation, router, href]
  )

  return (
    <Link
      href={href}
      onMouseEnter={handleMouseEnter}
      onClick={handleClick}
      className={className}
      data-pending={isPending ? "" : undefined}
      {...props}
    >
      {children}
    </Link>
  )
}
