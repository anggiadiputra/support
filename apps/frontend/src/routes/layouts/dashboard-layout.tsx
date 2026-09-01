import { Outlet } from "react-router-dom"
import Cookies from "js-cookie"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/layout/bottom-nav"
import { BottomNavProvider, ContentWrapper } from "@/components/layout/bottom-nav-context"
import { ProtectedRoute } from "@/components/auth/protected-route"

export function DashboardLayout() {
  const defaultClose = Cookies.get("sidebar:state") === "false"

  return (
    <ProtectedRoute>
      <div className="border-grid flex flex-1 flex-col min-h-screen">
        <SidebarProvider defaultOpen={!defaultClose}>
          <BottomNavProvider>
            <AppSidebar />
            <ContentWrapper className="has-[div[data-layout=fixed]]:h-svh group-data-[scroll-locked=1]/body:h-full has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh">
              <Outlet />
            </ContentWrapper>
            <BottomNav />
          </BottomNavProvider>
        </SidebarProvider>
      </div>
    </ProtectedRoute>
  )
}

export default DashboardLayout
