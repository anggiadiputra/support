"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { consentStatuses, windowStatuses } from "../data/data"
import { Customer } from "../data/schema"
import { DataTableColumnHeader } from "./data-table-column-header"
import { DataTableRowActions } from "./data-table-row-actions"
import { format, formatDistanceToNow } from "date-fns"
import { IconClock } from "@tabler/icons-react"

export const columns: ColumnDef<Customer>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={
          table.getIsAllPageRowsSelected() ||
          (table.getIsSomePageRowsSelected() && "indeterminate")
        }
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Select all"
        className="translate-y-[2px]"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label="Select row"
        className="translate-y-[2px]"
      />
    ),
    enableSorting: false,
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Customer" />
    ),
    cell: ({ row }) => {
      const name = row.getValue("name") as string | null
      const initials = (name || "")
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2) || "U"

      return (
        <div className="flex items-center gap-3">
          <Avatar className="h-8 w-8">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col">
            <span className="flex items-center gap-1.5 font-semibold">
              {name || "Unnamed Customer"}
              {row.original.marketingOptOut && (
                <span
                  className="rounded border border-amber-300 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:border-amber-700 dark:text-amber-400"
                  title="Opted out of marketing messages"
                >
                  Opt-out
                </span>
              )}
            </span>
            <span className="text-muted-foreground text-xs">
              {row.original.phoneNumber}
            </span>
          </div>
        </div>
      )
    },
  },
  {
    accessorKey: "consentStatus",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Consent" />
    ),
    cell: ({ row }) => {
      const status = consentStatuses.find(
        (s) => s.value === row.getValue("consentStatus")
      )

      if (!status) {
        return null
      }

      const Icon = status.icon

      return (
        <div className="flex items-center gap-2">
          <div className={`rounded-full p-1.5 ${status.bgColor}`}>
            <Icon className={`h-3.5 w-3.5 ${status.color}`} />
          </div>
          <span className="text-sm">{status.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "channels",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Channel" />
    ),
    cell: ({ row }) => {
      const channels = (row.getValue("channels") as string[]) || []
      if (!channels.length) return <span className="text-muted-foreground text-xs">-</span>
      return (
        <div className="flex flex-wrap gap-1">
          {channels.map((ch) => (
            <Badge key={ch} variant="secondary" className="text-xs">
              {ch}
            </Badge>
          ))}
        </div>
      )
    },
    filterFn: (row, id, value) => {
      const channels = (row.getValue(id) as string[]) || []
      return value.some((v: string) => channels.includes(v))
    },
  },
  {
    accessorKey: "hasActiveWindow",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Message Window" />
    ),
    cell: ({ row }) => {
      const hasWindow = row.getValue("hasActiveWindow") as boolean
      const expiresAt = row.original.windowExpiresAt

      if (hasWindow && expiresAt) {
        const timeLeft = formatDistanceToNow(new Date(expiresAt), {
          addSuffix: true,
        })

        return (
          <div className="flex items-center gap-2">
            <Badge variant="default" className="bg-emerald-600">
              <IconClock className="mr-1 h-3 w-3" />
              Active
            </Badge>
            <span className="text-muted-foreground text-xs">
              Expires {timeLeft}
            </span>
          </div>
        )
      }

      return (
        <Badge variant="outline" className="text-muted-foreground">
          No Active Window
        </Badge>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "tags",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Tags" />
    ),
    cell: ({ row }) => {
      const tags = row.getValue("tags") as string[]

      if (!tags || tags.length === 0) {
        return <span className="text-muted-foreground text-sm">-</span>
      }

      return (
        <div className="flex flex-wrap gap-1">
          {tags.slice(0, 2).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {tags.length > 2 && (
            <Badge variant="secondary" className="text-xs">
              +{tags.length - 2}
            </Badge>
          )}
        </div>
      )
    },
  },
  {
    accessorKey: "leadScore",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Score" />
    ),
    cell: ({ row }) => {
      const score = row.getValue("leadScore") as number
      return (
        <div className="flex items-center">
          <Badge
            variant={score >= 50 ? "default" : "secondary"}
            className={score >= 80 ? "bg-green-500 hover:bg-green-600" : ""}
          >
            {score}
          </Badge>
        </div>
      )
    },
  },
  {
    accessorKey: "lastMessageAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Last Contact" />
    ),
    cell: ({ row }) => {
      const lastMessage = row.getValue("lastMessageAt") as Date | null

      if (!lastMessage) {
        return <span className="text-muted-foreground text-sm">Never</span>
      }

      return (
        <div className="flex flex-col">
          <span className="text-sm">
            {format(new Date(lastMessage), "MMM dd, yyyy")}
          </span>
          <span className="text-muted-foreground text-xs">
            {formatDistanceToNow(new Date(lastMessage), { addSuffix: true })}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Added" />
    ),
    cell: ({ row }) => {
      return (
        <span className="text-muted-foreground text-sm">
          {format(row.getValue("createdAt"), "MMM dd, yyyy")}
        </span>
      )
    },
  },
  {
    id: "actions",
    cell: ({ row, table }) => {
      const meta = table.options.meta as any
      return (
        <DataTableRowActions
          row={row}
          onView={meta?.onView}
          onEdit={meta?.onEdit}
        />
      )
    },
  },
]
