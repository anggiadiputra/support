"use client"

import { useState } from "react"
import { Link } from "@/i18n/routing"
import {
  RefreshCw,
  Search,
  CheckCircle,
  XCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
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
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  useAdminCommissions,
  useReleaseCommission,
  useCancelCommission,
} from "../../hooks/use-admin-affiliate"
import type { AdminCommission } from "@/lib/api/admin-affiliate-api"

type CommissionStatus = "PENDING" | "CREDITED" | "CANCELLED"

function formatIDR(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

function getStatusBadge(status: CommissionStatus) {
  const variants: Record<
    CommissionStatus,
    { variant: "default" | "secondary" | "destructive" | "outline"; className: string }
  > = {
    PENDING: { variant: "secondary", className: "bg-yellow-500 text-white hover:bg-yellow-500/80" },
    CREDITED: { variant: "default", className: "bg-green-500 hover:bg-green-500/80" },
    CANCELLED: { variant: "destructive", className: "" },
  }

  const config = variants[status]
  return (
    <Badge variant={config.variant} className={config.className}>
      {status}
    </Badge>
  )
}

function getTypeBadge(type: "SUBSCRIPTION" | "TOP_UP") {
  if (type === "SUBSCRIPTION") {
    return <Badge className="bg-purple-500 hover:bg-purple-500/80">SUB</Badge>
  }
  return <Badge className="bg-blue-500 hover:bg-blue-500/80">TOP_UP</Badge>
}

function TableSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell>
            <div className="space-y-1">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3 w-32" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16" />
          </TableCell>
          <TableCell>
            <div className="space-y-1">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-3 w-12" />
            </div>
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-5 w-16" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-4 w-20" />
          </TableCell>
          <TableCell>
            <Skeleton className="h-8 w-24" />
          </TableCell>
        </TableRow>
      ))}
    </TableBody>
  )
}

interface CommissionActionsProps {
  commission: AdminCommission
  onRelease: (id: string) => void
  onCancel: (id: string) => void
  isReleasing: boolean
  isCancelling: boolean
}

function CommissionActions({
  commission,
  onRelease,
  onCancel,
  isReleasing,
  isCancelling,
}: CommissionActionsProps) {
  if (commission.status !== "PENDING") {
    return <span className="text-sm text-muted-foreground">-</span>
  }

  return (
    <div className="flex items-center gap-2">
      {/* Release Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isReleasing || isCancelling}
            className="h-8"
          >
            {isReleasing ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <CheckCircle className="h-3 w-3" />
            )}
            <span className="ml-1">Release</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Release Commission Early?</AlertDialogTitle>
            <AlertDialogDescription>
              This will credit{" "}
              <strong>{formatIDR(commission.commissionAmount)}</strong> to{" "}
              <strong>{commission.affiliate.user.name}</strong> immediately.
              <br />
              <br />
              The commission will be added to their credit balance right away instead
              of waiting until the scheduled release date.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onRelease(commission.id)}
              className="bg-green-600 hover:bg-green-600/90"
            >
              Yes, Release Now
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Cancel Button */}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            disabled={isReleasing || isCancelling}
            className="h-8 text-destructive hover:text-destructive"
          >
            {isCancelling ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <XCircle className="h-3 w-3" />
            )}
            <span className="ml-1">Cancel</span>
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Commission?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel this commission of{" "}
              <strong>{formatIDR(commission.commissionAmount)}</strong> for{" "}
              <strong>{commission.affiliate.user.name}</strong>?
              <br />
              <br />
              <span className="text-destructive font-medium">
                This action cannot be undone.
              </span>{" "}
              The affiliate will not receive this commission.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Commission</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => onCancel(commission.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Yes, Cancel Commission
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default function AdminCommissionsPage() {
  const { toast } = useToast()

  // Filters state
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState<CommissionStatus | "ALL">("ALL")
  const [page, setPage] = useState(1)
  const limit = 10

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState("")

  // Handle search with debounce
  const handleSearchChange = (value: string) => {
    setSearch(value)
    setPage(1)
    // Simple debounce using setTimeout
    const timer = setTimeout(() => {
      setDebouncedSearch(value)
    }, 300)
    return () => clearTimeout(timer)
  }

  // Query params
  const queryParams = {
    page,
    limit,
    search: debouncedSearch || undefined,
    status: statusFilter !== "ALL" ? statusFilter : undefined,
  }

  // Fetch commissions
  const {
    data,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useAdminCommissions(queryParams)

  // Mutations
  const releaseCommission = useReleaseCommission()
  const cancelCommission = useCancelCommission()

  const handleRelease = async (id: string) => {
    try {
      await releaseCommission.mutateAsync(id)
      toast({
        title: "Commission Released",
        description: "The commission has been credited to the affiliate.",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to release commission",
        variant: "destructive",
      })
    }
  }

  const handleCancel = async (id: string) => {
    try {
      await cancelCommission.mutateAsync(id)
      toast({
        title: "Commission Cancelled",
        description: "The commission has been cancelled.",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to cancel commission",
        variant: "destructive",
      })
    }
  }

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value as CommissionStatus | "ALL")
    setPage(1)
  }

  const commissions = data?.commissions || []
  const pagination = data?.pagination || null

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
              <BreadcrumbPage>Affiliate Commissions</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Affiliate Commissions</h2>
            <p className="text-muted-foreground">
              Manage and track all affiliate commission payments
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load commissions"}
          </AlertDescription>
        </Alert>
      )}

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by affiliate name or email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilterChange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Status</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="CREDITED">Credited</SelectItem>
            <SelectItem value="CANCELLED">Cancelled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Affiliate</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Transaction</TableHead>
              <TableHead>Commission</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Release Date</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <TableBody>
              {commissions.length > 0 ? (
                commissions.map((commission) => (
                  <TableRow key={commission.id}>
                    <TableCell>
                      <div>
                        <div className="font-medium">{commission.affiliate.user.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {commission.affiliate.user.email}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getTypeBadge(commission.transactionType)}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-medium">
                          {formatIDR(commission.transactionAmount)}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ({commission.commissionPercentage}%)
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">
                      {formatIDR(commission.commissionAmount)}
                    </TableCell>
                    <TableCell>{getStatusBadge(commission.status)}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {commission.status === "PENDING"
                        ? formatDate(commission.releaseAt)
                        : commission.status === "CREDITED" && commission.creditedAt
                          ? formatDate(commission.creditedAt)
                          : "-"}
                    </TableCell>
                    <TableCell>
                      <CommissionActions
                        commission={commission}
                        onRelease={handleRelease}
                        onCancel={handleCancel}
                        isReleasing={releaseCommission.isPending}
                        isCancelling={cancelCommission.isPending}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No commissions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          )}
        </Table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 0 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} commissions
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(1)}
              disabled={pagination.page <= 1}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(pagination.page + 1)}
              disabled={pagination.page >= pagination.totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(pagination.totalPages)}
              disabled={pagination.page >= pagination.totalPages}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
