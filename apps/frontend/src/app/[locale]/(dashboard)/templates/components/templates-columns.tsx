"use client"

import { ColumnDef } from "@tanstack/react-table"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { categories, statuses, qualities } from "../data/data"
import { Template, countTemplateVariables, hasDynamicUrl } from "../data/schema"
import { DataTableColumnHeader } from "./data-table-column-header"
import { DataTableRowActions } from "./data-table-row-actions"
import { format } from "date-fns"
import { IconVariable, IconLink } from "@tabler/icons-react"

export const columns: ColumnDef<Template>[] = [
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
    accessorKey: "templateName",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Template Name" />
    ),
    cell: ({ row }) => {
      const variableCount = countTemplateVariables(row.original)
      const isDynamicUrl = hasDynamicUrl(row.original)
      
      return (
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="max-w-[200px] truncate font-semibold">
              {row.getValue("templateName")}
            </span>
            <div className="flex items-center gap-1">
              {variableCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs px-1.5 py-0">
                  <IconVariable className="h-3 w-3" />
                  {variableCount}
                </Badge>
              )}
              {isDynamicUrl && (
                <Badge variant="outline" className="gap-1 text-xs px-1.5 py-0 text-purple-600 border-purple-300">
                  <IconLink className="h-3 w-3" />
                  URL
                </Badge>
              )}
            </div>
          </div>
          <span className="text-muted-foreground max-w-[300px] truncate text-xs">
            {row.original.content}
          </span>
        </div>
      )
    },
  },
  {
    accessorKey: "category",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Category" />
    ),
    cell: ({ row }) => {
      const category = categories.find(
        (cat) => cat.value === row.getValue("category")
      )

      if (!category) {
        return null
      }

      return (
        <div className="flex items-center gap-2">
          {category.icon && (
            <category.icon className="text-muted-foreground h-4 w-4" />
          )}
          <span className="text-sm">{category.label}</span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "status",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Status" />
    ),
    cell: ({ row }) => {
      const status = statuses.find(
        (status) => status.value === row.getValue("status")
      )

      if (!status) {
        return null
      }

      const Icon = status.icon

      return (
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${status.color}`} />
          <Badge
            variant={
              status.value === "APPROVED"
                ? "default"
                : status.value === "PENDING"
                  ? "secondary"
                  : "destructive"
            }
            className="font-medium"
          >
            {status.label}
          </Badge>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "language",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Language" />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex items-center">
          <span className="text-sm">{row.getValue("language")}</span>
        </div>
      )
    },
  },
  {
    accessorKey: "quality",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Quality" />
    ),
    cell: ({ row }) => {
      const quality = qualities.find(
        (q) => q.value === row.getValue("quality")
      )

      if (!quality || !row.getValue("quality")) {
        return <span className="text-muted-foreground text-sm">-</span>
      }

      return (
        <div className="flex items-center">
          <span className={`text-sm font-medium ${quality.color}`}>
            {quality.label}
          </span>
        </div>
      )
    },
    filterFn: (row, id, value) => {
      return value.includes(row.getValue(id))
    },
  },
  {
    accessorKey: "createdAt",
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title="Created" />
    ),
    cell: ({ row }) => {
      return (
        <div className="flex items-center">
          <span className="text-muted-foreground text-sm">
            {format(row.getValue("createdAt"), "MMM dd, yyyy")}
          </span>
        </div>
      )
    },
  },
  {
    id: "actions",
    cell: DataTableRowActions,
  },
]
