"use client"

import { useEffect, useRef, useState, useId } from "react"
import { ShieldCheck } from "lucide-react"
import { cn } from "@/lib/utils"

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback?: (token: string) => void
          "error-callback"?: (error?: any) => void
          "expired-callback"?: () => void
          theme?: "auto" | "light" | "dark"
          size?: "normal" | "compact" | "flexible"
        }
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
    onloadTurnstileCallback?: () => void
  }
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onError?: (error?: any) => void
  onExpire?: () => void
  theme?: "auto" | "light" | "dark"
  size?: "normal" | "compact" | "flexible"
  className?: string
}

const TURNSTILE_SCRIPT_ID = "cf-turnstile-script"
const TURNSTILE_SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"

/**
 * Skeleton Placeholder for Turnstile widget (prevents Layout Shift and provides smooth loading UX)
 */
export function TurnstileSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "relative flex h-[65px] w-full max-w-[300px] items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-4 py-2.5 shadow-xs transition-all dark:border-slate-800 dark:bg-slate-900/60 my-2 mx-auto overflow-hidden",
        className
      )}
    >
      {/* Animated shimmer overlay */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/40 to-transparent dark:via-white/5" />

      {/* Left checkbox & verifying text */}
      <div className="flex items-center gap-3">
        <div className="relative flex h-6 w-6 items-center justify-center rounded-md border border-slate-300 bg-slate-200/80 dark:border-slate-700 dark:bg-slate-800">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-slate-400 border-t-transparent dark:border-slate-500" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="h-3.5 w-32 rounded bg-slate-200 dark:bg-slate-800" />
          <div className="h-2.5 w-20 rounded bg-slate-200/60 dark:bg-slate-800/60" />
        </div>
      </div>

      {/* Right Cloudflare brand logo & privacy badge placeholder */}
      <div className="flex flex-col items-end gap-1 opacity-70">
        <div className="flex items-center gap-1">
          <ShieldCheck className="h-4 w-4 text-slate-400 dark:text-slate-500 animate-pulse" />
          <span className="text-[10px] font-semibold tracking-wider text-slate-400 dark:text-slate-500 uppercase">
            Turnstile
          </span>
        </div>
        <div className="h-2 w-10 rounded bg-slate-200/60 dark:bg-slate-800/60" />
      </div>
    </div>
  )
}

export function Turnstile({
  siteKey,
  onVerify,
  onError,
  onExpire,
  theme = "auto",
  size = "normal",
  className,
}: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | null>(null)
  const [isScriptLoaded, setIsScriptLoaded] = useState(false)
  const [isWidgetRendered, setIsWidgetRendered] = useState(false)
  const id = useId()
  const containerId = `turnstile-${id.replace(/:/g, "")}`

  // Keep latest callbacks in refs to avoid re-triggering render effect
  const onVerifyRef = useRef(onVerify)
  const onErrorRef = useRef(onError)
  const onExpireRef = useRef(onExpire)

  useEffect(() => {
    onVerifyRef.current = onVerify
    onErrorRef.current = onError
    onExpireRef.current = onExpire
  })

  // Load Cloudflare Turnstile script once
  useEffect(() => {
    if (typeof window === "undefined") return

    if (window.turnstile) {
      setIsScriptLoaded(true)
      return
    }

    const existingScript = document.getElementById(TURNSTILE_SCRIPT_ID)
    if (existingScript) {
      const checkLoaded = setInterval(() => {
        if (window.turnstile) {
          setIsScriptLoaded(true)
          clearInterval(checkLoaded)
        }
      }, 50)
      return () => clearInterval(checkLoaded)
    }

    const script = document.createElement("script")
    script.id = TURNSTILE_SCRIPT_ID
    script.src = TURNSTILE_SCRIPT_SRC
    script.async = true
    script.defer = true
    script.onload = () => {
      setIsScriptLoaded(true)
    }
    script.onerror = (e) => {
      console.error("Failed to load Cloudflare Turnstile script:", e)
      onErrorRef.current?.(e)
    }

    document.head.appendChild(script)
  }, [])

  // Render Turnstile widget when script and container are ready
  useEffect(() => {
    if (!isScriptLoaded || !window.turnstile || !containerRef.current || !siteKey) return

    // Clean up previous widget if exists
    if (widgetIdRef.current) {
      try {
        window.turnstile.remove(widgetIdRef.current)
      } catch {}
      widgetIdRef.current = null
      setIsWidgetRendered(false)
    }

    try {
      const widgetId = window.turnstile.render(containerRef.current, {
        sitekey: siteKey,
        theme,
        size,
        callback: (token: string) => {
          onVerifyRef.current?.(token)
        },
        "error-callback": (err: any) => {
          onErrorRef.current?.(err)
        },
        "expired-callback": () => {
          onExpireRef.current?.()
        },
      })
      widgetIdRef.current = widgetId
      setIsWidgetRendered(true)
    } catch (err) {
      console.error("Error rendering Turnstile widget:", err)
      onErrorRef.current?.(err)
    }

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {}
        widgetIdRef.current = null
        setIsWidgetRendered(false)
      }
    }
  }, [isScriptLoaded, siteKey, theme, size])

  if (!siteKey) return null

  return (
    <div className={cn("relative my-2 flex flex-col items-center justify-center", className)}>
      {/* Skeleton placeholder shown while script is loading or widget is rendering */}
      {!isWidgetRendered && (
        <TurnstileSkeleton />
      )}

      {/* Actual Turnstile container */}
      <div
        id={containerId}
        ref={containerRef}
        className={cn(
          "flex min-h-[65px] items-center justify-center transition-opacity duration-300",
          !isWidgetRendered ? "absolute -z-10 opacity-0 pointer-events-none" : "opacity-100"
        )}
      />
    </div>
  )
}
