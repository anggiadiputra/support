"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { format } from "date-fns"
import { RefreshCw, Filter, X, Calendar as CalendarIcon, FileText, User, Eye, ChevronRight, Clock, Globe, Activity, Search } from "lucide-react"
import { DateRange } from "react-day-picker"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from "@/components/ui/pagination"
import { cn } from "@/lib/utils"
import { useAdminAudit, useAuditFilters, type AuditLogItem } from "../hooks/use-admin-audit"

function getActionBadgeVariant(action: string) {
  if (action.includes("CREATE") || action.includes("create")) return "default"
  if (action.includes("UPDATE") || action.includes("update")) return "secondary"
  if (action.includes("DELETE") || action.includes("delete")) return "destructive"
  if (action.includes("LOGIN") || action.includes("login")) return "outline"
  if (action.includes("SUCCESS")) return "default"
  if (action.includes("FAILED")) return "destructive"
  return "outline"
}

function formatTimestamp(dateString: string) {
  return new Date(dateString).toLocaleString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatFullTimestamp(dateString: string) {
  return new Date(dateString).toLocaleString("id-ID", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  })
}

function formatDetails(details: unknown): string {
  if (!details) return "-"
  if (typeof details === "string") return details
  try {
    return JSON.stringify(details, null, 2)
  } catch {
    return "-"
  }
}

function AuditTableSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i} className="min-h-[48px]">
          <TableCell className="py-3"><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell className="py-3"><Skeleton className="h-5 w-24" /></TableCell>
          <TableCell className="py-3"><Skeleton className="h-4 w-20" /></TableCell>
          <TableCell className="py-3"><Skeleton className="h-4 w-32" /></TableCell>
          <TableCell className="hidden lg:table-cell py-3"><Skeleton className="h-4 w-48" /></TableCell>
          <TableCell className="hidden md:table-cell py-3"><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell className="py-3"><Skeleton className="h-4 w-8" /></TableCell>
        </TableRow>
      ))}
    </TableBody>
  )
}

function MobileCardSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <Card key={i}>
          <CardContent className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="flex items-center gap-2">
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-20" />
              </div>
              <Skeleton className="h-4 w-40" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function DateRangePicker({
  dateRange,
  onDateRangeChange,
}: {
  dateRange: DateRange | undefined
  onDateRangeChange: (range: DateRange | undefined) => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "w-full sm:w-[280px] justify-start text-left font-normal",
            !dateRange && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {dateRange?.from ? (
            dateRange.to ? (
              <>
                {format(dateRange.from, "LLL dd, y")} -{" "}
                {format(dateRange.to, "LLL dd, y")}
              </>
            ) : (
              format(dateRange.from, "LLL dd, y")
            )
          ) : (
            <span>Pick a date range</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          initialFocus
          mode="range"
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={onDateRangeChange}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  )
}

function LogDetailsCell({ details }: { details: unknown }) {
  const detailsStr = formatDetails(details)
  const isLong = detailsStr.length > 80

  if (detailsStr === "-") return <span className="text-muted-foreground">-</span>

  return (
    <span className="font-mono text-xs text-muted-foreground">
      {isLong ? `${detailsStr.slice(0, 80)}...` : detailsStr}
    </span>
  )
}

// Detail Sheet Component
function AuditLogDetailSheet({
  log,
  open,
  onOpenChange,
}: {
  log: AuditLogItem | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!log) return null

  const detailsStr = formatDetails(log.details)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Audit Log Detail
          </SheetTitle>
          <SheetDescription>
            {formatFullTimestamp(log.timestamp)}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6">
          {/* Action */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground">Action</label>
            <div>
              <Badge variant={getActionBadgeVariant(log.action)} className="text-sm">
                {log.action}
              </Badge>
            </div>
          </div>

          <Separator />

          {/* Entity Information */}
          <div className="space-y-4">
            <label className="text-sm font-medium text-muted-foreground">Entity</label>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">Type</p>
                <p className="font-medium">{log.entityType}</p>
              </div>
              <div className="space-y-1">
                <p className="text-xs text-muted-foreground">ID</p>
                <p className="font-mono text-sm break-all">{log.entityId}</p>
              </div>
            </div>
          </div>

          <Separator />

          {/* User Information */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <User className="h-4 w-4" />
              User
            </label>
            {log.user ? (
              <div className="bg-muted/50 rounded-lg p-3">
                <p className="font-medium">{log.user.name}</p>
                <p className="text-sm text-muted-foreground">{log.user.email}</p>
              </div>
            ) : (
              <p className="text-muted-foreground">System</p>
            )}
          </div>

          <Separator />

          {/* IP Address */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Globe className="h-4 w-4" />
              IP Address
            </label>
            <p className="font-mono text-sm">{log.ipAddress || "-"}</p>
          </div>

          <Separator />

          {/* Details */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Details
            </label>
            {detailsStr === "-" ? (
              <p className="text-muted-foreground">No details available</p>
            ) : (
              <ScrollArea className="h-[200px] w-full rounded-lg border bg-muted/30">
                <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
                  {detailsStr}
                </pre>
              </ScrollArea>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

// Mobile Card Component
function AuditLogCard({
  log,
  onClick,
}: {
  log: AuditLogItem
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors active:bg-muted"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0 space-y-2">
            {/* Action Badge */}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={getActionBadgeVariant(log.action)} className="text-xs">
                {log.action}
              </Badge>
              <span className="text-xs text-muted-foreground">{log.entityType}</span>
            </div>

            {/* User */}
            <div className="flex items-center gap-2 text-sm">
              <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className="truncate">
                {log.user ? log.user.name : "System"}
              </span>
            </div>

            {/* Timestamp */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Clock className="h-3 w-3 flex-shrink-0" />
              {formatTimestamp(log.timestamp)}
            </div>
          </div>

          {/* Chevron */}
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-1" />
        </div>
      </CardContent>
    </Card>
  )
}

export default function AdminAuditPage() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>()
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [searchInput, setSearchInput] = useState("")
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const { actions, entityTypes, isLoading: filtersLoading } = useAuditFilters()
  const { logs, pagination, isLoading, error, refetch, setQuery, query } = useAdminAudit({
    page: 1,
    limit: 20,
  })

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value)
    
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }
    
    searchTimeoutRef.current = setTimeout(() => {
      setQuery({
        ...query,
        search: value.trim() || undefined,
        page: 1,
      })
    }, 500)
  }, [query, setQuery])

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [])

  const handleActionFilter = useCallback((value: string) => {
    setQuery({
      ...query,
      action: value === "all" ? undefined : value,
      page: 1,
    })
  }, [query, setQuery])

  const handleEntityFilter = useCallback((value: string) => {
    setQuery({
      ...query,
      entityType: value === "all" ? undefined : value,
      page: 1,
    })
  }, [query, setQuery])

  const handleDateRangeChange = useCallback((range: DateRange | undefined) => {
    setDateRange(range)
    setQuery({
      ...query,
      startDate: range?.from ? range.from.toISOString() : undefined,
      endDate: range?.to ? range.to.toISOString() : undefined,
      page: 1,
    })
  }, [query, setQuery])

  const handlePageChange = useCallback((page: number) => {
    setQuery({ ...query, page })
  }, [query, setQuery])

  const clearFilters = useCallback(() => {
    setDateRange(undefined)
    setSearchInput("")
    setQuery({ page: 1, limit: 20 })
  }, [setQuery])

  const handleLogClick = useCallback((log: AuditLogItem) => {
    setSelectedLog(log)
    setSheetOpen(true)
  }, [])

  const hasActiveFilters = query.action || query.entityType || query.startDate || query.endDate || query.search

  const renderPaginationItems = () => {
    if (!pagination) return null
    const { page, totalPages } = pagination
    const items = []
    const maxVisible = 5

    let start = Math.max(1, page - Math.floor(maxVisible / 2))
    const end = Math.min(totalPages, start + maxVisible - 1)

    if (end - start + 1 < maxVisible) {
      start = Math.max(1, end - maxVisible + 1)
    }

    if (start > 1) {
      items.push(
        <PaginationItem key={1}>
          <PaginationLink onClick={() => handlePageChange(1)}>1</PaginationLink>
        </PaginationItem>
      )
      if (start > 2) {
        items.push(<PaginationEllipsis key="start-ellipsis" />)
      }
    }

    for (let i = start; i <= end; i++) {
      items.push(
        <PaginationItem key={i}>
          <PaginationLink
            isActive={i === page}
            onClick={() => handlePageChange(i)}
          >
            {i}
          </PaginationLink>
        </PaginationItem>
      )
    }

    if (end < totalPages) {
      if (end < totalPages - 1) {
        items.push(<PaginationEllipsis key="end-ellipsis" />)
      }
      items.push(
        <PaginationItem key={totalPages}>
          <PaginationLink onClick={() => handlePageChange(totalPages)}>
            {totalPages}
          </PaginationLink>
        </PaginationItem>
      )
    }

    return items
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Audit Logs</h1>
          <p className="text-sm text-muted-foreground">
            Track system events and user actions
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:flex-wrap">
        {/* Search Input */}
        <div className="relative w-full sm:w-[280px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Cari user, entity, akun..."
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 pr-9"
          />
          {searchInput && (
            <button
              type="button"
              onClick={() => handleSearchChange("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <DateRangePicker
          dateRange={dateRange}
          onDateRangeChange={handleDateRangeChange}
        />

        <div className="flex gap-2 sm:gap-4">
          <Select value={query.action || "all"} onValueChange={handleActionFilter}>
            <SelectTrigger className="flex-1 sm:w-[160px]">
              <Filter className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue placeholder="Action" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Actions</SelectItem>
              {actions.map((action) => (
                <SelectItem key={action} value={action}>
                  {action}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={query.entityType || "all"} onValueChange={handleEntityFilter}>
            <SelectTrigger className="flex-1 sm:w-[160px]">
              <FileText className="h-4 w-4 mr-2 flex-shrink-0" />
              <SelectValue placeholder="Entity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Entities</SelectItem>
              {entityTypes.map((entity) => (
                <SelectItem key={entity} value={entity}>
                  {entity}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="self-start sm:self-auto">
            <X className="h-4 w-4 mr-1" />
            Clear
          </Button>
        )}
      </div>

      {/* Results count */}
      {pagination && (
        <p className="text-sm text-muted-foreground">
          Showing {logs.length} of {pagination.total} logs
        </p>
      )}

      {/* Mobile Card View (visible on small screens) */}
      <div className="block md:hidden">
        {isLoading ? (
          <MobileCardSkeleton />
        ) : logs.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No audit logs found.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {logs.map((log) => (
              <AuditLogCard
                key={log.id}
                log={log}
                onClick={() => handleLogClick(log)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Desktop Table View (visible on medium+ screens) */}
      <div className="hidden md:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Timestamp</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>User</TableHead>
              <TableHead className="hidden lg:table-cell">Details</TableHead>
              <TableHead className="hidden lg:table-cell">IP Address</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <AuditTableSkeleton />
          ) : (
            <TableBody>
              {logs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No audit logs found.
                  </TableCell>
                </TableRow>
              ) : (
                logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="min-h-[48px] cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleLogClick(log)}
                  >
                    <TableCell className="whitespace-nowrap py-3">
                      {formatTimestamp(log.timestamp)}
                    </TableCell>
                    <TableCell className="py-3">
                      <Badge variant={getActionBadgeVariant(log.action)}>
                        {log.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-3">
                      <div className="flex flex-col">
                        <span className="font-medium">{log.entityType}</span>
                        <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                          {log.entityId}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="py-3">
                      {log.user ? (
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground hidden lg:block" />
                          <div className="flex flex-col">
                            <span className="font-medium">{log.user.name}</span>
                            <span className="text-xs text-muted-foreground hidden lg:block">
                              {log.user.email}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">System</span>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[200px] hidden lg:table-cell py-3">
                      <LogDetailsCell details={log.details} />
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden lg:table-cell py-3">
                      {log.ipAddress || "-"}
                    </TableCell>
                    <TableCell className="py-3">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <Pagination>
          <PaginationContent className="flex-wrap justify-center gap-1">
            <PaginationItem>
              <PaginationPrevious
                onClick={() => handlePageChange(Math.max(1, pagination.page - 1))}
                className={cn(
                  "min-h-[44px]",
                  pagination.page <= 1 ? "pointer-events-none opacity-50" : "cursor-pointer"
                )}
              />
            </PaginationItem>
            {renderPaginationItems()}
            <PaginationItem>
              <PaginationNext
                onClick={() => handlePageChange(Math.min(pagination.totalPages, pagination.page + 1))}
                className={cn(
                  "min-h-[44px]",
                  pagination.page >= pagination.totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                )}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}

      {/* Detail Sheet */}
      <AuditLogDetailSheet
        log={selectedLog}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
    </div>
  )
}
