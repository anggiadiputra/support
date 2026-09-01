'use client'

/**
 * PaymentHistory Component
 * Displays payment transaction history in a table with pagination
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

import { History, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, RefreshCw, FileText } from 'lucide-react'
import { useLocale } from 'next-intl'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import {
  usePaymentHistory,
  type PaymentStatus,
  type PaymentMethod,
} from '../hooks/use-payment-history'

// Status badge variants and labels
const statusConfig: Record<PaymentStatus, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; label: string }> = {
  PENDING: { variant: 'secondary', label: 'Menunggu' },
  COMPLETED: { variant: 'default', label: 'Berhasil' },
  FAILED: { variant: 'destructive', label: 'Gagal' },
  EXPIRED: { variant: 'outline', label: 'Kadaluarsa' },
  CANCELLED: { variant: 'outline', label: 'Dibatalkan' },
}

// Payment method labels
const methodLabels: Record<PaymentMethod, string> = {
  QRIS: 'QRIS',
  SHOPEEPAY: 'ShopeePay',
}

// Format date to Indonesian locale
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Format price to IDR
function formatPrice(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export function PaymentHistory() {
  const locale = useLocale()
  const {
    transactions,
    pagination,
    loading,
    error,
    page,
    setPage,
    checkStatus,
  } = usePaymentHistory(10)

  const totalPages = pagination?.totalPages || 1
  const canPreviousPage = page > 1
  const canNextPage = page < totalPages

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="h-5 w-5" />
          Riwayat Pembayaran
        </CardTitle>
        <CardDescription>
          Daftar transaksi pembayaran subscription Anda
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center space-x-4">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-16" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-6 w-20" />
              </div>
            ))}
          </div>
        ) : error ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            {error}
          </p>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            Belum ada riwayat pembayaran
          </p>
        ) : (
          <>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tanggal</TableHead>
                    <TableHead>Jumlah</TableHead>
                    <TableHead>Metode</TableHead>
                    <TableHead>Paket</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Aksi</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.map((tx) => (
                    <TableRow key={tx.id}>
                      <TableCell className="font-medium">
                        {formatDate(tx.createdAt)}
                      </TableCell>
                      <TableCell>{formatPrice(tx.amount)}</TableCell>
                      <TableCell>
                        {methodLabels[tx.paymentMethod] || tx.paymentMethod}
                      </TableCell>
                      <TableCell>{tx.targetTier}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Badge variant={statusConfig[tx.status]?.variant || 'default'}>
                            {statusConfig[tx.status]?.label || tx.status}
                          </Badge>
                          {tx.status === 'PENDING' && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => checkStatus(tx.orderId)}
                              title="Cek Status Pembayaran"
                            >
                              <RefreshCw className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        {tx.status === 'COMPLETED' && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => window.open(`/${locale}/subscription/invoice/${tx.orderId}`, '_blank')}
                          >
                            <FileText className="h-4 w-4 mr-1" />
                            Invoice
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination Controls */}
            {pagination && pagination.totalPages > 1 && (
              <div className="flex items-center justify-between px-2 py-4">
                <p className="text-sm text-muted-foreground">
                  Menampilkan {transactions.length} dari {pagination.total} transaksi
                </p>
                <div className="flex items-center space-x-2">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(1)}
                    disabled={!canPreviousPage}
                  >
                    <span className="sr-only">Halaman pertama</span>
                    <ChevronsLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(page - 1)}
                    disabled={!canPreviousPage}
                  >
                    <span className="sr-only">Halaman sebelumnya</span>
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-sm font-medium px-2">
                    {page} / {totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(page + 1)}
                    disabled={!canNextPage}
                  >
                    <span className="sr-only">Halaman berikutnya</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setPage(totalPages)}
                    disabled={!canNextPage}
                  >
                    <span className="sr-only">Halaman terakhir</span>
                    <ChevronsRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
