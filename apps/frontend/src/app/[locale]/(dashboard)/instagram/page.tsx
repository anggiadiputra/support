"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { instagramApi, type InstagramAccount } from "@/lib/api/instagram"
import { DisconnectModal } from "@/components/disconnect-modal"
import { RoleGuard } from "@/components/auth/role-guard"
import { InstagramConnectionCard, InstagramConnectCard } from "./components"
import { IconBrandInstagram, IconPlus } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useSubscription } from "@/hooks/use-subscription"

export default function InstagramPage() {
  const { userId, isLoading: sessionLoading } = useBusinessAccount()
  const { getChannelUsageText, canAddChannel, refetch: refetchSubscription } = useSubscription()
  const [accounts, setAccounts] = useState<InstagramAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Filter only connected accounts for display
  const connectedAccounts = accounts.filter(a => a.connectionStatus === "connected")
  const hasConnectedAccounts = connectedAccounts.length > 0
  const hasReauthAccounts = accounts.some(a => a.connectionStatus === "requires_reauth")
  
  // Get selected account for disconnect modal
  const selectedAccount = accounts.find(a => a.id === selectedAccountId) || null

  useEffect(() => {
    if (userId) {
      loadInstagramData()
    }
  }, [userId])

  const loadInstagramData = async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await instagramApi.getConnectionStatus()
      setAccounts(status.accounts || [])
      // Refetch subscription to update channel usage
      refetchSubscription()
    } catch (err: any) {
      console.error("Error loading Instagram data:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    try {
      const { url } = await instagramApi.getAuthUrl()

      // Open OAuth in popup window
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2

      const popup = window.open(
        url,
        "Instagram OAuth",
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

        const { type, success, username, error: errorMsg } = event.data

        if (type === "instagram-oauth-result") {
          window.removeEventListener("message", handleMessage)

          if (success) {
            // Reload Instagram data after successful connection
            loadInstagramData()
          } else {
            // Show error from OAuth flow
            setError(errorMsg || "Failed to connect Instagram account")
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

  const handleOpenDisconnectModal = (accountId: string) => {
    setSelectedAccountId(accountId)
    setDisconnectModalOpen(true)
  }

  const handleDisconnect = async (mode: "soft" | "hard") => {
    if (!selectedAccountId) return
    try {
      setDisconnecting(true)
      await instagramApi.disconnect(mode, selectedAccountId)
      setDisconnectModalOpen(false)
      setSelectedAccountId(null)
      // Reload accounts after disconnect
      loadInstagramData()
    } catch (err: any) {
      console.error("Error disconnecting:", err)
      setError(err.message)
    } finally {
      setDisconnecting(false)
    }
  }

  if (sessionLoading || loading) {
    return (
      <>
        <Header />
        <div className="space-y-4 p-4">
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
      <div className="space-y-6 p-4">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <IconBrandInstagram className="h-7 w-7" />
              Instagram Direct Messages
            </h2>
            <p className="text-muted-foreground">
              Connect your Instagram Professional account to manage DMs
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-sm">
              {getChannelUsageText("instagramAccounts")}
            </Badge>
            {hasConnectedAccounts && canAddChannel("instagramAccounts") && (
              <Button size="sm" onClick={handleConnect}>
                <IconPlus className="h-4 w-4" />
                Add Account
              </Button>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
            {error}
          </div>
        )}

        {/* Connect Card (if no connected accounts) */}
        {!hasConnectedAccounts && (
          <div className="max-w-2xl">
            <InstagramConnectCard 
              onConnect={handleConnect}
              requiresReauth={hasReauthAccounts}
              disabled={!canAddChannel("instagramAccounts")}
            />
          </div>
        )}

        {/* Connected Accounts */}
        {connectedAccounts.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Connected Accounts</h3>
            <div className="grid gap-4">
              {connectedAccounts.map((account) => (
                <InstagramConnectionCard
                  key={account.id}
                  account={account}
                  onRefresh={loadInstagramData}
                  onDisconnect={() => handleOpenDisconnectModal(account.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Disconnect Modal */}
        <DisconnectModal
          isOpen={disconnectModalOpen}
          onClose={() => setDisconnectModalOpen(false)}
          channel="instagram"
          onConfirm={handleDisconnect}
          isLoading={disconnecting}
        />
      </div>
    </RoleGuard>
  )
}
