"use client"

import { useState } from "react"
import {
  IconDotsVertical,
  IconEdit,
  IconTrash,
  IconPlayerPlay,
  IconToggleLeft,
  IconToggleRight,
  IconHistory,
} from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { toast } from "@/hooks/use-toast"
import { useDeleteWebhook, useUpdateWebhook } from "@/hooks/use-webhooks"
import type { WebhookEndpoint } from "@/lib/api/webhooks-api"
import { MutateWebhook } from "./mutate-webhook"
import { WebhookLogsDialog } from "./webhook-logs-dialog"
import { WebhookTestDialog } from "./webhook-test-dialog"

interface Props {
  webhook: WebhookEndpoint
}

export function WebhookRowActions({ webhook }: Props) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [logsOpen, setLogsOpen] = useState(false)
  const [testOpen, setTestOpen] = useState(false)

  const deleteWebhook = useDeleteWebhook()
  const updateWebhook = useUpdateWebhook()

  const handleDelete = async () => {
    deleteWebhook.mutate(webhook.id, {
      onSuccess: () => {
        toast({
          title: "Webhook Deleted",
          description: `"${webhook.name}" has been deleted successfully.`,
        })
        setDeleteOpen(false)
      },
      onError: (error) => {
        toast({
          title: "Error",
          description: error.message || "Failed to delete webhook",
          variant: "destructive",
        })
      },
    })
  }

  const handleToggle = () => {
    updateWebhook.mutate(
      { id: webhook.id, data: { isActive: !webhook.isActive } },
      {
        onSuccess: () => {
          toast({
            title: webhook.isActive ? "Webhook Disabled" : "Webhook Enabled",
            description: `"${webhook.name}" has been ${webhook.isActive ? "disabled" : "enabled"}.`,
          })
        },
        onError: (error) => {
          toast({
            title: "Error",
            description: error.message || "Failed to update webhook",
            variant: "destructive",
          })
        },
      }
    )
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <IconDotsVertical className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setTestOpen(true)}>
            <IconPlayerPlay className="mr-2 h-4 w-4" />
            Test Webhook
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setLogsOpen(true)}>
            <IconHistory className="mr-2 h-4 w-4" />
            View Logs
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <IconEdit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleToggle} disabled={updateWebhook.isPending}>
            {updateWebhook.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : webhook.isActive ? (
              <IconToggleLeft className="mr-2 h-4 w-4" />
            ) : (
              <IconToggleRight className="mr-2 h-4 w-4" />
            )}
            {webhook.isActive ? "Disable" : "Enable"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setDeleteOpen(true)}
            className="text-red-600 focus:text-red-600"
          >
            <IconTrash className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <MutateWebhook
        open={editOpen}
        setOpen={setEditOpen}
        currentWebhook={webhook}
      />

      <WebhookTestDialog
        open={testOpen}
        onOpenChange={setTestOpen}
        webhook={webhook}
      />

      <WebhookLogsDialog
        open={logsOpen}
        onOpenChange={setLogsOpen}
        webhook={webhook}
      />

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete Webhook"
        desc={
          <span>
            Are you sure you want to delete <strong>{webhook.name}</strong>?
            This action cannot be undone and no future events will be sent to
            this endpoint.
          </span>
        }
        confirmText={
          deleteWebhook.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Deleting...
            </>
          ) : (
            "Delete"
          )
        }
        destructive
        isLoading={deleteWebhook.isPending}
        handleConfirm={handleDelete}
      />
    </>
  )
}
