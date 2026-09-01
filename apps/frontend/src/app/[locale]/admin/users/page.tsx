"use client"

import { useState, useCallback, useMemo, useEffect } from "react"
import { Link } from "@/i18n/routing"
import { RefreshCw, UserCheck, UserX } from "lucide-react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { useToast } from "@/hooks/use-toast"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useAdminUsers } from "../hooks/use-admin-users"
import { UsersStats } from "./components/users-stats"
import { UsersTable } from "./components/users-table"
import { createColumns } from "./components/users-columns"
import { AdminUser } from "./components/data-table-row-actions"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export default function AdminUsersPage() {
  const t = useTranslations("admin")
  const tCommon = useTranslations("common")
  const { toast } = useToast()
  const [actionUser, setActionUser] = useState<{ user: AdminUser; action: 'activate' | 'deactivate' } | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [stats, setStats] = useState<{
    totalUsers: number
    activeUsers: number
    inactiveUsers: number
    newUsersThisMonth: number
  } | undefined>()
  const [statsLoading, setStatsLoading] = useState(true)

  const { users, isLoading, error, refetch, setQuery, query, bulkUpdate, isBulkUpdating } = useAdminUsers({
    page: 1,
    limit: 100,
  })

  // Handle server-side search
  const handleSearch = useCallback((search: string) => {
    setSearchTerm(search)
    setQuery({
      ...query,
      search: search || undefined,
      page: 1, // Reset to first page on new search
    })
  }, [query, setQuery])

  // Fetch stats
  useEffect(() => {
    const fetchStats = async () => {
      try {
        setStatsLoading(true)
        const response = await fetch(`${API_URL}/api/v1/admin/users/stats`, {
          credentials: "include",
        })
        if (response.ok) {
          const data = await response.json()
          if (data.success) {
            setStats(data.data)
          }
        }
      } catch {
        // Stats are optional, don't show error
      } finally {
        setStatsLoading(false)
      }
    }
    fetchStats()
  }, [users])

  const handleActivate = useCallback((user: AdminUser) => {
    setActionUser({ user, action: 'activate' })
  }, [])

  const handleDeactivate = useCallback((user: AdminUser) => {
    setActionUser({ user, action: 'deactivate' })
  }, [])

  const handleConfirmAction = async () => {
    if (!actionUser) return

    setIsUpdating(true)
    try {
      await bulkUpdate([actionUser.user.id], actionUser.action)
      toast({
        title: tCommon("success"),
        description: actionUser.action === 'activate' ? t("userActivated") : t("userDeactivated"),
      })
    } catch {
      toast({
        title: tCommon("error"),
        description: actionUser.action === 'activate' ? t("failedToActivate") : t("failedToDeactivate"),
        variant: "destructive",
      })
    } finally {
      setIsUpdating(false)
      setActionUser(null)
    }
  }

  const columns = useMemo(
    () => createColumns(handleActivate, handleDeactivate),
    [handleActivate, handleDeactivate]
  )

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
              <BreadcrumbPage>Users</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("userManagement")}</h2>
            <p className="text-muted-foreground">
              {t("userManagementDesc")}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
            {tCommon("refresh")}
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Stats Cards */}
      <UsersStats stats={stats} isLoading={statsLoading} />

      {/* Users Table */}
      <div className="flex-1">
        <UsersTable
          columns={columns}
          data={users}
          isLoading={isLoading}
          onSearch={handleSearch}
          searchValue={searchTerm}
          isSearching={isLoading}
        />
      </div>

      {/* Action Confirmation Dialog */}
      <AlertDialog open={actionUser !== null} onOpenChange={() => setActionUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              {actionUser?.action === 'activate' ? (
                <UserCheck className="h-5 w-5 text-green-600" />
              ) : (
                <UserX className="h-5 w-5 text-red-600" />
              )}
              {actionUser?.action === 'activate' ? t("activateUser") : t("deactivateUser")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {actionUser?.action === 'activate'
                ? t("confirmActivate", { name: actionUser?.user.name ?? "" })
                : t("confirmDeactivate", { name: actionUser?.user.name ?? "" })}
              {actionUser?.action === 'deactivate' && (
                <span className="block mt-2 text-destructive">
                  {t("deactivateWarning")}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating || isBulkUpdating}>{tCommon("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={isUpdating || isBulkUpdating}
              className={actionUser?.action === 'deactivate' ? 'bg-destructive hover:bg-destructive/90' : 'bg-green-600 hover:bg-green-700'}
            >
              {isUpdating || isBulkUpdating ? tCommon("processing") : actionUser?.action === 'activate' ? t("activateUser") : t("deactivateUser")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
