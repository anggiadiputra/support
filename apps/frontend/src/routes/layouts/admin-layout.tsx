import { useEffect } from "react"
import { Outlet, useNavigate } from "react-router-dom"
import { cn } from "@/lib/utils"
import { SidebarProvider } from "@/components/ui/sidebar"
import { RefreshCw } from "lucide-react"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { AdminSidebar } from "@/app/[locale]/admin/components/admin-sidebar"
import { AdminHeader } from "@/app/[locale]/admin/components/admin-header"

export function AdminLayout() {
  const navigate = useNavigate()
  const { userRole, isLoading, isAuthenticated } = useBusinessAccount()

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/login")
      return
    }

    if (!isLoading && isAuthenticated && userRole !== "ADMIN") {
      navigate("/dashboard?error=unauthorized")
    }
  }, [isLoading, isAuthenticated, userRole, navigate])

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated || userRole !== "ADMIN") {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
          <p className="text-sm text-muted-foreground">Redirecting...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="border-grid flex flex-1 flex-col min-h-screen">
      <SidebarProvider defaultOpen={true}>
        <AdminSidebar />
        <div
          id="content"
          className={cn(
            "flex h-full w-full flex-col",
            "has-[div[data-layout=fixed]]:h-svh",
            "group-data-[scroll-locked=1]/body:h-full",
            "has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh"
          )}
        >
          <AdminHeader />
          <Outlet />
        </div>
      </SidebarProvider>
    </div>
  )
}

export default AdminLayout
