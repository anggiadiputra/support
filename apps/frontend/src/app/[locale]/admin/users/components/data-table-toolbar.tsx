"use client"

import { useState, useEffect, useCallback } from "react"
import { Cross2Icon } from "@radix-ui/react-icons"
import { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import {
  IconShield,
  IconUserShield,
  IconUser,
  IconDownload,
  IconSearch,
  IconLoader2,
} from "@tabler/icons-react"
import { AdminUser } from "./data-table-row-actions"

const roleOptions = [
  { label: "Admin", value: "ADMIN", icon: IconShield },
  { label: "Business Owner", value: "BUSINESS_OWNER", icon: IconUserShield },
  { label: "Agent", value: "AGENT", icon: IconUser },
]

const statusOptions = [
  { label: "Active", value: "active" },
  { label: "Inactive", value: "inactive" },
]

const tierOptions = [
  { label: "Free", value: "FREE" },
  { label: "Lite", value: "LITE" },
  { label: "Pro", value: "PRO" },
]

interface Props<TData> {
  table: Table<TData>
  onSearch?: (search: string) => void
  searchValue?: string
  isSearching?: boolean
}

export function DataTableToolbar<TData>({ table, onSearch, searchValue = "", isSearching }: Props<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0 || searchValue.length > 0
  const [localSearch, setLocalSearch] = useState(searchValue)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (onSearch && localSearch !== searchValue) {
        onSearch(localSearch)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [localSearch, onSearch, searchValue])

  // Sync external searchValue with local state
  useEffect(() => {
    setLocalSearch(searchValue)
  }, [searchValue])

  const handleReset = useCallback(() => {
    table.resetColumnFilters()
    setLocalSearch("")
    if (onSearch) {
      onSearch("")
    }
  }, [table, onSearch])

  const handleExportCSV = () => {
    // Get filtered rows or all rows
    const rows = table.getFilteredRowModel().rows

    // Extract email data
    const emails = rows.map((row) => {
      const user = row.original as AdminUser
      return {
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.isActive ? 'active' : 'inactive',
        tier: user.subscriptionTier,
        createdAt: user.createdAt,
      }
    })

    // Create CSV content
    const headers = ['Email', 'Name', 'Role', 'Status', 'Tier', 'Created At']
    const csvContent = [
      headers.join(','),
      ...emails.map(user => [
        user.email,
        `"${user.name}"`, // Quote name in case it contains commas
        user.role,
        user.status,
        user.tier,
        user.createdAt,
      ].join(','))
    ].join('\n')

    // Create blob and download
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', `users-export-${new Date().toISOString().split('T')[0]}.csv`)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 flex-col-reverse items-start gap-y-2 sm:flex-row sm:items-center sm:space-x-2">
        <div className="relative">
          <IconSearch className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={localSearch}
            onChange={(event) => setLocalSearch(event.target.value)}
            className="h-8 w-[200px] pl-8 lg:w-[300px]"
          />
          {isSearching && (
            <IconLoader2 className="absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="flex gap-x-2">
          {table.getColumn("status") && (
            <DataTableFacetedFilter
              column={table.getColumn("status")}
              title="Status"
              options={statusOptions}
            />
          )}
          {table.getColumn("role") && (
            <DataTableFacetedFilter
              column={table.getColumn("role")}
              title="Role"
              options={roleOptions}
            />
          )}
          {table.getColumn("subscriptionTier") && (
            <DataTableFacetedFilter
              column={table.getColumn("subscriptionTier")}
              title="Tier"
              options={tierOptions}
            />
          )}
        </div>
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={handleReset}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <Cross2Icon className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={handleExportCSV}
          className="h-8"
        >
          <IconDownload className="mr-2 h-4 w-4" />
          Export CSV
        </Button>
        <DataTableViewOptions table={table} />
      </div>
    </div>
  )
}
