"use client"

import { Link } from "@/i18n/routing"
import { RefreshCw } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useAdminRevenue } from "../hooks/use-admin-revenue"
import { RevenueStatsCards } from "./components/revenue-stats-cards"
import { RevenueChart } from "./components/revenue-chart"
import { RevenueTierBreakdown } from "./components/revenue-tier-breakdown"
import { PaymentTransactionsTable } from "./components/payment-transactions-table"
import { TransactionFiltersComponent } from "./components/transaction-filters"

export default function AdminRevenuePage() {
  const {
    stats,
    chart,
    tierBreakdown,
    transactions,
    refetchAll,
    isLoading,
  } = useAdminRevenue()

  // Combine errors from all hooks
  const errors = [
    stats.error,
    chart.error,
    tierBreakdown.error,
    transactions.error,
  ].filter(Boolean)

  const handlePageChange = (page: number) => {
    transactions.setFilters({ ...transactions.filters, page })
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
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
              <BreadcrumbPage>Revenue</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">Revenue Dashboard</h2>
            <p className="text-sm text-gray-500">
              Monitor platform revenue and payment transactions
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAll()}
            disabled={isLoading}
            className="rounded-lg border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {errors.length > 0 && (
        <Alert variant="destructive">
          <AlertDescription>{errors[0]}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <RevenueStatsCards stats={stats.stats} isLoading={stats.isLoading} />

      {/* Charts Section */}
      <div className="grid gap-4 md:grid-cols-2">
        <RevenueChart data={chart.data} isLoading={chart.isLoading} />
        <RevenueTierBreakdown data={tierBreakdown.data} isLoading={tierBreakdown.isLoading} />
      </div>

      {/* Transactions Section */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Transactions</CardTitle>
          <CardDescription>All payment transactions from users</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TransactionFiltersComponent
            filters={transactions.filters}
            onFiltersChange={transactions.setFilters}
          />
          <PaymentTransactionsTable
            transactions={transactions.transactions}
            pagination={transactions.pagination}
            isLoading={transactions.isLoading}
            onPageChange={handlePageChange}
          />
        </CardContent>
      </Card>
    </div>
  )
}
