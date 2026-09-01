import { cookies } from "next/headers"
import { SidebarProvider } from "@/components/ui/sidebar"
import { AppSidebar } from "@/components/layout/app-sidebar"
import { BottomNav } from "@/components/layout/bottom-nav"
import { BottomNavProvider, ContentWrapper } from "@/components/layout/bottom-nav-context"
import { ProtectedRoute } from "@/components/auth/protected-route"

interface Props {
  children: React.ReactNode
}

export default async function DashboardLayout({ children }: Props) {
  const cookieStore = await cookies()
  const defaultClose = cookieStore.get("sidebar:state")?.value === "false"
  return (
    <ProtectedRoute>
      <div className="border-grid flex flex-1 flex-col">
        <SidebarProvider defaultOpen={!defaultClose}>
          <BottomNavProvider>
            <AppSidebar />
            <ContentWrapper className="has-[div[data-layout=fixed]]:h-svh group-data-[scroll-locked=1]/body:h-full has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh">
              {children}
            </ContentWrapper>
            <BottomNav />
          </BottomNavProvider>
        </SidebarProvider>
      </div>
    </ProtectedRoute>
  )
}
