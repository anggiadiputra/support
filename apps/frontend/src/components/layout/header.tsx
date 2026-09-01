"use client"

import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { Search } from "@/components/search"
import { ThemeSwitch } from "@/components/theme-switch"
import { LanguageSwitcher } from "@/components/language-switcher"
import { NavUser } from "@/components/layout/nav-user"
import { NotificationIcon } from "@/components/notifications"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { useSidebarData } from "./data/use-sidebar-data"

export function Header() {
  const t = useTranslations("common")
  const { userName, userEmail, userImage } = useBusinessAccount()
  const sidebarData = useSidebarData()

  const user = {
    name: userName || sidebarData.user.name,
    email: userEmail || sidebarData.user.email,
    avatar: userImage || sidebarData.user.avatar,
  }

  return (
    <header
      className={cn(
        "bg-background z-50 flex h-16 shrink-0 items-center gap-2 border-b px-4",
        "sticky top-0"
      )}
    >
      <div className="hidden md:flex items-center gap-2">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-2 h-4" />
      </div>
      <div className="flex w-full justify-between">
        <Search placeholder={t("search")} />
        <div className="flex items-center gap-2">
          <NotificationIcon />
          <ThemeSwitch />
          <LanguageSwitcher />
          <NavUser user={user} />
        </div>
      </div>
    </header>
  )
}
