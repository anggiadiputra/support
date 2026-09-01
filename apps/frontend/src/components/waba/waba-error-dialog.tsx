"use client"

import { useTranslations } from "next-intl"
import { AlertCircle, ExternalLink, MessageCircle, X } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface WABAErrorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  errorCode?: number | null
  errorMessage?: string | null
}

/**
 * WABAErrorDialog
 *
 * Modal dialog that displays detailed error information and recovery steps
 * for WhatsApp Business API errors, especially account-level issues.
 */
export function WABAErrorDialog({
  open,
  onOpenChange,
  errorCode,
  errorMessage,
}: WABAErrorDialogProps) {
  const t = useTranslations("wabaHealth")

  // Get error-specific content or fallback to unknown
  const errorKey = errorCode ? String(errorCode) : "unknown"
  const hasSpecificError = ["131031", "368", "131048", "131049"].includes(
    errorKey
  )
  const finalErrorKey = hasSpecificError ? errorKey : "unknown"

  // Safely get translations with fallbacks
  const errorTitle = t(`errors.${finalErrorKey}.title`)
  const errorDescription = t(`errors.${finalErrorKey}.description`)

  // Get recovery steps as array
  let recoverySteps: string[] = []
  try {
    const rawSteps = t.raw(`errors.${finalErrorKey}.recovery`)
    recoverySteps = Array.isArray(rawSteps) ? rawSteps : []
  } catch {
    recoverySteps = []
  }


  // Determine severity for styling
  const isAccountLevel = errorCode === 131031 || errorCode === 368
  const isRateLimit = errorCode === 131048 || errorCode === 131049

  const handleContactAdmin = () => {
    // Open support/help page or trigger contact action
    // You can customize this to open a support modal, email, or help page
    window.open("/help-support", "_blank")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            {t("dialog.title")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {errorDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Error Code and Title */}
          <div
            className={cn(
              "rounded-lg border p-4",
              isAccountLevel && "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
              isRateLimit && "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950",
              !isAccountLevel && !isRateLimit && "border-muted bg-muted/50"
            )}
          >
            <div className="flex items-start gap-3">
              <AlertCircle
                className={cn(
                  "h-5 w-5 mt-0.5 shrink-0",
                  isAccountLevel && "text-red-500",
                  isRateLimit && "text-yellow-600",
                  !isAccountLevel && !isRateLimit && "text-muted-foreground"
                )}
              />
              <div className="space-y-1">
                <h4 className="font-medium">
                  {errorCode
                    ? t("dialog.errorTitle", { code: errorCode, title: errorTitle })
                    : errorTitle}
                </h4>
                <p className="text-sm text-muted-foreground">{errorDescription}</p>
                {errorMessage && errorMessage !== errorDescription && (
                  <p className="text-xs text-muted-foreground/70 mt-2 font-mono">
                    {errorMessage}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Recovery Steps */}
          {recoverySteps.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-sm font-medium">{t("dialog.recoveryTitle")}</h5>
              <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
                {recoverySteps.map((step, index) => (
                  <li key={index} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* WhatsApp Manager Link for account-level issues */}
          {isAccountLevel && (
            <a
              href="https://business.facebook.com/wa/manage/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-primary hover:underline"
            >
              <ExternalLink className="h-4 w-4" />
              Buka WhatsApp Manager
            </a>
          )}

          {/* Need Help Section */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900 dark:bg-blue-950">
            <div className="flex items-start gap-2">
              <MessageCircle className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700 dark:text-blue-300">
                {t("dialog.needHelp")}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleContactAdmin}
            className="w-full sm:w-auto"
          >
            <MessageCircle className="h-4 w-4 mr-2" />
            {t("dialog.contactAdmin")}
          </Button>
          <Button
            variant="default"
            onClick={() => onOpenChange(false)}
            className="w-full sm:w-auto"
          >
            {t("dialog.close")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
