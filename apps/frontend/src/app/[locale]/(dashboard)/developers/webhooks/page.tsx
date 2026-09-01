"use client"

import { useState } from "react"
import { Plus, Webhook } from "lucide-react"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useSubscription } from "@/hooks/use-subscription"
import { useWebhooks } from "@/hooks/use-webhooks"
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt"
import { MutateWebhook } from "./components/mutate-webhook"
import { columns } from "./components/webhooks-columns"
import { WebhooksTable } from "./components/webhooks-table"

export default function WebhooksPage() {
  // Lift sheet state to page level to prevent unmounting when subscription updates
  const [createOpen, setCreateOpen] = useState(false)
  
  // TanStack Query - handles loading, caching, and refetching automatically
  const { data: webhooks = [], isLoading } = useWebhooks()

  // Subscription feature gating
  const { tier, hasFeature, canCreate, getUsageText } = useSubscription()
  const hasWebhooksAccess = hasFeature("webhooksEnabled")
  const canCreateWebhook = canCreate("webhookEndpoints")
  const usageText = getUsageText("webhookEndpoints")

  return (
    <div className="flex w-full flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Webhooks</h2>
          <p className="text-muted-foreground text-sm">
            Setup webhook endpoints to receive real-time event notifications.
          </p>
        </div>
        {hasWebhooksAccess && (
          <div className="flex items-center gap-3">
            <span className="text-muted-foreground text-sm">{usageText}</span>
            <Button 
              size="sm"
              onClick={() => setCreateOpen(true)}
              disabled={!canCreateWebhook}
            >
              <Plus className="h-4 w-4" />
              {canCreateWebhook ? "Add Webhook" : "Limit Reached"}
            </Button>
          </div>
        )}
      </div>

      <div className="h-full flex-1">
          {!hasWebhooksAccess ? (
            <div className="max-w-md">
              <UpgradePrompt
                feature="webhooksEnabled"
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
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                  <Skeleton className="h-8 w-20" />
                </div>
              ))}
            </div>
          ) : webhooks.length > 0 ? (
            <WebhooksTable data={webhooks} columns={columns} />
          ) : (
            <div className="border-border flex flex-col items-center gap-4 rounded-lg border border-dashed px-6 py-10">
              <Webhook className="text-muted-foreground size-16" />
              <h2 className="text-lg font-semibold">No Webhooks Yet</h2>
              <p className="text-muted-foreground text-center">
                Get started by creating a webhook to{" "}
                <br className="hidden sm:block" /> receive real-time event
                notifications.
              </p>
              <Button 
                size="sm"
                onClick={() => setCreateOpen(true)}
                disabled={!canCreateWebhook}
              >
                <Plus className="h-4 w-4" />
                {canCreateWebhook ? "Add Webhook" : "Limit Reached"}
              </Button>
            </div>
          )}
        </div>

        {hasWebhooksAccess && webhooks.length > 0 && !canCreateWebhook && (
          <p className="text-muted-foreground mt-4 text-sm">
            You've reached your webhook limit ({usageText}). <Link href="/subscription" className="text-primary underline">Upgrade your plan</Link> to create more.
          </p>
        )}

        {/* Render sheet at page level to prevent unmount when subscription updates */}
        <MutateWebhook open={createOpen} setOpen={setCreateOpen} />
      </div>
  )
}
