"use client"

import { useEffect, useState } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  IconCircleCheckFilled,
  IconCloudComputing,
  IconWifi,
  IconBrandWhatsapp,
  IconPhone,
  IconCategory,
  IconInfoCircle,
  IconMail,
  IconWorld,
  IconMessage,
  IconUsers,
  IconMessageCircle,
  IconSend,
  IconMailForward,
  IconMailbox,
  IconDotsVertical,
  IconRefresh,
  IconUnlink,
  IconStar,
  IconStarFilled,
  IconWebhook,
} from "@tabler/icons-react"
import {
  wabaApi,
  getTierInfo,
  type WhatsAppAccountWithPhoneNumbers,
  type BusinessProfile,
  type PhoneNumberStats,
} from "@/lib/api/waba"
import { WebhookInfoDialog } from "./webhook-info-dialog"

interface DeviceInfoCardProps {
  account: WhatsAppAccountWithPhoneNumbers
  phoneNumber: WhatsAppAccountWithPhoneNumbers["phoneNumbers"][0]
  stats?: PhoneNumberStats
  onSync?: () => void
  onDisconnect?: () => void
  onSetPrimary?: () => void
}

export function DeviceInfoCard({
  account,
  phoneNumber,
  stats,
  onSync,
  onDisconnect,
  onSetPrimary,
}: DeviceInfoCardProps) {
  const [profile, setProfile] = useState<BusinessProfile | null>(null)
  const [loadingProfile, setLoadingProfile] = useState(false)
  const [webhookDialogOpen, setWebhookDialogOpen] = useState(false)

  useEffect(() => {
    if (account.connectionStatus === "connected") {
      loadProfile()
    }
  }, [account.wabaId, phoneNumber.phoneNumberId])

  const loadProfile = async () => {
    setLoadingProfile(true)
    try {
      const data = await wabaApi.getBusinessProfile(account.wabaId, phoneNumber.phoneNumberId)
      setProfile(data)
    } catch {
      // Silently fail - profile is optional
    } finally {
      setLoadingProfile(false)
    }
  }

  const getQualityBadge = (rating?: string | null) => {
    switch (rating) {
      case "GREEN":
        return (
          <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 text-[11px] font-medium">
            Quality: GREEN
          </Badge>
        )
      case "YELLOW":
        return (
          <Badge className="bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-100 text-[11px] font-medium">
            Quality: YELLOW
          </Badge>
        )
      case "RED":
        return (
          <Badge className="bg-red-100 text-red-700 border border-red-300 hover:bg-red-100 text-[11px] font-medium">
            Quality: RED
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[11px] font-medium">
            Quality: N/A
          </Badge>
        )
    }
  }

  const getVerificationBadge = () => {
    if (phoneNumber.isVerified || phoneNumber.codeVerificationStatus === "VERIFIED") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border border-emerald-300 hover:bg-emerald-100 text-[11px] font-medium">
          Verified
        </Badge>
      )
    }
    return (
      <Badge className="bg-amber-100 text-amber-700 border border-amber-300 hover:bg-amber-100 text-[11px] font-medium">
        Not Verified
      </Badge>
    )
  }

  const getTierBadge = () => {
    // Use WABA-level messaging tier instead of phone number level
    const tierInfo = getTierInfo(account.messagingTier)
    return (
      <Badge variant="outline" className="text-[11px] font-medium gap-1">
        <IconWifi className="h-3 w-3" />
        {tierInfo.limit === "Unknown" ? "Standard" : tierInfo.limit}
      </Badge>
    )
  }

  const isManualLogin = account.isManualLogin || !account.isCoexistence
  const signupType = account.isCoexistence ? "Embedded" : "Manual"
  const isConnected = account.connectionStatus === "connected"

  // Generate initials from account name
  const initials = (account.wabaName || "WA")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow border border-gray-200">
      <CardContent className="p-0">
        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-4 pb-3">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <div className="w-11 h-11 rounded-full bg-gradient-to-br from-green-600 to-green-700 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {initials}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-foreground">
                  {account.wabaName || "WhatsApp Business"}
                </span>
                {phoneNumber.isPrimary && (
                  <IconStarFilled className="h-4 w-4 text-amber-500" />
                )}
                <Badge
                  variant="outline"
                  className="text-[10px] font-medium px-1.5 py-0"
                >
                  {signupType}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {phoneNumber.displayPhoneNumber}
              </p>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <IconDotsVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onSync}>
                <IconRefresh className="h-4 w-4 mr-2" />
                Sync
              </DropdownMenuItem>
              {!phoneNumber.isPrimary && (
                <DropdownMenuItem onClick={onSetPrimary}>
                  <IconStar className="h-4 w-4 mr-2" />
                  Set as Primary
                </DropdownMenuItem>
              )}
              {isManualLogin && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setWebhookDialogOpen(true)}>
                    <IconWebhook className="h-4 w-4 mr-2" />
                    Webhook Info
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDisconnect}
                className="text-red-600 focus:text-red-600"
              >
                <IconUnlink className="h-4 w-4 mr-2" />
                Disconnect
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-between px-5 py-2 border-t border-b border-gray-100">
          <div className="flex items-center gap-1.5">
            <IconCircleCheckFilled
              className={`h-4 w-4 ${isConnected ? "text-emerald-500" : "text-gray-400"}`}
            />
            <span className="text-xs font-medium text-muted-foreground">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1 text-muted-foreground">
              <IconCloudComputing className="h-4 w-4" />
              <span className="text-[11px]">Cloud API</span>
            </div>
            <IconWifi
              className={`h-4 w-4 ${isConnected ? "text-emerald-500" : "text-gray-300"}`}
            />
          </div>
        </div>

        {/* Business Profile Section */}
        <div className="px-5 py-3 space-y-2.5">
          {/* Business Name */}
          <div className="flex items-center gap-2">
            <IconBrandWhatsapp className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm font-medium">
              {phoneNumber.verifiedName || profile?.description || "—"}
            </span>
          </div>

          {/* Phone Number */}
          <div className="flex items-center gap-2">
            <IconPhone className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              {phoneNumber.displayPhoneNumber}
            </span>
          </div>

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 py-1">
            {getQualityBadge(phoneNumber.qualityRating)}
            {getVerificationBadge()}
            {getTierBadge()}
          </div>

          {/* Category */}
          <div className="flex items-center gap-2">
            <IconCategory className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground uppercase">
              {profile?.vertical || "OTHER"}
            </span>
          </div>

          {/* About */}
          {(profile?.about || !loadingProfile) && (
            <div className="flex items-start gap-2">
              <IconInfoCircle className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              <span className="text-xs text-muted-foreground">
                {profile?.about || "Hey there! I am using WhatsApp."}
              </span>
            </div>
          )}

          {/* Email */}
          {profile?.email && (
            <div className="flex items-center gap-2">
              <IconMail className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {profile.email}
              </span>
            </div>
          )}

          {/* Website */}
          {profile?.websites && profile.websites.length > 0 && (
            <div className="flex items-center gap-2">
              <IconWorld className="h-4 w-4 text-muted-foreground shrink-0" />
              <span className="text-xs text-muted-foreground">
                {profile.websites[0]}
              </span>
            </div>
          )}
        </div>

        {/* Stats Footer */}
        {stats && (
          <div className="border-t border-gray-100 px-5 py-3">
            {/* Main Stats */}
            <div className="grid grid-cols-3 gap-4 mb-2">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <IconMessage className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{stats.messages}</p>
                <p className="text-[10px] text-muted-foreground">Messages</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <IconUsers className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{stats.contacts}</p>
                <p className="text-[10px] text-muted-foreground">Contacts</p>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <IconMessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="text-lg font-bold">{stats.chats}</p>
                <p className="text-[10px] text-muted-foreground">Chats</p>
              </div>
            </div>

            {/* Sub Stats */}
            <div className="flex items-center justify-between text-xs text-muted-foreground pt-2 border-t border-gray-50">
              <div className="flex items-center gap-1">
                <IconSend className="h-3 w-3 text-emerald-500" />
                <span>{stats.sent}</span>
              </div>
              <div className="flex items-center gap-1">
                <IconMailForward className="h-3 w-3 text-blue-500" />
                <span>{stats.received}</span>
              </div>
              <div className="flex items-center gap-1">
                <IconMailbox className="h-3 w-3 text-amber-500" />
                <span>{stats.unread} unread</span>
              </div>
            </div>
          </div>
        )}
      </CardContent>

      {/* Webhook Info Dialog for Manual Login */}
      {isManualLogin && (
        <WebhookInfoDialog
          open={webhookDialogOpen}
          onOpenChange={setWebhookDialogOpen}
          accountId={account.id}
          wabaName={account.wabaName}
        />
      )}
    </Card>
  )
}
