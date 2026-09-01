"use client"

import {
  Phone,
  Instagram,
  MessageCircle,
  CheckCircle,
  XCircle,
  AlertCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Loader2,
} from "lucide-react"
import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  useUserWABAInfo,
  useCheckWABAHealth,
  type WABAHealthStatus,
  type AccountHealthInfo,
} from "../../../hooks/use-admin-user-support"

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function getStatusIcon(status: string | null | undefined) {
  switch (status?.toLowerCase()) {
    case "connected":
      return <CheckCircle className="h-4 w-4 text-green-500" />
    case "disconnected":
      return <XCircle className="h-4 w-4 text-red-500" />
    default:
      return <AlertCircle className="h-4 w-4 text-yellow-500" />
  }
}

function getQualityBadge(rating: string | null | undefined) {
  switch (rating?.toUpperCase()) {
    case "HIGH":
      return <Badge className="bg-green-100 text-green-800 border-green-200">High</Badge>
    case "MEDIUM":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Medium</Badge>
    case "LOW":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Low</Badge>
    default:
      return <Badge variant="outline">Unknown</Badge>
  }
}

function getHealthStatusBadge(status: WABAHealthStatus) {
  switch (status) {
    case "ACTIVE":
      return (
        <Badge className="bg-green-100 text-green-800 border-green-200">
          <ShieldCheck className="h-3 w-3 mr-1" />
          Active
        </Badge>
      )
    case "RESTRICTED":
      return (
        <Badge className="bg-red-100 text-red-800 border-red-200">
          <ShieldAlert className="h-3 w-3 mr-1" />
          Restricted
        </Badge>
      )
    case "UNDER_REVIEW":
      return (
        <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">
          <ShieldQuestion className="h-3 w-3 mr-1" />
          Under Review
        </Badge>
      )
    case "FLAGGED":
      return (
        <Badge className="bg-orange-100 text-orange-800 border-orange-200">
          <ShieldAlert className="h-3 w-3 mr-1" />
          Flagged
        </Badge>
      )
    case "DISABLED":
      return (
        <Badge className="bg-gray-100 text-gray-800 border-gray-200">
          <ShieldAlert className="h-3 w-3 mr-1" />
          Disabled
        </Badge>
      )
    default:
      return (
        <Badge variant="outline">
          <ShieldQuestion className="h-3 w-3 mr-1" />
          Unknown
        </Badge>
      )
  }
}

function formatRestrictionType(type: string | null): string {
  if (!type) return ""
  // Convert SNAKE_CASE to Title Case
  return type
    .split("_")
    .map((word) => word.charAt(0) + word.slice(1).toLowerCase())
    .join(" ")
}

interface TabWABAChannelsProps {
  userId: string
}

