"use client"

import { ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { CopyButton } from "@/components/copy-button"
import LongText from "@/components/long-text"
import type { WebhookEndpoint } from "@/lib/api/webhooks-api"
import { DataTableColumnHeader } from "./data-table-column-header"
import { WebhookRowActions } from "./webhook-row-actions"

export const columns: ColumnDef<WebhookEndpoint>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Name" />
    ),
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <span className="font-medium">{row.getValue("name")}</span>
      </div>
    ),
    meta: { className: cn("min-w-32") },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "url",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="URL Endpoint" />
    ),
    cell: ({ row }) => {
      const url = row.getValue("url") as string
      const maxLength = 50
      const truncatedUrl = url.length > maxLength 
        ? url.substring(0, maxLength) + "..." 
        : url
      
      return (
        <div className="flex items-center gap-2">
          <span 
            className="text-sky-700 dark:text-sky-400 font-mono text-sm"
            title={url}
          >
            {truncatedUrl}
          </span>
          <CopyButton
            className="size-6 scale-100 rounded-full shrink-0"
            text={url}
          />
        </div>
      )
    },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "events",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Events" />
    ),
    cell: ({ row }) => {
      const events = row.original.events
      return (
        <div className="text-center">
          <Badge variant="secondary">{events.length}</Badge>
        </div>
      )
    },
    meta: { className: "w-20 text-center" },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "channels",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Channels" />
    ),
    cell: ({ row }) => {
      const channels = row.original.channels
      const accountCount = row.original.channelAccountIds?.length || 0
      return (
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap gap-1">
            {channels.map((channel) => (
              <Badge key={channel} variant="outline" className="capitalize text-xs">
                {channel}
              </Badge>
            ))}
          </div>
          {accountCount > 0 && (
            <span className="text-muted-foreground text-xs">
              {accountCount} specific account{accountCount !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      )
    },
    meta: { className: "w-32" },
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "isActive",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const { isActive, failureCount, disabledAt, disableReason } = row.original
      
      if (disabledAt) {
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant="outline"
              className="border-red-300 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-50"
            >
              Auto-disabled
            </Badge>
            {disableReason && (
              <span className="text-muted-foreground text-xs">{disableReason}</span>
            )}
          </div>
        )
      }

      if (!isActive) {
        return (
          <Badge
            variant="outline"
            className="border-gray-300 bg-gray-50 text-gray-700 dark:bg-gray-900 dark:text-gray-300"
          >
            Disabled
          </Badge>
        )
      }

      if (failureCount > 0) {
        return (
          <div className="flex flex-col gap-1">
            <Badge
              variant="outline"
              className="border-yellow-300 bg-yellow-50 text-yellow-900 dark:bg-yellow-950 dark:text-yellow-50"
            >
              {failureCount} failures
            </Badge>
          </div>
        )
      }

      return (
        <Badge
          variant="outline"
          className="border-green-300 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-50"
        >
          Active
        </Badge>
      )
    },
    meta: { className: "w-32" },
    enableSorting: false,
    enableHiding: false,
  },
  {
    id: "actions",
    cell: ({ row }) => <WebhookRowActions webhook={row.original} />,
    meta: { className: "w-16" },
  },
]
