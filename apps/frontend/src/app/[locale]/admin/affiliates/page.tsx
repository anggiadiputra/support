"use client"

import { useState, useCallback } from "react"
import { Link } from "@/i18n/routing"
import {
  RefreshCw,
  Search,
  Copy,
  Check,
  Pencil,
  Users,
  Wallet,
  Clock,
  Settings,
} from "lucide-react"
import { useTranslations } from "next-intl"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"
import {
  useAdminAffiliates,
  type AdminAffiliate,
  type AffiliateTier,
  type UpdateAffiliateData,
} from "../hooks/use-admin-affiliates"

const TIER_COLORS: Record<AffiliateTier, string> = {
  STANDARD: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  SILVER: "bg-gray-200 text-gray-800 dark:bg-gray-700 dark:text-gray-200",
  GOLD: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200",
  PLATINUM: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
}

const TIER_OPTIONS: AffiliateTier[] = ["STANDARD", "SILVER", "GOLD", "PLATINUM"]

const DEFAULT_COMMISSION_RATES: Record<AffiliateTier, number> = {
  STANDARD: 5,
  SILVER: 7,
  GOLD: 10,
  PLATINUM: 15,
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

export default function AdminAffiliatesPage() {
  const t = useTranslations("admin")
  const tCommon = useTranslations("common")
  const { toast } = useToast()

  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [editingAffiliate, setEditingAffiliate] = useState<AdminAffiliate | null>(null)
  const [editFormData, setEditFormData] = useState<UpdateAffiliateData>({})

  const {
    affiliates,
    pagination,
    isLoading,
    error,
    refetch,
    setQuery,
    query,
    updateAffiliate,
    isUpdating,
  } = useAdminAffiliates({
    page: 1,
    limit: 20,
  })

  // Handle search
  const handleSearch = useCallback(
    (search: string) => {
      setSearchTerm(search)
      setQuery({
        ...query,
        search: search || undefined,
        page: 1,
      })
    },
    [query, setQuery]
  )

  // Handle status filter
  const handleStatusFilter = useCallback(
    (value: string) => {
      setStatusFilter(value)
      setQuery({
        ...query,
        isActive: value === "all" ? undefined : value === "active",
        page: 1,
      })
    },
    [query, setQuery]
  )

  // Handle page change
  const handlePageChange = useCallback(
    (page: number) => {
      setQuery({
        ...query,
        page,
      })
    },
    [query, setQuery]
  )

  // Copy referral code
  const handleCopyCode = useCallback((code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2000)
  }, [])

  // Open edit dialog
  const handleEditClick = useCallback((affiliate: AdminAffiliate) => {
    setEditingAffiliate(affiliate)
    setEditFormData({
      tier: affiliate.tier,
      isActive: affiliate.isActive,
      customCommission: affiliate.customCommission,
    })
  }, [])

  // Close edit dialog
  const handleCloseEdit = useCallback(() => {
    setEditingAffiliate(null)
    setEditFormData({})
  }, [])

  // Save edit
  const handleSaveEdit = useCallback(async () => {
    if (!editingAffiliate) return

    try {
      await updateAffiliate(editingAffiliate.id, editFormData)
      toast({
        title: tCommon("success"),
        description: "Affiliate updated successfully",
      })
      handleCloseEdit()
    } catch (err) {
      toast({
        title: tCommon("error"),
        description: err instanceof Error ? err.message : "Failed to update affiliate",
        variant: "destructive",
      })
    }
  }, [editingAffiliate, editFormData, updateAffiliate, toast, tCommon, handleCloseEdit])

  // Get commission rate display
  const getCommissionDisplay = (affiliate: AdminAffiliate): string => {
    if (affiliate.customCommission !== null) {
      return `${affiliate.customCommission}%`
    }
    return `${DEFAULT_COMMISSION_RATES[affiliate.tier]}% (default)`
  }

  // Calculate stats
  const totalAffiliates = pagination?.total ?? 0
  const activeAffiliates = affiliates.filter((a) => a.isActive).length
  const totalEarnings = affiliates.reduce((sum, a) => sum + a.totalEarnings, 0)
  const totalPending = affiliates.reduce((sum, a) => sum + a.pendingAmount, 0)

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
              <BreadcrumbPage>Affiliates</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Affiliate Management</h2>
            <p className="text-muted-foreground">
              Manage affiliate partners, tiers, and commissions
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href="/admin/affiliates/commissions">
                <Clock className="mr-2 h-4 w-4" />
                Commissions
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              asChild
            >
              <Link href="/admin/affiliates/settings">
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", isLoading && "animate-spin")} />
              {tCommon("refresh")}
            </Button>
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Affiliates</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalAffiliates}</div>
            <p className="text-xs text-muted-foreground">
              {activeAffiliates} active
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Referrals</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {affiliates.reduce((sum, a) => sum + a.totalReferrals, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Across all affiliates</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Earnings</CardTitle>
            <Wallet className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(totalEarnings)}</div>
            <p className="text-xs text-muted-foreground">Credited to affiliates</p>
          </CardContent>
        </Card>
        <Link href="/admin/affiliates/commissions" className="block">
          <Card className="cursor-pointer transition-colors hover:bg-muted/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Commissions</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{formatCurrency(totalPending)}</div>
              <p className="text-xs text-muted-foreground">Click to manage →</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusFilter}>
          <SelectTrigger className="w-full sm:w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Referral Code</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Commission</TableHead>
                <TableHead className="text-right">Stats</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" />
                  </TableCell>
                </TableRow>
              ) : affiliates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="h-24 text-center">
                    No affiliates found
                  </TableCell>
                </TableRow>
              ) : (
                affiliates.map((affiliate) => (
                  <TableRow key={affiliate.id}>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="font-medium">{affiliate.user.name}</span>
                        <span className="text-sm text-muted-foreground">
                          {affiliate.user.email}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="rounded bg-muted px-2 py-1 text-sm font-mono">
                          {affiliate.referralCode}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => handleCopyCode(affiliate.referralCode)}
                        >
                          {copiedCode === affiliate.referralCode ? (
                            <Check className="h-4 w-4 text-green-500" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("font-medium", TIER_COLORS[affiliate.tier])}>
                        {affiliate.tier}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span
                        className={cn(
                          affiliate.customCommission !== null && "font-medium text-primary"
                        )}
                      >
                        {getCommissionDisplay(affiliate)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-col items-end">
                        <span className="text-sm">
                          {affiliate.totalReferrals} referrals
                        </span>
                        <span className="text-sm text-muted-foreground">
                          {formatCurrency(affiliate.totalEarnings)}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={affiliate.isActive ? "default" : "secondary"}
                        className={cn(
                          affiliate.isActive
                            ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                            : "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200"
                        )}
                      >
                        {affiliate.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditClick(affiliate)}
                      >
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
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
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{" "}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{" "}
            {pagination.total} affiliates
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page <= 1}
              onClick={() => handlePageChange(pagination.page - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={pagination.page >= pagination.totalPages}
              onClick={() => handlePageChange(pagination.page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={editingAffiliate !== null} onOpenChange={() => handleCloseEdit()}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Edit Affiliate</DialogTitle>
            <DialogDescription>
              Update affiliate settings for {editingAffiliate?.user.name}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            {/* Tier */}
            <div className="space-y-2">
              <Label htmlFor="tier">Tier</Label>
              <Select
                value={editFormData.tier}
                onValueChange={(value: AffiliateTier) =>
                  setEditFormData({ ...editFormData, tier: value })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select tier" />
                </SelectTrigger>
                <SelectContent>
                  {TIER_OPTIONS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {tier} ({DEFAULT_COMMISSION_RATES[tier]}% default)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Custom Commission */}
            <div className="space-y-2">
              <Label htmlFor="commission">Custom Commission Rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commission"
                  type="number"
                  min="0"
                  max="100"
                  step="1"
                  placeholder="e.g. 15"
                  value={editFormData.customCommission ?? ""}
                  onChange={(e) =>
                    setEditFormData({
                      ...editFormData,
                      customCommission: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
                {editFormData.customCommission !== null && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      setEditFormData({ ...editFormData, customCommission: null })
                    }
                  >
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Leave empty to use tier default rate
              </p>
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label htmlFor="active">Active Status</Label>
                <p className="text-sm text-muted-foreground">
                  {editFormData.isActive
                    ? "Affiliate can earn commissions"
                    : "Affiliate is disabled"}
                </p>
              </div>
              <Switch
                id="active"
                checked={editFormData.isActive}
                onCheckedChange={(checked) =>
                  setEditFormData({ ...editFormData, isActive: checked })
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCloseEdit} disabled={isUpdating}>
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={isUpdating}>
              {isUpdating ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
