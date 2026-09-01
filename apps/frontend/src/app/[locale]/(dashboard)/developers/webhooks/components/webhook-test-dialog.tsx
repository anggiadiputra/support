"use client"

import { useState } from "react"
import { IconCheck, IconX } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/hooks/use-toast"
import { webhooksApi, type WebhookEndpoint, type TestWebhookResult } from "@/lib/api/webhooks-api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook: WebhookEndpoint
}

export function WebhookTestDialog({ open, onOpenChange, webhook }: Props) {
  const [isTesting, setIsTesting] = useState(false)
  const [result, setResult] = useState<TestWebhookResult | null>(null)

  const handleTest = async () => {
    try {
      setIsTesting(true)
      setResult(null)
      const testResult = await webhooksApi.test(webhook.id)
      setResult(testResult)
      
      if (testResult.success) {
        toast({
          title: "Test Successful",
          description: `Webhook responded with status ${testResult.statusCode}`,
        })
      } else {
        toast({
          title: "Test Failed",
          description: testResult.error || "Webhook test failed",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to test webhook",
        variant: "destructive",
      })
    } finally {
      setIsTesting(false)
    }
  }

  const handleClose = () => {
    setResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Test Webhook</DialogTitle>
          <DialogDescription>
            Send a test payload to verify your webhook endpoint is working correctly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Endpoint</label>
            <p className="text-muted-foreground break-all text-sm">{webhook.url}</p>
          </div>

          {result && (
            <div
              className={`rounded-lg border p-4 ${
                result.success
                  ? "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950"
                  : "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950"
              }`}
            >
              <div className="flex items-center gap-2">
                {result.success ? (
                  <IconCheck className="h-5 w-5 text-green-600 dark:text-green-400" />
                ) : (
                  <IconX className="h-5 w-5 text-red-600 dark:text-red-400" />
                )}
                <span
                  className={`font-medium ${
                    result.success
                      ? "text-green-800 dark:text-green-200"
                      : "text-red-800 dark:text-red-200"
                  }`}
                >
                  {result.success ? "Test Successful" : "Test Failed"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm">
                {result.statusCode && (
                  <p>
                    <span className="text-muted-foreground">Status Code:</span>{" "}
                    <span className="font-mono">{result.statusCode}</span>
                  </p>
                )}
                {result.latencyMs !== undefined && (
                  <p>
                    <span className="text-muted-foreground">Latency:</span>{" "}
                    <span className="font-mono">{result.latencyMs}ms</span>
                  </p>
                )}
                {result.error && (
                  <p>
                    <span className="text-muted-foreground">Error:</span>{" "}
                    <span className="text-red-600 dark:text-red-400">
                      {result.error}
                    </span>
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Close
          </Button>
          <Button onClick={handleTest} disabled={isTesting}>
            {isTesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Send Test"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
