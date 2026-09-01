"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { useQuery } from "@tanstack/react-query"
import { formatDistanceToNow } from "date-fns"
import { id as idLocale, enUS } from "date-fns/locale"
import { useLocale } from "next-intl"
import {
  AlertCircle,
  AlertTriangle,
  Clock,
  Info,
  XCircle,
  MessageCircle,
} from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { WABAErrorDialog } from "./waba-error-dialog"
import { cn } from "@/lib/utils"

interface WABAStatusBannerProps {
  wabaId: string
}

interface AccountStatus {
  status: "ACTIVE" | "RESTRICTED" | "UNDER_REVIEW" | "FLAGGED" | "DISABLED"
  restrictionType: string | null
  errorCode: number | null
  errorMessage: string | null
  detectedAt: string
  detectedFrom: string
}

/**
 * WABAStatusBanner
 *
 * Displays a banner at the top of WABA settings page when the account
 * has health issues (restricted, under review, flagged, or disabled).
 */
export function WABAStatusBanner({ wabaId }: WABAStatusBannerProps) {
  const t = useTranslations("wabaHealth")
  const locale = useLocale()
  const [showErrorDialog, setShowErrorDialog] = useState(false)

  // Fetch health status
  const { data, isLoading } = useQuery({
    queryKey: ["waba-health", wabaId],
    queryFn: async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(`${apiUrl}/api/v1/waba/${wabaId}/health`, {
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to fetch health status")
      }
      const result = await response.json()
      return result.data as AccountStatus | null
    },
    enabled: !!wabaId,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchOnWindowFocus: false,
  })

  // Don't show banner if loading, no data, or status is ACTIVE
  if (isLoading || !data || data.status === "ACTIVE") {
    return null
  }

  // Get status-specific styling and icon
  const getStatusConfig = (status: AccountStatus["status"]) => {
    switch (status) {
      case "RESTRICTED":
        return {
          icon: XCircle,
          bgClass: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
          iconClass: "text-red-500",
          titleKey: "restricted" as const,
        }
      case "DISABLED":
        return {
          icon: XCircle,
          bgClass: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950",
          iconClass: "text-red-600",
          titleKey: "disabled" as const,
        }
      case "UNDER_REVIEW":
        return {
          icon: Clock,
          bgClass: "border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950",
          iconClass: "text-blue-500",
          titleKey: "underReview" as const,
        }
      case "FLAGGED":
        return {
          icon: AlertTriangle,
          bgClass: "border-yellow-200 bg-yellow-50 dark:border-yellow-900 dark:bg-yellow-950",
          iconClass: "text-yellow-600",
          titleKey: "flagged" as const,
        }
      default:
        return {
          icon: AlertCircle,
          bgClass: "border-muted",
          iconClass: "text-muted-foreground",
          titleKey: "flagged" as const,
        }
    }
  }

  const config = getStatusConfig(data.status)
  const Icon = config.icon

  // Format detected time
  const detectedTime = formatDistanceToNow(new Date(data.detectedAt), {
    addSuffix: true,
    locale: locale === "id" ? idLocale : enUS,
  })

  // Get restriction type label
  const restrictionLabel = data.restrictionType
    ? t(`restrictionTypes.${data.restrictionType}`)
    : null

  const handleContactAdmin = () => {
    window.open("/help-support", "_blank")
  }

  return (
    <>
      <Alert className={cn("mb-4", config.bgClass)}>
        <Icon className={cn("h-5 w-5", config.iconClass)} />
        <AlertTitle className="font-semibold">
          {t(`banner.title.${config.titleKey}`)}
        </AlertTitle>
        <AlertDescription className="mt-2 space-y-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="flex items-center gap-1">
              <span className="font-medium">{t(`status.${config.titleKey}`).toLowerCase()}</span>
            </span>
            <span className="text-muted-foreground">
              {t("banner.detectedAt", { time: detectedTime })}
            </span>
            {restrictionLabel && (
              <span className="text-muted-foreground">
                {t("banner.reason", { reason: restrictionLabel })}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowErrorDialog(true)}
            >
              <Info className="h-4 w-4 mr-1" />
              {t("banner.viewDetail")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleContactAdmin}
            >
              <MessageCircle className="h-4 w-4 mr-1" />
              {t("banner.contactAdmin")}
            </Button>
          </div>
        </AlertDescription>
      </Alert>

      <WABAErrorDialog
        open={showErrorDialog}
        onOpenChange={setShowErrorDialog}
        errorCode={data.errorCode}
        errorMessage={data.errorMessage}
      />
    </>
  )
}
