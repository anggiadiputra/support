"use client"

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { IconCheck, IconX, IconRefresh, IconClock } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/hooks/use-toast"
import {
  webhooksApi,
  type WebhookEndpoint,
  type WebhookDeliveryLog,
} from "@/lib/api/webhooks-api"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  webhook: WebhookEndpoint
}

export function WebhookLogsDialog({ open, onOpenChange, webhook }: Props) {
  const [logs, setLogs] = useState<WebhookDeliveryLog[]>([])
  const [isLoading, setIsLoading] = useState(false)

  const fetchLogs = async () => {
    try {
      setIsLoading(true)
      const data = await webhooksApi.getLogs(webhook.id, 50)
      setLogs(data)
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to fetch delivery logs",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      fetchLogs()
    }
  }, [open, webhook.id])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
            <IconCheck className="mr-1 h-3 w-3" />
            Success
          </Badge>
        )
      case "failed":
        return (
          <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200">
            <IconX className="mr-1 h-3 w-3" />
            Failed
          </Badge>
        )
      case "retrying":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
            <IconRefresh className="mr-1 h-3 w-3" />
            Retrying
          </Badge>
        )
      case "pending":
        return (
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <IconClock className="mr-1 h-3 w-3" />
            Pending
          </Badge>
        )
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Delivery Logs</DialogTitle>
          <DialogDescription>
            Recent webhook delivery attempts for {webhook.name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">
            Showing last {logs.length} deliveries
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchLogs}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <IconRefresh className="h-4 w-4" />
            )}
          </Button>
        </div>

        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <Skeleton className="h-5 w-20" />
                    <Skeleton className="h-4 w-32" />
                  </div>
                  <Skeleton className="h-4 w-48" />
                </div>
              ))}
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <IconClock className="text-muted-foreground h-12 w-12" />
              <p className="text-muted-foreground mt-2">No delivery logs yet</p>
            </div>
          ) : (
            <div className="space-y-3">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="space-y-2 rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center justify-between">
                    {getStatusBadge(log.status)}
                    <span className="text-muted-foreground text-xs">
                      {format(new Date(log.createdAt), "MMM d, yyyy HH:mm:ss")}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Event:</span>{" "}
                      <span className="font-mono">{log.eventType}</span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Attempt:</span>{" "}
                      <span>{log.attemptNumber}</span>
                    </div>
                    {log.responseStatus && (
                      <div>
                        <span className="text-muted-foreground">Status:</span>{" "}
                        <span className="font-mono">{log.responseStatus}</span>
                      </div>
                    )}
                    {log.latencyMs && (
                      <div>
                        <span className="text-muted-foreground">Latency:</span>{" "}
                        <span className="font-mono">{log.latencyMs}ms</span>
                      </div>
                    )}
                  </div>

                  {log.errorMessage && (
                    <p className="text-xs text-red-600 dark:text-red-400">
                      {log.errorMessage}
                    </p>
                  )}

                  {log.nextRetryAt && (
                    <p className="text-muted-foreground text-xs">
                      Next retry:{" "}
                      {format(new Date(log.nextRetryAt), "MMM d, HH:mm:ss")}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  )
}
