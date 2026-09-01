"use client"

import { useState } from "react"
import { KeyRound, RefreshCw, Trash2, AlertTriangle, CheckCircle } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useUserSupportActions } from "../../../hooks/use-admin-user-support"

interface TabActionsProps {
  userId: string
  userName: string
}

interface ActionResult {
  type: "success" | "error"
  message: string
}

export function TabActions({ userId, userName }: TabActionsProps) {
  const { isLoading, error, resetApiKeys, syncTemplates, clearCache } = useUserSupportActions(userId)
  const [actionResult, setActionResult] = useState<ActionResult | null>(null)

  const handleResetApiKeys = async () => {
    setActionResult(null)
    const result = await resetApiKeys()
    if (result.success) {
      setActionResult({
        type: "success",
        message: `Successfully revoked ${result.revokedCount || 0} API key(s)`,
      })
    } else {
      setActionResult({
        type: "error",
        message: error || "Failed to reset API keys",
      })
    }
  }

  const handleSyncTemplates = async () => {
    setActionResult(null)
    const result = await syncTemplates()
    if (result.success) {
      setActionResult({
        type: "success",
        message: `Successfully synced ${result.syncedCount || 0} template(s) from Meta`,
      })
    } else {
      setActionResult({
        type: "error",
        message: error || "Failed to sync templates",
      })
    }
  }

  const handleClearCache = async () => {
    setActionResult(null)
    const result = await clearCache()
    if (result.success) {
      setActionResult({
        type: "success",
        message: `Successfully cleared ${result.clearedKeys || 0} cache key(s)`,
      })
    } else {
      setActionResult({
        type: "error",
        message: error || "Failed to clear cache",
      })
    }
  }

  return (
    <div className="space-y-6">
      {/* Action Result Alert */}
      {actionResult && (
        <Alert variant={actionResult.type === "error" ? "destructive" : "default"}>
          {actionResult.type === "success" ? (
            <CheckCircle className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          <AlertDescription>{actionResult.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        {/* Reset API Keys */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-5 w-5" />
              Reset API Keys
            </CardTitle>
            <CardDescription>
              Revoke all active API keys for this user. They will need to generate new keys.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full" disabled={isLoading}>
                  <KeyRound className="h-4 w-4 mr-2" />
                  Reset API Keys
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset API Keys</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to revoke all API keys for <strong>{userName}</strong>?
                    <br /><br />
                    This action will:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Immediately invalidate all active API keys</li>
                      <li>Stop any API integrations using these keys</li>
                      <li>Require the user to generate new keys</li>
                    </ul>
                    <br />
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleResetApiKeys}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      "Yes, Reset All Keys"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Sync Templates */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RefreshCw className="h-5 w-5" />
              Sync Templates
            </CardTitle>
            <CardDescription>
              Force sync templates from Meta. Use if templates are out of sync.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full" disabled={isLoading}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Force Sync Templates
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Force Sync Templates</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to force sync templates for <strong>{userName}</strong>?
                    <br /><br />
                    This action will:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Fetch latest templates from Meta API</li>
                      <li>Update local template data</li>
                      <li>May take a few moments to complete</li>
                    </ul>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSyncTemplates}>
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      "Yes, Sync Templates"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Clear Cache */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Trash2 className="h-5 w-5" />
              Clear Cache
            </CardTitle>
            <CardDescription>
              Clear all Redis cache for this user. Use for troubleshooting stale data.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" className="w-full" disabled={isLoading}>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear User Cache
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear User Cache</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to clear all cached data for <strong>{userName}</strong>?
                    <br /><br />
                    This action will:
                    <ul className="list-disc list-inside mt-2 space-y-1">
                      <li>Remove all Redis cache entries for this user</li>
                      <li>Force fresh data fetch on next request</li>
                      <li>May temporarily slow down user experience</li>
                    </ul>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearCache}>
                    {isLoading ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      "Yes, Clear Cache"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>

      {/* Warning Notice */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>
          All actions on this page are logged in the audit trail. Use these tools responsibly for customer support purposes only.
        </AlertDescription>
      </Alert>
    </div>
  )
}
