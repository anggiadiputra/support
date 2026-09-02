"use client"

import { ChevronLeft, ChevronRight } from "lucide-react"
import { Table } from "@tanstack/react-table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface Props<TData> {
  table: Table<TData>
}

export function DataTablePagination<TData>({ table }: Props<TData>) {
  const pageIndex = table.getState().pagination.pageIndex
  const pageSize = table.getState().pagination.pageSize
  const totalRows = table.getFilteredRowModel().rows.length
  const pageCount = table.getPageCount()
  const startRow = totalRows === 0 ? 0 : pageIndex * pageSize + 1
  const endRow = Math.min((pageIndex + 1) * pageSize, totalRows)

  // Generate page numbers to show
  const getPageNumbers = () => {
    const pages = []
    const maxPages = 5
    let start = Math.max(0, pageIndex - Math.floor(maxPages / 2))
    let end = Math.min(pageCount - 1, start + maxPages - 1)
    if (end - start + 1 < maxPages) {
      start = Math.max(0, end - maxPages + 1)
    }
    for (let i = start; i <= end; i++) {
      pages.push(i)
    }
    return pages
  }

  return (
    <div className="bg-gray-50 px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100">
      <div className="flex items-center gap-3">
        <span className="text-xs text-gray-500 font-medium">
          Showing {startRow} to {endRow} of {totalRows}
        </span>
        <div className="flex items-center gap-1.5">
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="h-7 w-[65px] text-xs border-gray-200 bg-white">
              <SelectValue placeholder={pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 50, 100].map((size) => (
                <SelectItem key={size} value={`${size}`} className="text-xs">
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
          className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {getPageNumbers().map((page) => (
          <button
            key={page}
            type="button"
            onClick={() => table.setPageIndex(page)}
            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
              page === pageIndex
                ? "bg-black text-white shadow-sm"
                : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900"
            }`}
          >
            {page + 1}
          </button>
        ))}

        <button
          type="button"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
          className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
