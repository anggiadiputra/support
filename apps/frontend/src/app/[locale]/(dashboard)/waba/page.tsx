"use client"

import { useEffect, useState } from "react"
import { Header } from "@/components/layout/header"
import { WABAConnectCard } from "./components/waba-connect-card"
import { DisconnectModal } from "@/components/disconnect-modal"
import { useBusinessAccount } from "@/hooks/use-business-account"
import {
  wabaApi,
  type WhatsAppAccountWithPhoneNumbers,
  type PhoneNumberStats,
} from "@/lib/api/waba"
import { RoleGuard } from "@/components/auth/role-guard"
import { WABAStatusBanner } from "@/components/waba/waba-status-banner"
import { DeviceInfoCard } from "@/components/waba/device-info-card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  IconPlus,
  IconX,
} from "@tabler/icons-react"
import { useSubscription } from "@/hooks/use-subscription"
import { useRouter } from "@/i18n/routing"
import { useToast } from "@/hooks/use-toast"

export default function WABAPage() {
  const { isLoading } = useBusinessAccount()
  const router = useRouter()
  const { toast } = useToast()
  const { getChannelUsageText, canAddChannel, refetch: refetchSubscription } = useSubscription()
  const [accounts, setAccounts] = useState<WhatsAppAccountWithPhoneNumbers[]>([])
  const [loading, setLoading] = useState(false)
  const [disconnectModalOpen, setDisconnectModalOpen] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [selectedWabaId, setSelectedWabaId] = useState<string | null>(null)
  const [showAddAccount, setShowAddAccount] = useState(false)

  // Stats per phone number (keyed by phoneNumberId)
  const [allStats, setAllStats] = useState<Record<string, PhoneNumberStats>>({})

  const loadAccounts = async () => {
    setLoading(true)
    try {
      const data = await wabaApi.getAccounts()
      setAccounts(data)
      // Refetch subscription to update channel usage
      refetchSubscription()
    } catch (error: any) {
      console.error("Error loading accounts:", error)
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async (accountsList: WhatsAppAccountWithPhoneNumbers[]) => {
    const connected = accountsList.filter((a) => a.connectionStatus === "connected")
    for (const account of connected) {
      try {
        const stats = await wabaApi.getPhoneNumberStats(account.wabaId)
        setAllStats((prev) => ({ ...prev, ...stats }))
      } catch {
        // Stats are optional, silently fail
      }
    }
  }

  useEffect(() => {
    if (!isLoading) {
      loadAccounts()
    }
  }, [isLoading])

  useEffect(() => {
    if (accounts.length > 0) {
      loadStats(accounts)
    }
  }, [accounts])

  const handleAddAccountClick = () => {
    if (showAddAccount) {
      setShowAddAccount(false)
      return
    }

    if (!canAddChannel("whatsappDevices")) {
      toast({
        title: "Batas Akun Tercapai",
        description: `Anda telah mencapai batas maksimum akun WhatsApp (${getChannelUsageText("whatsappDevices")}) untuk paket Anda. Silakan upgrade paket untuk menambah akun.`,
        variant: "destructive",
      })
      router.push("/subscription")
      return
    }

    setShowAddAccount(true)
  }

  const handleRefresh = async (wabaId: string) => {
    try {
      await wabaApi.syncPhoneNumbers(wabaId)
      await loadAccounts()
    } catch (error: any) {
      console.error("Error syncing:", error)
    }
  }

  const handleSetPrimary = async (wabaId: string, phoneNumberId: string) => {
    try {
      await wabaApi.setPrimaryPhoneNumber(wabaId, phoneNumberId)
      await loadAccounts()
    } catch (error: any) {
      console.error("Failed to set primary phone number", error)
    }
  }

  const handleOpenDisconnectModal = (wabaId: string) => {
    setSelectedWabaId(wabaId)
    setDisconnectModalOpen(true)
  }

  const handleDisconnect = async (mode: "soft" | "hard") => {
    if (!selectedWabaId) return

    try {
      setDisconnecting(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(`${apiUrl}/api/v1/waba/${selectedWabaId}/disconnect`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      })

      const result = await response.json().catch(() => ({}))

      if (response.ok) {
        setDisconnectModalOpen(false)
        setSelectedWabaId(null)
        await loadAccounts()
      } else {
        console.error("Failed to disconnect WABA:", result)
        alert(`Failed to disconnect: ${result.error?.message || "Unknown error"}`)
      }
    } catch (error) {
      console.error("Error disconnecting WABA:", error)
      alert("An error occurred while disconnecting. Please try again.")
    } finally {
      setDisconnecting(false)
    }
  }

  if (isLoading || loading) {
    return (
      <>
        <Header />
        <div className="p-5 md:p-8 space-y-6">
          <div className="animate-pulse space-y-4">
            <div className="bg-muted h-8 w-64 rounded"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="bg-muted h-72 rounded-lg"></div>
              ))}
            </div>
          </div>
        </div>
      </>
    )
  }

  const connectedAccounts = accounts.filter((a) => a.connectionStatus === "connected")
  // Flatten: one card per phone number
  const allPhoneCards = connectedAccounts.flatMap((account) =>
    account.phoneNumbers.map((pn) => ({ account, phoneNumber: pn }))
  )

  return (
    <RoleGuard>
      <Header />
      <div className="p-5 md:p-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              WhatsApp Business Accounts
            </h2>
            <p className="text-sm text-gray-500">
              Manage your WABA connections and phone numbers
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="outline" className="text-xs font-semibold px-2.5 py-1 bg-gray-50 text-gray-700 border-gray-200">
              {getChannelUsageText("whatsappDevices")}
            </Badge>
            <Button 
              size="sm"
              onClick={handleAddAccountClick}
              className={showAddAccount ? "bg-gray-100 text-gray-800 hover:bg-gray-200 rounded-lg font-semibold" : "bg-black text-white hover:bg-gray-800 shadow-sm rounded-lg font-semibold"}
            >
              {showAddAccount ? (
                <>
                  <IconX className="h-4 w-4 mr-1.5" />
                  Cancel
                </>
              ) : (
                <>
                  <IconPlus className="h-4 w-4 mr-1.5" />
                  Add Account
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Add Account Card */}
        {(showAddAccount || connectedAccounts.length === 0) && (
          <div className="relative">
            {showAddAccount && connectedAccounts.length > 0 && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 z-10"
                onClick={() => setShowAddAccount(false)}
              >
                <IconX className="h-4 w-4" />
              </Button>
            )}
            <WABAConnectCard
              hasWABA={!showAddAccount && connectedAccounts.length > 0}
              onSuccess={() => {
                setShowAddAccount(false)
                loadAccounts()
              }}
            />
          </div>
        )}

        {/* Health Status Banners */}
        {connectedAccounts.map((account) => (
          <WABAStatusBanner key={account.wabaId} wabaId={account.wabaId} />
        ))}

        {/* Device Info Cards Grid */}
        {allPhoneCards.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {allPhoneCards.map(({ account, phoneNumber }) => (
              <DeviceInfoCard
                key={phoneNumber.phoneNumberId}
                account={account}
                phoneNumber={phoneNumber}
                stats={allStats[phoneNumber.phoneNumberId]}
                onSync={() => handleRefresh(account.wabaId)}
                onDisconnect={() => handleOpenDisconnectModal(account.wabaId)}
                onSetPrimary={() =>
                  handleSetPrimary(account.wabaId, phoneNumber.phoneNumberId)
                }
              />
            ))}
          </div>
        )}

        {/* Disconnect Modal */}
        <DisconnectModal
          isOpen={disconnectModalOpen}
          onClose={() => setDisconnectModalOpen(false)}
          channel="whatsapp"
          onConfirm={handleDisconnect}
          isLoading={disconnecting}
        />
      </div>
    </RoleGuard>
  )
}
