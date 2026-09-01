"use client"

import { Cross2Icon } from "@radix-ui/react-icons"
import { Table } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { consentStatuses } from "../data/data"
import { DataTableFacetedFilter } from "./data-table-faceted-filter"
import { DataTableViewOptions } from "./data-table-view-options"
import { IconDownload, IconUpload } from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { useState } from "react"
import { ImportCsvDialog } from "./import-csv-dialog"

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ||
  (typeof window !== "undefined" && window.location.origin) ||
  "http://localhost:3005"

interface Props<TData> {
  table: Table<TData>
}

export function DataTableToolbar<TData>({ table }: Props<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0
  const [isExporting, setIsExporting] = useState(false)
  const [isImportOpen, setIsImportOpen] = useState(false)
  const { toast } = useToast()

  const handleExport = async () => {
    setIsExporting(true)
    try {
      const selectedRows = table.getSelectedRowModel().rows
      const rowsToExport = selectedRows.length
        ? selectedRows
        : table.getFilteredRowModel().rows

      const ids = rowsToExport
        .map((row: any) => row.original?.id)
        .filter(Boolean)

      const channelFilter = table.getColumn("channels")?.getFilterValue() as string[] | undefined
      const selectedChannel = channelFilter?.[0]

      const params = new URLSearchParams()
      if (selectedChannel) params.append("channel", selectedChannel)
      if (ids.length) params.append("ids", ids.join(","))

      const res = await fetch(`${API_URL}/api/v1/customers/export${params.toString() ? `?${params.toString()}` : ""}`, {
        credentials: "include",
      })

      if (!res.ok) {
        let msg = `Failed to export (status ${res.status})`
        try {
          const data = await res.json()
          msg = data?.error?.message || data?.message || msg
        } catch (_) {
          const fallback = await res.text().catch(() => "")
          if (fallback) msg = fallback
        }
        throw new Error(msg)
      }

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      const suffix = selectedChannel || "all"
      a.href = url
      a.download = `customers-${suffix}-${new Date().toISOString().split("T")[0]}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)

      toast({ title: "Export ready", description: "CSV sudah diunduh." })
    } catch (error: any) {
      console.error("Export customers error", error)
      toast({
        variant: "destructive",
        title: "Export failed",
        description: error?.message || "Tidak bisa mengekspor kontak sekarang.",
      })
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center sm:space-x-2">
        <Input
          placeholder="Search customers..."
          value={(table.getColumn("name")?.getFilterValue() as string) ?? ""}
          onChange={(event) =>
            table.getColumn("name")?.setFilterValue(event.target.value)
          }
          className="h-10 w-full sm:h-8 sm:w-[200px] lg:w-[250px]"
        />
        <div className="flex flex-wrap gap-2">
          {table.getColumn("consentStatus") && (
            <DataTableFacetedFilter
              column={table.getColumn("consentStatus")}
              title="Consent"
              options={consentStatuses}
            />
          )}
          {table.getColumn("channels") && (
            <DataTableFacetedFilter
              column={table.getColumn("channels")}
              title="Channel"
              options={[
                { value: "whatsapp", label: "WhatsApp" },
                { value: "instagram", label: "Instagram" },
                { value: "messenger", label: "Messenger" },
              ]}
            />
          )}
          {table.getColumn("hasActiveWindow") && (
            <DataTableFacetedFilter
              column={table.getColumn("hasActiveWindow")}
              title="Message Window"
              options={[
                { value: "true", label: "Active", icon: undefined },
                { value: "false", label: "Inactive", icon: undefined },
              ]}
            />
          )}
        </div>
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <Cross2Icon className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setIsImportOpen(true)}
          className="w-full sm:w-auto"
        >
          <IconUpload className="h-4 w-4" />
          Import CSV
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={isExporting}
          className="w-full sm:w-auto"
        >
          <IconDownload className="h-4 w-4" />
          {isExporting ? "Exporting..." : "Export CSV"}
        </Button>
        <DataTableViewOptions table={table} />
        <ImportCsvDialog open={isImportOpen} onOpenChange={setIsImportOpen} />
      </div>
    </div>
  )
}
