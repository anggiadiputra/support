"use client"

import { useState, useEffect, useCallback } from "react"
import { Link } from "@/i18n/routing"
import { format } from "date-fns"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  IconPlus,
  IconSearch,
  IconRefresh,
  IconChevronLeft,
  IconChevronRight,
  IconBell,
  IconEye,
  IconCheck,
  IconClock,
} from "@tabler/icons-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface NotificationBatch {
  id: string
  title: string
  message: string
  type: string
  priority: string
  recipientType: string
  recipientCount: number
  sentAt: string
  sentBy: {
    id: string
    email: string
    name: string
  }
}

interface BatchDetail {
  batch: NotificationBatch & {
    actionUrl: string | null
    actionLabel: string | null
    expiresAt: string | null
    recipientFilter: Record<string, unknown> | null
  }
  recipients: Array<{
    userId: string
    email: string
    name: string
    isRead: boolean
    readAt: string | null
  }>
  stats: {
    total: number
    read: number
    unread: number
  }
}

const NOTIFICATION_TYPES = [
  { value: "ALL", label: "All Types" },
  { value: "SYSTEM_ANNOUNCEMENT", label: "System Announcement" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "CUSTOM", label: "Custom" },
  { value: "MESSAGE_RETENTION", label: "Message Retention" },
  { value: "SUBSCRIPTION_EXPIRY", label: "Subscription Expiry" },
  { value: "PAYMENT_STATUS", label: "Payment Status" },
  { value: "API_KEY_EXPIRY", label: "API Key Expiry" },
]

const priorityColors: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-700",
  NORMAL: "bg-blue-100 text-blue-700",
  HIGH: "bg-orange-100 text-orange-700",
  URGENT: "bg-red-100 text-red-700",
}

const typeColors: Record<string, string> = {
  SYSTEM_ANNOUNCEMENT: "bg-purple-100 text-purple-700",
  MAINTENANCE: "bg-yellow-100 text-yellow-700",
  PROMOTION: "bg-green-100 text-green-700",
  CUSTOM: "bg-gray-100 text-gray-700",
  MESSAGE_RETENTION: "bg-orange-100 text-orange-700",
  SUBSCRIPTION_EXPIRY: "bg-red-100 text-red-700",
  PAYMENT_STATUS: "bg-blue-100 text-blue-700",
  API_KEY_EXPIRY: "bg-amber-100 text-amber-700",
}

