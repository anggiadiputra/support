"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { IconWebhook, IconRefresh, IconCheck, IconX, IconAlertTriangle } from "@tabler/icons-react"
import { instagramApi } from "@/lib/api/instagram"

interface WebhookStatus {
  igId: string
  username: string
  subscribedFields: string[]
  isMessagesSubscribed: boolean
}

export function InstagramWebhookCard() {
  const [status, setStatus] = useState<WebhookStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [enabling, setEnabling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    loadWebhookStatus()
  }, [])

  const loadWebhookStatus = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await instagramApi.getWebhookStatus()
      setStatus(data)
    } catch (err: any) {
      console.error("Error loading webhook status:", err)
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleEnableWebhooks = async () => {
    setEnabling(true)
    setError(null)
    setSuccessMessage(null)
    try {
      const result = await instagramApi.enableWebhookSubscriptions()
      if (result.success) {
        setSuccessMessage(result.message)
        await loadWebhookStatus()
      }
    } catch (err: any) {
      console.error("Error enabling webhooks:", err)
      setError(err.message)
    } finally {
      setEnabling(false)
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconWebhook className="h-5 w-5" />
            Webhook Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-2">
            <div className="bg-muted h-4 w-48 rounded"></div>
            <div className="bg-muted h-4 w-32 rounded"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconWebhook className="h-5 w-5" />
          Webhook Status
        </CardTitle>
        <CardDescription>
          Webhook subscriptions are required to receive Instagram DM notifications
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/20 dark:text-red-200">
            {error}
          </div>
        )}

        {successMessage && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-800 dark:bg-green-950/20 dark:text-green-200">
            {successMessage}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Messages Webhook</span>
            {status?.isMessagesSubscribed ? (
              <Badge variant="default" className="bg-green-600">
                <IconCheck className="mr-1 h-3 w-3" />
                Subscribed
              </Badge>
            ) : (
              <Badge variant="destructive">
                <IconX className="mr-1 h-3 w-3" />
                Not Subscribed
              </Badge>
            )}
          </div>

          {status?.subscribedFields && status.subscribedFields.length > 0 && (
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Subscribed fields:</span>{" "}
              {status.subscribedFields.join(", ")}
            </div>
          )}

          {!status?.isMessagesSubscribed && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950/20">
              <div className="flex items-start gap-2">
                <IconAlertTriangle className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium">Webhook not subscribed</p>
                  <p className="mt-1">
                    You won't receive Instagram DM notifications until webhooks are enabled.
                    Click the button below to enable webhook subscriptions.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            variant={status?.isMessagesSubscribed ? "outline" : "default"}
            onClick={handleEnableWebhooks}
            disabled={enabling}
          >
            {enabling ? (
              <>
                <IconRefresh className="mr-2 h-4 w-4 animate-spin" />
                Enabling...
              </>
            ) : (
              <>
                <IconWebhook className="mr-2 h-4 w-4" />
                {status?.isMessagesSubscribed ? "Re-enable Webhooks" : "Enable Webhooks"}
              </>
            )}
          </Button>
          <Button variant="ghost" onClick={loadWebhookStatus} disabled={loading}>
            <IconRefresh className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