export function TabWABAChannels({ userId }: TabWABAChannelsProps) {
  const { data, isLoading, error, fetch } = useUserWABAInfo(userId)
  const { isLoading: isCheckingHealth, checkHealth } = useCheckWABAHealth(userId)
  const [localHealth, setLocalHealth] = useState<AccountHealthInfo | null>(null)

  useEffect(() => {
    fetch()
  }, [fetch])

  // Use local health state if available (from manual check), otherwise use data from API
  const accountHealth = localHealth ?? data?.accountHealth ?? null

  const handleCheckHealth = async () => {
    const result = await checkHealth()
    if (result.success && result.accountHealth) {
      setLocalHealth(result.accountHealth)
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (!data) {
    return (
      <Alert>
        <AlertDescription>No data available</AlertDescription>
      </Alert>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={() => fetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* WABA Connections */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5" />
            WhatsApp Business Account
            <Badge variant="outline">{data.whatsappAccounts.length}</Badge>
          </CardTitle>
          <CardDescription>WABA connection details and phone numbers</CardDescription>
        </CardHeader>
        <CardContent>
          {data.whatsappAccounts.length > 0 ? (
            <div className="space-y-6">
              {data.whatsappAccounts.map((wa, index) => (
                <div key={wa.id} className="space-y-4">
                  {index > 0 && <div className="border-t pt-4" />}

                  {/* WABA Details */}
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <h4 className="text-sm font-semibold">{wa.wabaName || `WABA ${index + 1}`}</h4>
                      {index === 0 && <Badge variant="outline" className="text-xs">Primary</Badge>}
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-sm text-muted-foreground">WABA ID</span>
                        <p className="font-mono text-sm">{wa.wabaId}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Status</span>
                        <div className="flex items-center gap-2">
                          {getStatusIcon(wa.connectionStatus)}
                          <span className="capitalize">{wa.connectionStatus || "Unknown"}</span>
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Connected At</span>
                        <p className="text-sm">{formatDate(wa.connectedAt)}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Last Sync</span>
                        <p className="text-sm">{formatDate(wa.lastSyncAt)}</p>
                      </div>
                      <div>
                        <span className="text-sm text-muted-foreground">Token Expires</span>
                        <p className="text-sm">{formatDate(wa.tokenExpiresAt)}</p>
                      </div>
                    </div>
                  </div>

                  {/* Phone Numbers for this WABA */}
                  {wa.phoneNumbers.length > 0 && (
                    <div>
                      <h5 className="text-sm font-semibold mb-2">Phone Numbers ({wa.phoneNumbers.length})</h5>
                      <div className="space-y-2">
                        {wa.phoneNumbers.map((pn) => (
                          <div key={pn.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                            <div className="flex items-center gap-2">
                              <div>
                                <div className="flex items-center gap-2">
                                  <p className="font-medium">{pn.displayPhoneNumber}</p>
                                  {pn.isPrimary && (
                                    <Badge variant="outline" className="text-xs">Primary</Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">{pn.verifiedName || "Unverified"}</p>
                              </div>
                            </div>
                            {getQualityBadge(pn.qualityRating)}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Account Health Status - shown for first/primary account */}
              {data.whatsappAccounts.length > 0 && (
                <div className="mt-4 p-4 bg-muted/30 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <span className="text-sm font-medium">Account Health (Primary WABA)</span>
                      <div className="flex items-center gap-2">
                        {accountHealth ? (
                          <>
                            {getHealthStatusBadge(accountHealth.status)}
                            {accountHealth.status !== "ACTIVE" && accountHealth.restrictionType && (
                              <span className="text-sm text-muted-foreground">
                                - {formatRestrictionType(accountHealth.restrictionType)}
                                {accountHealth.detectedAt && (
                                  <> ({formatDate(accountHealth.detectedAt)})</>
                                )}
                              </span>
                            )}
                          </>
                        ) : (
                          <Badge variant="outline">
                            <ShieldQuestion className="h-3 w-3 mr-1" />
                            Unknown
                          </Badge>
                        )}
                      </div>
                      {accountHealth?.errorMessage && accountHealth.status !== "ACTIVE" && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {accountHealth.errorMessage}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCheckHealth}
                      disabled={isCheckingHealth}
                    >
                      {isCheckingHealth ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <RefreshCw className="h-4 w-4 mr-2" />
                      )}
                      Check Status
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No WABA connected</p>
          )}
        </CardContent>
      </Card>

      {/* Instagram Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5" />
            Instagram Accounts
            <Badge variant="outline">{data.instagramAccounts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.instagramAccounts.length > 0 ? (
            <div className="space-y-2">
              {data.instagramAccounts.map((ig) => (
                <div key={ig.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(ig.connectionStatus)}
                    <span>@{ig.username}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Connected: {formatDate(ig.connectedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Instagram accounts connected</p>
          )}
        </CardContent>
      </Card>

      {/* Facebook Pages (Messenger) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageCircle className="h-5 w-5" />
            Facebook Pages (Messenger)
            <Badge variant="outline">{data.facebookPages.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.facebookPages.length > 0 ? (
            <div className="space-y-2">
              {data.facebookPages.map((fp) => (
                <div key={fp.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    {getStatusIcon(fp.connectionStatus)}
                    <span>{fp.pageName}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Connected: {formatDate(fp.connectedAt)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No Facebook pages connected</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