export default function NotificationHistoryPage() {
  const [batches, setBatches] = useState<NotificationBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("ALL")
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  // Detail dialog state
  const [selectedBatchId, setSelectedBatchId] = useState<string | null>(null)
  const [batchDetail, setBatchDetail] = useState<BatchDetail | null>(null)
  const [isLoadingDetail, setIsLoadingDetail] = useState(false)

  const limit = 20

  // Fetch notification history
  const fetchHistory = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      })
      if (search) params.append("search", search)
      if (typeFilter && typeFilter !== "ALL") params.append("type", typeFilter)

      const response = await fetch(
        `${API_URL}/api/v1/admin/notifications/history?${params}`,
        { credentials: "include" }
      )
      const result = await response.json()

      if (result.success) {
        setBatches(result.data.items)
        setTotalPages(result.data.totalPages)
        setTotal(result.data.total)
      }
    } catch {
      // Handle error silently
    } finally {
      setIsLoading(false)
    }
  }, [page, search, typeFilter])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  // Fetch batch detail
  const fetchBatchDetail = async (batchId: string) => {
    setSelectedBatchId(batchId)
    setIsLoadingDetail(true)
    setBatchDetail(null)

    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/notifications/history/${batchId}`,
        { credentials: "include" }
      )
      const result = await response.json()

      if (result.success) {
        setBatchDetail(result.data)
      }
    } catch {
      // Handle error silently
    } finally {
      setIsLoadingDetail(false)
    }
  }

  // Handle search with debounce
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
  }

  // Handle type filter
  const handleTypeChange = (value: string) => {
    setTypeFilter(value)
    setPage(1)
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admin">Admin</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Notifications</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Notification History</h2>
            <p className="text-muted-foreground">
              View all notifications sent to users
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchHistory}>
              <IconRefresh className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button asChild size="sm">
              <Link href="/admin/notifications/send">
                <IconPlus className="h-4 w-4 mr-2" />
                Send New
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by title..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={handleTypeChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            {NOTIFICATION_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>
                {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Recipients</TableHead>
                <TableHead>Sent At</TableHead>
                <TableHead>Sent By</TableHead>
                <TableHead className="w-[80px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                ))
              ) : batches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">
                    <IconBell className="h-10 w-10 mx-auto mb-2 opacity-50" />
                    No notifications found
                  </TableCell>
                </TableRow>
              ) : (
                batches.map((batch) => (
                  <TableRow key={batch.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-medium max-w-[200px] truncate">
                      {batch.title}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={typeColors[batch.type] || ""}>
                        {batch.type.replace(/_/g, " ")}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={priorityColors[batch.priority] || ""}>
                        {batch.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="text-sm">
                        {batch.recipientCount} users
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {format(new Date(batch.sentAt), "MMM d, yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="text-sm">
                      {batch.sentBy.name || batch.sentBy.email}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => fetchBatchDetail(batch.id)}
                      >
                        <IconEye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {batches.length} of {total} notifications
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              <IconChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              Page {page} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              <IconChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={selectedBatchId !== null} onOpenChange={() => setSelectedBatchId(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Notification Details</DialogTitle>
            <DialogDescription>
              View notification details and recipient status
            </DialogDescription>
          </DialogHeader>

          {isLoadingDetail ? (
            <div className="space-y-4">
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : batchDetail ? (
            <div className="space-y-6">
              {/* Notification Info */}
              <div className="space-y-3">
                <h4 className="font-semibold">{batchDetail.batch.title}</h4>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {batchDetail.batch.message}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Badge variant="outline" className={typeColors[batchDetail.batch.type] || ""}>
                    {batchDetail.batch.type.replace(/_/g, " ")}
                  </Badge>
                  <Badge variant="outline" className={priorityColors[batchDetail.batch.priority] || ""}>
                    {batchDetail.batch.priority}
                  </Badge>
                  <Badge variant="outline">
                    {batchDetail.batch.recipientType.replace(/_/g, " ")}
                  </Badge>
                </div>
                {batchDetail.batch.actionUrl && (
                  <p className="text-sm">
                    <span className="text-muted-foreground">Action:</span>{" "}
                    {batchDetail.batch.actionLabel || batchDetail.batch.actionUrl}
                  </p>
                )}
              </div>

              {/* Stats */}
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Read Status</CardTitle>
                </CardHeader>
                <CardContent className="py-3">
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                      <div className="text-2xl font-bold">{batchDetail.stats.total}</div>
                      <div className="text-xs text-muted-foreground">Total</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-green-600">{batchDetail.stats.read}</div>
                      <div className="text-xs text-muted-foreground">Read</div>
                    </div>
                    <div>
                      <div className="text-2xl font-bold text-orange-600">{batchDetail.stats.unread}</div>
                      <div className="text-xs text-muted-foreground">Unread</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recipients */}
              <div>
                <h4 className="text-sm font-semibold mb-2">Recipients</h4>
                <ScrollArea className="h-[200px] rounded-md border">
                  <div className="p-2 space-y-1">
                    {batchDetail.recipients.map((recipient) => (
                      <div
                        key={recipient.userId}
                        className="flex items-center justify-between p-2 rounded hover:bg-muted"
                      >
                        <div className="text-sm">
                          <div className="font-medium">{recipient.name || recipient.email}</div>
                          {recipient.name && (
                            <div className="text-xs text-muted-foreground">{recipient.email}</div>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {recipient.isRead ? (
                            <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                              <IconCheck className="h-3 w-3 mr-1" />
                              Read
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-orange-50 text-orange-700 text-xs">
                              <IconClock className="h-3 w-3 mr-1" />
                              Unread
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>

              {/* Meta info */}
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Sent at: {format(new Date(batchDetail.batch.sentAt), "PPpp")}</p>
                <p>Sent by: {batchDetail.batch.sentBy.name || batchDetail.batch.sentBy.email}</p>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}
