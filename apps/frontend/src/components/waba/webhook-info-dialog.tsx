"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import {
  IconCopy,
  IconRefresh,
  IconExternalLink,
  IconCheck,
  IconAlertCircle,
} from "@tabler/icons-react"
import { wabaApi, type WebhookInfo } from "@/lib/api/waba"

interface WebhookInfoDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accountId: string
  wabaName?: string | null
}

export function WebhookInfoDialog({
  open,
  onOpenChange,
  accountId,
  wabaName,
}: WebhookInfoDialogProps) {
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [webhookInfo, setWebhookInfo] = useState<WebhookInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const { toast } = useToast()

  const loadWebhookInfo = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await wabaApi.getWebhookInfo(accountId)
      setWebhookInfo(data)
    } catch (err: any) {
      const errorMessage = err.message || "Failed to load webhook info"
      setError(errorMessage)
      toast({
        variant: "destructive",
        title: "Error",
        description: errorMessage,
      })
    } finally {
      setLoading(false)
    }
  }

  // Load webhook info when dialog opens
  useEffect(() => {
    if (open) {
      loadWebhookInfo()
    } else {
      // Reset state when dialog closes
      setWebhookInfo(null)
      setError(null)
    }
  }, [open, accountId])

  const handleRegenerate = async () => {
    setRegenerating(true)
    try {
      const result = await wabaApi.regenerateVerifyToken(accountId)
      if (webhookInfo) {
        setWebhookInfo({
          ...webhookInfo,
          webhook: {
            ...webhookInfo.webhook,
            url: result.webhook.url,
            verifyToken: result.webhook.verifyToken,
          },
        })
      }
      toast({
        title: "Token Regenerated",
        description: "Please update your Meta App webhook configuration with the new token.",
      })
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to regenerate token",
      })
    } finally {
      setRegenerating(false)
    }
  }

  const copyToClipboard = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 2000)
      toast({
        title: "Copied!",
        description: `${field} copied to clipboard`,
      })
    } catch {
      toast({
        variant: "destructive",
        title: "Failed to copy",
        description: "Please copy manually",
      })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Webhook Configuration</DialogTitle>
          <DialogDescription>
            Configure these settings in your Meta App Dashboard for{" "}
            <span className="font-medium">{wabaName || "this account"}</span>
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <IconRefresh className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <IconAlertCircle className="h-8 w-8 text-red-500 mb-2" />
            <p className="text-sm text-muted-foreground mb-4">{error}</p>
            <Button variant="outline" size="sm" onClick={loadWebhookInfo}>
              <IconRefresh className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        ) : webhookInfo ? (
          <div className="space-y-4">
            {/* Webhook URL */}
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <div className="flex gap-2">
                <Input
                  id="webhook-url"
                  value={webhookInfo.webhook.url}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(webhookInfo.webhook.url, "Webhook URL")}
                >
                  {copiedField === "Webhook URL" ? (
                    <IconCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Verify Token */}
            <div className="space-y-2">
              <Label htmlFor="verify-token">Verify Token</Label>
              <div className="flex gap-2">
                <Input
                  id="verify-token"
                  value={webhookInfo.webhook.verifyToken}
                  readOnly
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(webhookInfo.webhook.verifyToken, "Verify Token")}
                >
                  {copiedField === "Verify Token" ? (
                    <IconCheck className="h-4 w-4 text-green-600" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Instructions */}
            <div className="rounded-lg border bg-muted/50 p-4">
              <h4 className="text-sm font-medium mb-2">Setup Instructions</h4>
              <ol className="text-sm text-muted-foreground space-y-1 list-decimal list-inside">
                {webhookInfo.webhook.instructions.map((instruction, index) => (
                  <li key={index}>{instruction}</li>
                ))}
              </ol>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRegenerate}
                disabled={regenerating}
              >
                <IconRefresh className={`h-4 w-4 mr-2 ${regenerating ? "animate-spin" : ""}`} />
                Regenerate Token
              </Button>
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <IconExternalLink className="h-4 w-4 mr-2" />
                  Meta App Dashboard
                </a>
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
