"use client"

import { useRouter } from "next/navigation"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react"
import { TransactionListItem, PaymentStatus } from "../../hooks/use-admin-revenue"

interface PaymentTransactionsTableProps {
  transactions: TransactionListItem[]
  pagination: {
    page: number
    limit: number
    total: number
    totalPages: number
  } | null
  isLoading?: boolean
  onPageChange: (page: number) => void
}

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

function getStatusBadge(status: PaymentStatus) {
  const variants: Record<PaymentStatus, { variant: "default" | "secondary" | "destructive" | "outline"; className: string }> = {
    COMPLETED: { variant: "default", className: "bg-green-500 hover:bg-green-500/80" },
    PENDING: { variant: "secondary", className: "bg-yellow-500 text-white hover:bg-yellow-500/80" },
    FAILED: { variant: "destructive", className: "" },
    EXPIRED: { variant: "outline", className: "text-gray-500" },
    CANCELLED: { variant: "outline", className: "text-red-500" },
  }

  const config = variants[status]
  return (
    <Badge variant={config.variant} className={config.className}>
      {status}
    </Badge>
  )
}

function getTierBadge(tier: string) {
  if (tier === "PRO") {
    return <Badge className="bg-purple-500 hover:bg-purple-500/80">PRO</Badge>
  }
  return <Badge className="bg-blue-500 hover:bg-blue-500/80">LITE</Badge>
}


function TableSkeleton() {
  return (
    <TableBody>
      {Array.from({ length: 10 }).map((_, i) => (
        <TableRow key={i}>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell>
            <div className="space-y-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-40" />
            </div>
          </TableCell>
          <TableCell><Skeleton className="h-4 w-24" /></TableCell>
          <TableCell><Skeleton className="h-5 w-12" /></TableCell>
          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
          <TableCell><Skeleton className="h-4 w-20" /></TableCell>
        </TableRow>
      ))}
    </TableBody>
  )
}

export function PaymentTransactionsTable({
  transactions,
  pagination,
  isLoading,
  onPageChange,
}: PaymentTransactionsTableProps) {
  const router = useRouter()

  const handleRowClick = (userId: string) => {
    router.push(`/admin/users/${userId}`)
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order ID</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Tier</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          {isLoading ? (
            <TableSkeleton />
          ) : (
            <TableBody>
              {transactions.length > 0 ? (
                transactions.map((txn) => (
                  <TableRow
                    key={txn.id}
                    className="cursor-pointer hover:bg-gray-50/50"
                    onClick={() => handleRowClick(txn.userId)}
                  >
                    <TableCell className="font-mono text-xs text-gray-700">{txn.orderId}</TableCell>
                    <TableCell>
                      <div>
                        <div className="font-semibold text-gray-900 text-xs">{txn.userName}</div>
                        <div className="text-xs text-gray-500">{txn.userEmail}</div>
                      </div>
                    </TableCell>
                    <TableCell className="font-semibold text-gray-900 text-xs">{formatIDR(txn.amount)}</TableCell>
                    <TableCell>{getTierBadge(txn.targetTier)}</TableCell>
                    <TableCell>{getStatusBadge(txn.status)}</TableCell>
                    <TableCell className="text-gray-500 text-xs">{formatDate(txn.createdAt)}</TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={6} className="h-24 text-center text-gray-500 text-xs">
                    No transactions found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          )}
        </Table>

        {pagination && (
          <div className="bg-gray-50 px-5 py-3 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-100">
            <span className="text-xs text-gray-500 font-medium">
              Showing {((pagination.page - 1) * pagination.limit) + 1} to{" "}
              {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
              {pagination.total} transactions
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onPageChange(pagination.page - 1)}
                disabled={pagination.page <= 1}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-semibold px-2 text-gray-700">
                Page {pagination.page} of {pagination.totalPages}
              </span>
              <button
                type="button"
                onClick={() => onPageChange(pagination.page + 1)}
                disabled={pagination.page >= pagination.totalPages}
                className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-500 hover:text-gray-900 hover:bg-gray-50 transition-colors disabled:opacity-40 disabled:pointer-events-none"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
