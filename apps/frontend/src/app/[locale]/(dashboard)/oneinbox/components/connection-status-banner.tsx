"use client"

import { useState, useEffect } from "react"
import { Link } from "@/i18n/routing"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { IconBrandWhatsapp, IconBrandInstagram, IconAlertTriangle, IconX } from "@tabler/icons-react"

interface ConnectionStatusBannerProps {
  whatsappConnected: boolean
  instagramConnected: boolean | null
}

export function ConnectionStatusBanner({
  whatsappConnected,
  instagramConnected,
}: ConnectionStatusBannerProps) {
  const [dismissedBanners, setDismissedBanners] = useState<Set<string>>(new Set())

  // Load dismissed banners from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem("oneinbox-dismissed-banners")
    if (stored) {
      try {
        setDismissedBanners(new Set(JSON.parse(stored)))
      } catch (e) {
        // Ignore parse errors
      }
    }
  }, [])

  // Save dismissed banners to localStorage
  const dismissBanner = (bannerId: string) => {
    const newDismissed = new Set(dismissedBanners)
    newDismissed.add(bannerId)
    setDismissedBanners(newDismissed)
    localStorage.setItem("oneinbox-dismissed-banners", JSON.stringify(Array.from(newDismissed)))
  }

  const bothDisconnected = !whatsappConnected && instagramConnected === false

  // If both are connected, don't show anything
  if (whatsappConnected && instagramConnected === true) {
    return null
  }

  // If both are disconnected, show setup prompt
  if (bothDisconnected) {
    return (
      <Alert variant="destructive" className="mx-4 mt-4">
        <IconAlertTriangle className="h-4 w-4" />
        <AlertDescription className="flex flex-col gap-3">
          <span>No messaging channels connected. Connect at least one channel to start receiving messages.</span>
          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/waba">
                <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                Connect WhatsApp
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="gap-1.5">
              <Link href="/instagram">
                <IconBrandInstagram className="h-4 w-4 text-pink-500" />
                Connect Instagram
              </Link>
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="flex flex-col gap-2 mx-4 mt-4">
      {/* WhatsApp not connected */}
      {!whatsappConnected && !dismissedBanners.has("whatsapp") && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-800 dark:text-amber-200">
              WhatsApp not connected. Some messages may not appear.
            </span>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href="/waba">
                  Connect
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissBanner("whatsapp")}
                className="h-8 w-8 p-0"
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Instagram not connected */}
      {instagramConnected === false && !dismissedBanners.has("instagram") && (
        <Alert className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
          <IconBrandInstagram className="h-4 w-4 text-pink-500" />
          <AlertDescription className="flex items-center justify-between">
            <span className="text-amber-800 dark:text-amber-200">
              Instagram not connected. Some messages may not appear.
            </span>
            <div className="flex items-center gap-2">
              <Button asChild size="sm" variant="outline" className="gap-1.5">
                <Link href="/instagram">
                  Connect
                </Link>
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => dismissBanner("instagram")}
                className="h-8 w-8 p-0"
              >
                <IconX className="h-4 w-4" />
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  )
}
