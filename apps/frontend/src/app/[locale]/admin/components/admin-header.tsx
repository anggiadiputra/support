"use client"

import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ThemeSwitch } from "@/components/theme-switch"
import { NavUser } from "@/components/layout/nav-user"
import { useBusinessAccount } from "@/hooks/use-business-account"

export function AdminHeader() {
  const { userName, userEmail } = useBusinessAccount()

  const user = {
    name: userName || "Admin",
    email: userEmail || "admin@yourdomain.com",
    avatar: "/favicon.svg",
  }

  return (
    <header
      className={cn(
        "bg-background z-50 flex h-16 shrink-0 items-center gap-2 border-b px-4",
        "sticky top-0"
      )}
    >
      <div className="flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
      </div>
      <div className="flex w-full justify-between">
        <div className="flex items-center">
          <span className="text-sm font-medium text-muted-foreground">KC Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          <ThemeSwitch />
          <NavUser user={user} />
        </div>
      </div>
    </header>
  )
}
