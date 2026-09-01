"use client"

import { use, useState } from "react"
import { useRouter } from "next/navigation"
import {
  ArrowLeft,
  RefreshCw,
  Mail,
  Phone,
  Calendar,
  Shield,
  CreditCard,
  Clock,
  CheckCircle,
  BarChart3,
  FileText,
  Settings,
  Eye,
  Activity,
  Globe,
  User,
  ChevronLeft,
  ChevronRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { useAdminUserDetail, useUserActivity, ACTIVITY_CATEGORIES, type SubscriptionStatus, type AuditLogEntry } from "../../hooks/use-admin-user-detail"
import type { Role, SubscriptionTier } from "../../hooks/use-admin-users"
import { TabWABAChannels } from "./components/tab-waba-channels"
import { TabTemplates } from "./components/tab-templates"
import { TabMessageStats } from "./components/tab-message-stats"
import { TabActions } from "./components/tab-actions"

interface PageProps {
  params: Promise<{ id: string }>
}

function formatDate(dateString: string | null | undefined) {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatShortDate(dateString: string | null | undefined) {
  if (!dateString) return "-"
  return new Date(dateString).toLocaleDateString("id-ID", {
    year: "numeric",
    month: "short",
    day: "numeric",
  })
}

function getSubscriptionStatusBadge(status: SubscriptionStatus) {
  switch (status) {
    case "ACTIVE":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Active</Badge>
    case "PENDING_PAYMENT":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Pending Payment</Badge>
    case "EXPIRED":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Expired</Badge>
    case "CANCELLED":
      return <Badge className="bg-gray-100 text-gray-800 border-gray-200">Cancelled</Badge>
    default:
      return <Badge variant="outline">{status}</Badge>
  }
}

function getActionBadgeVariant(action: string) {
  if (action.includes("CREATE") || action.includes("create")) return "default" as const
  if (action.includes("UPDATE") || action.includes("update")) return "secondary" as const
  if (action.includes("DELETE") || action.includes("delete")) return "destructive" as const
  if (action.includes("LOGIN") || action.includes("login")) return "outline" as const
  if (action.includes("SUCCESS")) return "default" as const
  if (action.includes("FAILED")) return "destructive" as const
  return "outline" as const
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

function UserDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Skeleton className="h-10 w-10" />
        <div>
          <Skeleton className="h-8 w-48 mb-2" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <Skeleton className="h-64" />
        <Skeleton className="h-64" />
      </div>
      <Skeleton className="h-48" />
    </div>
  )
}

export default function AdminUserDetailPage({ params }: PageProps) {
  const { id } = use(params)
  const router = useRouter()
  const { data, isLoading, error, refetch, updateUser, updateSubscription, isUpdating } =
    useAdminUserDetail(id)

  const {
    data: activityData,
    isLoading: activityLoading,
    filters: activityFilters,
    setFilters: setActivityFilters,
  } = useUserActivity(id)

  const [selectedActivity, setSelectedActivity] = useState<AuditLogEntry | null>(null)
  const [activitySheetOpen, setActivitySheetOpen] = useState(false)
  const [subscriptionDialogOpen, setSubscriptionDialogOpen] = useState(false)
  const [subscriptionForm, setSubscriptionForm] = useState({
    tier: "" as SubscriptionTier | "",
    status: "" as SubscriptionStatus | "",
    endDate: "",
    notes: "",
  })

  if (isLoading) {
    return <UserDetailSkeleton />
  }

  if (error) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button variant="ghost" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <Button variant="ghost" onClick={() => router.back()} className="w-fit">
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <Alert>
          <AlertDescription>User not found</AlertDescription>
        </Alert>
      </div>
    )
  }

  const { user, subscription } = data

  const handleToggleActive = async () => {
    await updateUser({ isActive: !user.isActive })
  }

  const handleRoleChange = async (newRole: Role) => {
    await updateUser({ role: newRole })
  }

  const openSubscriptionDialog = () => {
    setSubscriptionForm({
      tier: subscription?.tier || "FREE",
      status: subscription?.status || "ACTIVE",
      endDate: subscription?.endDate ? subscription.endDate.split("T")[0] : "",
      notes: subscription?.notes || "",
    })
    setSubscriptionDialogOpen(true)
  }

  const handleSubscriptionUpdate = async () => {
    const updates: {
      tier?: SubscriptionTier
      status?: SubscriptionStatus
      endDate?: string
      notes?: string
    } = {}

    if (subscriptionForm.tier) updates.tier = subscriptionForm.tier as SubscriptionTier
    if (subscriptionForm.status) updates.status = subscriptionForm.status as SubscriptionStatus
    if (subscriptionForm.endDate) updates.endDate = subscriptionForm.endDate
    if (subscriptionForm.notes !== undefined) updates.notes = subscriptionForm.notes

    const success = await updateSubscription(updates)
    if (success) {
      setSubscriptionDialogOpen(false)
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <Button variant="ghost" onClick={() => router.back()} className="w-fit min-h-[44px]">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <Separator orientation="vertical" className="h-6 hidden sm:block" />
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">{user.name}</h1>
            <p className="text-muted-foreground text-sm sm:text-base break-all">{user.email}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading} className="min-h-[44px] w-full sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-flex">
          <TabsTrigger value="overview" className="gap-2">
            <Shield className="h-4 w-4 hidden sm:block" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="waba" className="gap-2">
            <Phone className="h-4 w-4 hidden sm:block" />
            WABA
          </TabsTrigger>
          <TabsTrigger value="templates" className="gap-2">
            <FileText className="h-4 w-4 hidden sm:block" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="stats" className="gap-2">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            Stats
          </TabsTrigger>
          <TabsTrigger value="actions" className="gap-2">
            <Settings className="h-4 w-4 hidden sm:block" />
            Actions
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <div className="grid gap-6 md:grid-cols-2">
            {/* User Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  User Information
                </CardTitle>
                <CardDescription>Basic user details and account status</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Email</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{user.email}</span>
                    {user.emailVerified && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Joined</span>
                  </div>
                  <span className="text-sm font-medium">{formatShortDate(user.createdAt)}</span>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">Last Login</span>
                  </div>
                  <span className="text-sm font-medium">{formatDate(user.lastLoginAt)}</span>
                </div>

                <Separator />

                <div className="flex items-center justify-between">
                  <Label htmlFor="user-active" className="text-sm">Account Active</Label>
                  <Switch
                    id="user-active"
                    checked={user.isActive}
                    onCheckedChange={handleToggleActive}
                    disabled={isUpdating}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <Label className="text-sm">Role</Label>
                  <Select
                    value={user.role}
                    onValueChange={(value) => handleRoleChange(value as Role)}
                    disabled={isUpdating}
                  >
                    <SelectTrigger className="w-[160px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ADMIN">Admin</SelectItem>
                      <SelectItem value="BUSINESS_OWNER">Business Owner</SelectItem>
                      <SelectItem value="AGENT">Agent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Subscription Card */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <CreditCard className="h-5 w-5" />
                      Subscription
                    </CardTitle>
                    <CardDescription>Manage user subscription plan</CardDescription>
                  </div>
                  <Dialog open={subscriptionDialogOpen} onOpenChange={setSubscriptionDialogOpen}>
                    <DialogTrigger asChild>
                      <Button variant="outline" size="sm" onClick={openSubscriptionDialog}>
                        Edit
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Edit Subscription</DialogTitle>
                        <DialogDescription>
                          Update subscription details for {user.name}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label>Tier</Label>
                          <Select
                            value={subscriptionForm.tier}
                            onValueChange={(value) =>
                              setSubscriptionForm({ ...subscriptionForm, tier: value as SubscriptionTier })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select tier" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="FREE">Free</SelectItem>
                              <SelectItem value="BASIC">Basic</SelectItem>
                              <SelectItem value="LITE">Lite</SelectItem>
                              <SelectItem value="PRO">Pro</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Status</Label>
                          <Select
                            value={subscriptionForm.status}
                            onValueChange={(value) =>
                              setSubscriptionForm({ ...subscriptionForm, status: value as SubscriptionStatus })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ACTIVE">Active</SelectItem>
                              <SelectItem value="PENDING_PAYMENT">Pending Payment</SelectItem>
                              <SelectItem value="EXPIRED">Expired</SelectItem>
                              <SelectItem value="CANCELLED">Cancelled</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>End Date</Label>
                          <Input
                            type="date"
                            value={subscriptionForm.endDate}
                            onChange={(e) =>
                              setSubscriptionForm({ ...subscriptionForm, endDate: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Notes</Label>
                          <Textarea
                            value={subscriptionForm.notes}
                            onChange={(e) =>
                              setSubscriptionForm({ ...subscriptionForm, notes: e.target.value })
                            }
                            placeholder="Add notes about this subscription change..."
                          />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setSubscriptionDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button onClick={handleSubscriptionUpdate} disabled={isUpdating}>
                          {isUpdating ? "Saving..." : "Save Changes"}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm">Tier</span>
                  <Badge
                    className={
                      subscription?.tier === "PRO"
                        ? "bg-purple-100 text-purple-800 border-purple-200"
                        : subscription?.tier === "LITE"
                        ? "bg-blue-100 text-blue-800 border-blue-200"
                        : "bg-gray-100 text-gray-800 border-gray-200"
                    }
                    variant="outline"
                  >
                    {subscription?.tier || user.subscriptionTier || "FREE"}
                  </Badge>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm">Status</span>
                  {subscription ? (
                    getSubscriptionStatusBadge(subscription.status)
                  ) : (
                    <Badge variant="outline">No subscription</Badge>
                  )}
                </div>

                {subscription?.startDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Start Date</span>
                    <span className="text-sm font-medium">{formatShortDate(subscription.startDate)}</span>
                  </div>
                )}

                {subscription?.endDate && (
                  <div className="flex items-center justify-between">
                    <span className="text-sm">End Date</span>
                    <span className="text-sm font-medium">{formatShortDate(subscription.endDate)}</span>
                  </div>
                )}

                {subscription?.notes && (
                  <>
                    <Separator />
                    <div>
                      <span className="text-sm text-muted-foreground">Notes</span>
                      <p className="text-sm mt-1">{subscription.notes}</p>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Activity Table with Filters & Pagination */}
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-5 w-5" />
                    Recent Activity
                  </CardTitle>
                  <CardDescription>
                    {activityData?.pagination.total
                      ? `${activityData.pagination.total} total activities`
                      : "Latest user actions and system events"}
                  </CardDescription>
                </div>
              </div>
              {/* Category Filter Chips */}
              <div className="flex flex-wrap gap-2 pt-2">
                {ACTIVITY_CATEGORIES.map((cat) => (
                  <Button
                    key={cat.value}
                    variant={activityFilters.category === cat.value ? "default" : "outline"}
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setActivityFilters({ category: cat.value })}
                  >
                    {cat.label}
                  </Button>
                ))}
              </div>
            </CardHeader>
            <CardContent>
              {activityLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !activityData || activityData.logs.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {activityFilters.category
                    ? "Tidak ada activity untuk kategori ini"
                    : "Tidak ada activity"}
                </p>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Entity</TableHead>
                          <TableHead className="hidden lg:table-cell">Details</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {activityData.logs.map((activity) => {
                          const detailsStr = formatDetails(activity.details)
                          return (
                            <TableRow
                              key={activity.id}
                              className="cursor-pointer hover:bg-muted/50 transition-colors"
                              onClick={() => {
                                setSelectedActivity(activity)
                                setActivitySheetOpen(true)
                              }}
                            >
                              <TableCell className="whitespace-nowrap py-3 text-sm">
                                {formatDate(activity.timestamp)}
                              </TableCell>
                              <TableCell className="py-3">
                                <Badge variant={getActionBadgeVariant(activity.action)}>
                                  {activity.action.replace(/_/g, " ")}
                                </Badge>
                              </TableCell>
                              <TableCell className="py-3">
                                <div className="flex flex-col">
                                  <span className="font-medium text-sm">{activity.entityType}</span>
                                  <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                                    {activity.entityId}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-[200px] hidden lg:table-cell py-3">
                                {detailsStr !== "-" ? (
                                  <span className="font-mono text-xs text-muted-foreground">
                                    {detailsStr.length > 80 ? `${detailsStr.slice(0, 80)}...` : detailsStr}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="py-3">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile Card View */}
                  <div className="block md:hidden space-y-3">
                    {activityData.logs.map((activity) => (
                      <Card
                        key={activity.id}
                        className="cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={() => {
                          setSelectedActivity(activity)
                          setActivitySheetOpen(true)
                        }}
                      >
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0 space-y-2">
                              <Badge variant={getActionBadgeVariant(activity.action)} className="text-xs">
                                {activity.action.replace(/_/g, " ")}
                              </Badge>
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted-foreground">{activity.entityType}</span>
                              </div>
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3 flex-shrink-0" />
                                {formatDate(activity.timestamp)}
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Pagination */}
                  {activityData.pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between pt-4">
                      <p className="text-sm text-muted-foreground">
                        Halaman {activityData.pagination.page} dari {activityData.pagination.totalPages}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={activityData.pagination.page <= 1}
                          onClick={() =>
                            setActivityFilters({ page: activityData.pagination.page - 1 })
                          }
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={
                            activityData.pagination.page >= activityData.pagination.totalPages
                          }
                          onClick={() =>
                            setActivityFilters({ page: activityData.pagination.page + 1 })
                          }
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Activity Detail Sheet */}
          <Sheet open={activitySheetOpen} onOpenChange={setActivitySheetOpen}>
            <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
              {selectedActivity && (
                <>
                  <SheetHeader className="pb-4">
                    <SheetTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5" />
                      Activity Detail
                    </SheetTitle>
                    <SheetDescription>
                      {formatFullTimestamp(selectedActivity.timestamp)}
                    </SheetDescription>
                  </SheetHeader>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">Action</label>
                      <div>
                        <Badge variant={getActionBadgeVariant(selectedActivity.action)} className="text-sm">
                          {selectedActivity.action.replace(/_/g, " ")}
                        </Badge>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-4">
                      <label className="text-sm font-medium text-muted-foreground">Entity</label>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">Type</p>
                          <p className="font-medium">{selectedActivity.entityType}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="text-xs text-muted-foreground">ID</p>
                          <p className="font-mono text-sm break-all">{selectedActivity.entityId}</p>
                        </div>
                      </div>
                    </div>
                    <Separator />
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Details
                      </label>
                      {formatDetails(selectedActivity.details) === "-" ? (
                        <p className="text-muted-foreground">No details available</p>
                      ) : (
                        <ScrollArea className="h-[200px] w-full rounded-lg border bg-muted/30">
                          <pre className="p-4 text-xs font-mono whitespace-pre-wrap break-all">
                            {formatDetails(selectedActivity.details)}
                          </pre>
                        </ScrollArea>
                      )}
                    </div>
                  </div>
                </>
              )}
            </SheetContent>
          </Sheet>
        </TabsContent>

        {/* WABA & Channels Tab */}
        <TabsContent value="waba">
          <TabWABAChannels userId={id} />
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates">
          <TabTemplates userId={id} />
        </TabsContent>

        {/* Message Stats Tab */}
        <TabsContent value="stats">
          <TabMessageStats userId={id} />
        </TabsContent>

        {/* Actions Tab */}
        <TabsContent value="actions">
          <TabActions userId={id} userName={user.name} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
