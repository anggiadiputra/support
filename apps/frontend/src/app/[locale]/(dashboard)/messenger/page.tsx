"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { messengerApi, type FacebookPage } from "@/lib/api/messenger"
import { RoleGuard } from "@/components/auth/role-guard"
import { MessengerConnectCard, MessengerPageCard } from "./components"
import { IconBrandFacebook, IconPlus } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useSubscription } from "@/hooks/use-subscription"
import { useRouter } from "@/i18n/routing"
import { useToast } from "@/hooks/use-toast"

export default function MessengerPage() {
  const { userId, isLoading: sessionLoading } = useBusinessAccount()
  const router = useRouter()
  const { toast } = useToast()
  const { getChannelUsageText, canAddChannel, refetch: refetchSubscription } = useSubscription()
  const [pages, setPages] = useState<FacebookPage[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const hasConnectedPages = pages.some(p => p.connectionStatus === "connected")
  const hasReauthPages = pages.some(p => p.connectionStatus === "requires_reauth")

  useEffect(() => {
    if (userId) {
      loadMessengerData()
    }
  }, [userId])

  const loadMessengerData = async () => {
    setLoading(true)
    setError(null)
    try {
      const pagesData = await messengerApi.getPages()
      setPages(pagesData)
      // Refetch subscription to update channel usage
      refetchSubscription()
    } catch (err: any) {
      console.error("Error loading Messenger data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    if (!canAddChannel("messengerAccounts")) {
      toast({
        title: "Batas Halaman Tercapai",
        description: `Anda telah mencapai batas maksimum halaman Messenger (${getChannelUsageText("messengerAccounts")}) untuk paket Anda. Silakan upgrade paket untuk menambah halaman.`,
        variant: "destructive",
      })
      router.push("/subscription")
      return
    }

    try {
      const { url } = await messengerApi.getAuthUrl()

      // Open OAuth in popup window
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        url,
        "Facebook OAuth",
        `width=${width},height=${height},left=${left},top=${top},toolbar=no,location=no,status=no,menubar=no,scrollbars=yes,resizable=yes`
      )

      if (!popup) {
        setError("Pop-up was blocked. Please allow pop-ups for this site and try again.")
        return
      }

      // Listen for OAuth callback result
      const handleMessage = (event: MessageEvent) => {
        // Validate origin for security
        if (event.origin !== window.location.origin) return

        const { type, success, error: errorMsg } = event.data

        if (type === "messenger-oauth-result") {
          window.removeEventListener("message", handleMessage)

          if (success) {
            // Reload Messenger data after successful connection
            loadMessengerData()
          } else {
            // Show error from OAuth flow
            setError(errorMsg || "Failed to connect Facebook Page")
          }
        }
      }

      window.addEventListener("message", handleMessage)

      // Cleanup listener if popup is closed manually
      const checkPopupClosed = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkPopupClosed)
          window.removeEventListener("message", handleMessage)
        }
      }, 500)
    } catch (err: any) {
      console.error("Error getting auth URL:", err)
      setError(err.message)
    }
  }

  const handleDisconnect = async (pageId: string) => {
    try {
      await messengerApi.disconnectPage(pageId)
      // Reload data after disconnect
      loadMessengerData()
    } catch (err: any) {
      console.error("Error disconnecting page:", err)
      setError(err.message)
    }
  }

  if (sessionLoading || loading) {
    return (
      <>
        <Header />
        <div className="p-5 md:p-8 space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="bg-muted h-8 w-64 rounded"></div>
            <div className="bg-muted h-48 w-full rounded"></div>
          </div>
        </div>
      </>
    )
  }

  return (
    <RoleGuard>
      <Header />
      <div className="p-5 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
              <IconBrandFacebook className="h-6 w-6 text-[#1877F2]" />
              Facebook Messenger
            </h2>
            <p className="text-sm text-gray-500">
              Connect your Facebook Pages to manage Messenger conversations
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-gray-50 text-gray-700 border-gray-200">
              {getChannelUsageText("messengerAccounts")}
            </Badge>
            {hasConnectedPages && (
              <Button 
                size="sm"
                onClick={handleConnect}
                className="bg-black text-white hover:bg-gray-800 shadow-sm rounded-lg font-semibold"
              >
                <IconPlus className="h-4 w-4 mr-1.5" />
                Add Another Page
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Connect Card (if no connected pages) */}
        {!hasConnectedPages && (
          <div className="max-w-2xl">
            <MessengerConnectCard 
              onConnect={handleConnect}
              requiresReauth={hasReauthPages}
              disabled={!canAddChannel("messengerAccounts")}
            />
          </div>
        )}

        {/* Connected Pages */}
        {pages.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Connected Pages</h3>
            <div className="grid gap-4">
              {pages.map((page) => (
                <MessengerPageCard
                  key={page.id}
                  page={page}
                  onRefresh={loadMessengerData}
                  onDisconnect={handleDisconnect}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
