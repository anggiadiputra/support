"use client"

import { ReactNode, useEffect, useState } from "react"
import { format } from "date-fns"
import { CalendarCheck, LinkIcon } from "lucide-react"
import { Link } from "@/i18n/routing"
import { useRouter } from "@/i18n/routing"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { toast } from "@/hooks/use-toast"
import { useWebhooks, useWebhookLogs } from "@/hooks/use-webhooks"
import { WebhookDetailActions } from "./components/webhook-detail-actions"
import { WebhookLogsTable } from "./components/webhook-logs-table"
import { WebhookStatusIcon } from "./components/webhook-status-icon"

interface Props {
  params: Promise<{ id: string }>
}

export default function WebhookDetailPage({ params }: Props) {
  const router = useRouter()
  const [webhookId, setWebhookId] = useState<string | null>(null)

  useEffect(() => {
    params.then((p) => setWebhookId(p.id))
  }, [params])

  // TanStack Query - find webhook from cached list
  const { data: webhooks = [], isLoading: isLoadingWebhooks } = useWebhooks(!!webhookId)
  const { data: logs = [], isLoading: isLoadingLogs } = useWebhookLogs(webhookId || '', 50, !!webhookId)
  
  const webhook = webhooks.find((w) => w.id === webhookId)
  const isLoading = isLoadingWebhooks || isLoadingLogs

  // Redirect if webhook not found after loading
  useEffect(() => {
    if (!isLoadingWebhooks && webhookId && webhooks.length > 0 && !webhook) {
      toast({
        title: "Not Found",
        description: "Webhook endpoint not found",
        variant: "destructive",
      })
      router.push("/developers/webhooks")
    }
  }, [isLoadingWebhooks, webhookId, webhooks, webhook, router])

  const handleWebhookDeleted = () => {
    router.push("/developers/webhooks")
  }

  if (isLoading || !webhookId) {
    return (
      <div className="flex w-full flex-1 flex-col gap-4">
        <Skeleton className="h-6 w-64" />
        <Skeleton className="h-8 w-48" />
        <div className="flex gap-4">
          <Skeleton className="h-16 w-32" />
          <Skeleton className="h-16 w-32" />
          <Skeleton className="h-16 w-32" />
        </div>
        <Skeleton className="mt-4 h-64 w-full" />
      </div>
    )
  }

  if (!webhook) {
    return null
  }

  return (
    <div className="flex w-full flex-1 flex-col gap-2">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/developers/overview">Developers</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link href="/developers/webhooks">Webhooks</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{webhook.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-bold">{webhook.name}</h2>
          <WebhookDetailActions
            webhook={webhook}
            onDeleted={handleWebhookDeleted}
          />
        </div>
        <div className="flex flex-col items-stretch sm:flex-row sm:items-start">
          <Specs label="Status">
            <WebhookStatusIcon status={webhook.isActive && !webhook.disabledAt} />
            <span className="capitalize">
              {webhook.disabledAt
                ? "Auto-disabled"
                : webhook.isActive
                  ? "Enabled"
                  : "Disabled"}
            </span>
          </Specs>

          <Specs label="Channels">
            <div className="flex flex-wrap gap-1">
              {webhook.channels.map((channel) => (
                <Badge key={channel} variant="outline" className="capitalize text-xs">
                  {channel}
                </Badge>
              ))}
            </div>
          </Specs>

          <Specs label="Events">
            <Badge variant="secondary">{webhook.events.length} events</Badge>
          </Specs>

          <Specs label="Created on">
            <CalendarCheck size={16} />
            <span>{format(new Date(webhook.createdAt), "dd MMM, yyyy h:mma")}</span>
          </Specs>

          <Specs label="URL">
            <LinkIcon size={16} />
            <span className="text-sky-700 dark:text-sky-400 break-all">
              {webhook.url}
            </span>
          </Specs>
        </div>

        {webhook.failureCount > 0 && (
          <div className="mt-2 rounded-lg border border-yellow-200 bg-yellow-50 p-3 dark:border-yellow-800 dark:bg-yellow-950">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              This webhook has {webhook.failureCount} consecutive failure(s).
              {webhook.failureCount >= 10 && " It has been automatically disabled."}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <h3 className="mb-2 text-lg font-semibold">Delivery Logs</h3>
        <WebhookLogsTable data={logs} />
      </div>
    </div>
  )
}

function Specs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-border border-b py-2 sm:border-r sm:border-b-0 sm:px-4 sm:py-0 sm:last:border-none">
      <span className="text-muted-foreground text-xs font-bold tracking-tight uppercase">
        {label}
      </span>
      <div className="mt-1 flex items-start gap-2 text-sm font-medium [&>*:first-child]:flex-none">
        {children}
      </div>
    </div>
  )
}
