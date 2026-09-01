"use client"

import { useEffect, useState } from "react"
import { format, differenceInDays } from "date-fns"
import { IconKey, IconTrash, IconAlertTriangle } from "@tabler/icons-react"
import { Terminal, Loader2 } from "lucide-react"
import { Link } from "@/i18n/routing"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "@/hooks/use-toast"
import { apiKeysApi, type ApiKey } from "@/lib/api/api-keys-api"
import { useSubscription } from "@/hooks/use-subscription"
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt"
import { CreateApiKeyDialog } from "./components/create-api-key-dialog"

export default function ApiKeysPage() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [keyToRevoke, setKeyToRevoke] = useState<ApiKey | null>(null)
  const [isRevoking, setIsRevoking] = useState(false)

  // Subscription feature gating
  const { tier, hasFeature, canCreate, getUsageText, refetch: refetchSubscription } = useSubscription()
  const hasApiAccess = hasFeature("apiAccess")
  const canCreateApiKey = canCreate("apiKeys")
  const usageText = getUsageText("apiKeys")

  const fetchApiKeys = async () => {
    try {
      setIsLoading(true)
      const keys = await apiKeysApi.list()
      setApiKeys(keys)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch API keys",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchApiKeys()
  }, [])

  const handleKeyCreated = (newKey: ApiKey) => {
    setApiKeys((prev) => [newKey, ...prev])
    refetchSubscription() // Refresh usage counts
  }

  const handleRevokeClick = (key: ApiKey) => {
    setKeyToRevoke(key)
    setRevokeDialogOpen(true)
  }

  const handleRevokeConfirm = async () => {
    if (!keyToRevoke) return

    try {
      setIsRevoking(true)
      await apiKeysApi.revoke(keyToRevoke.id)
      setApiKeys((prev) => prev.filter((k) => k.id !== keyToRevoke.id))
      refetchSubscription() // Refresh usage counts
      toast({
        title: "API Key Revoked",
        description: `"${keyToRevoke.name}" has been revoked successfully.`,
      })
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to revoke API key",
        variant: "destructive",
      })
    } finally {
      setIsRevoking(false)
      setRevokeDialogOpen(false)
      setKeyToRevoke(null)
    }
  }

  const getExpirationStatus = (expiresAt: string) => {
    const daysUntilExpiry = differenceInDays(new Date(expiresAt), new Date())

    if (daysUntilExpiry < 0) {
      return { status: "expired", label: "Expired", variant: "destructive" as const }
    }
    if (daysUntilExpiry <= 30) {
      return { status: "expiring", label: `Expires in ${daysUntilExpiry} days`, variant: "warning" as const }
    }
    return { status: "active", label: "Active", variant: "default" as const }
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">API Keys</h2>
          <p className="text-muted-foreground text-sm">
            Secure, manage, and monitor your API keys for external integrations.
          </p>
        </div>
        {hasApiAccess && (
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{usageText}</span>
            {canCreateApiKey ? (
              <CreateApiKeyDialog onKeyCreated={handleKeyCreated} />
            ) : (
              <Button size="sm" disabled>
                <IconKey className="h-4 w-4" />
                Limit Reached
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="w-full max-w-4xl">
        <Alert className="mb-6">
          <Terminal className="h-4 w-4" />
          <AlertTitle>API Authentication</AlertTitle>
          <AlertDescription>
            Use your API key in the Authorization header as a Bearer token:{" "}
            <code className="bg-muted rounded px-1 py-0.5">
              Authorization: Bearer your_api_key
            </code>
          </AlertDescription>
        </Alert>

        {!hasApiAccess ? (
          <div className="max-w-md">
            <UpgradePrompt
              feature="apiAccess"
              currentTier={tier}
              requiredTier="BASIC"
            />
          </div>
        ) : isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4 p-4">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
                <Skeleton className="h-8 w-20" />
              </div>
            ))}
          </div>
        ) : apiKeys.length === 0 ? (
          <div className="border-border flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-10">
            <IconKey className="text-muted-foreground size-16" />
            <h3 className="text-lg font-semibold">No API Keys Yet</h3>
            <p className="text-muted-foreground text-center">
              Create an API key to start integrating with external services like n8n or Zapier.
            </p>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key Prefix</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.map((key) => {
                  const expStatus = getExpirationStatus(key.expiresAt)
                  return (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <code className="bg-muted rounded px-2 py-1 text-sm">
                          {key.keyPrefix}...
                        </code>
                      </TableCell>
                      <TableCell>
                        {format(new Date(key.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        {key.lastUsedAt
                          ? format(new Date(key.lastUsedAt), "MMM d, yyyy HH:mm")
                          : "Never"}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {expStatus.status === "expiring" && (
                            <IconAlertTriangle className="h-4 w-4 text-yellow-500" />
                          )}
                          <Badge
                            variant={expStatus.variant === "warning" ? "outline" : expStatus.variant}
                            className={
                              expStatus.variant === "warning"
                                ? "border-yellow-500 bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300"
                                : ""
                            }
                          >
                            {expStatus.label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRevokeClick(key)}
                          className="text-destructive hover:text-destructive"
                        >
                          <IconTrash className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        )}

        {hasApiAccess && apiKeys.length > 0 && !canCreateApiKey && (
          <p className="text-muted-foreground mt-4 text-sm">
            You've reached your API key limit ({usageText}). <Link href="/subscription" className="text-primary underline">Upgrade your plan</Link> to create more.
          </p>
        )}
      </div>

      <ConfirmDialog
        open={revokeDialogOpen}
        onOpenChange={setRevokeDialogOpen}
        title="Revoke API Key"
        desc={
          <span>
            Are you sure you want to revoke <strong>{keyToRevoke?.name}</strong>?
            This action cannot be undone and any integrations using this key will
            stop working immediately.
          </span>
        }
        confirmText={
          isRevoking ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Revoking...
            </>
          ) : (
            "Revoke Key"
          )
        }
        destructive
        isLoading={isRevoking}
        handleConfirm={handleRevokeConfirm}
      />
    </div>
  )
}
