"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowLeft, Home, RotateCcw } from "lucide-react"

import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { ErrorMascot } from "@/components/mascot"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function Error({ error, reset }: ErrorProps) {
  const router = useRouter()
  const t = useTranslations("errors")

  // Log error for monitoring/debugging
  useEffect(() => {
    // Log to console (can be replaced with error tracking service like Sentry)
    console.error("[App Error]", {
      message: error.message,
      digest: error.digest,
      ...(process.env.NODE_ENV === "development" && { stack: error.stack }),
    })
  }, [error])

  return (
    <div className="flex min-h-svh w-full items-center justify-center bg-background p-4">
      <div className="mx-auto flex max-w-md flex-col items-center text-center">
        {/* Mascot */}
        <ErrorMascot size={140} className="mb-4" />

        {/* Title */}
        <h1 className="text-2xl font-bold text-foreground">
          {t("appError")}
        </h1>

        {/* Description */}
        <p className="mt-2 text-muted-foreground">
          {t("genericError")}
        </p>

        {/* Error Digest (for debugging) */}
        {error.digest && process.env.NODE_ENV === "development" && (
          <div className="mt-4 rounded-md bg-muted px-3 py-2">
            <code className="text-xs text-muted-foreground">
              Error ID: {error.digest}
            </code>
          </div>
        )}

        {/* Actions */}
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            {t("goBack")}
          </Button>
          <Button variant="secondary" onClick={reset}>
            <RotateCcw className="h-4 w-4" />
            {t("tryAgain")}
          </Button>
          <Button asChild>
            <Link href="/">
              <Home className="h-4 w-4" />
              {t("goHome")}
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
