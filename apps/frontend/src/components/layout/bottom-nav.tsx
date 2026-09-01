"use client"

import { Link, usePathname } from "@/i18n/routing"
import { Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/components/ui/sidebar"
import { useBottomNav } from "./bottom-nav-context"
import {
  IconLayoutDashboard,
  IconUsers,
  IconMessageCircle,
  IconBroadcast,
} from "@tabler/icons-react"
import type { LucideIcon } from "lucide-react"

type IconType = typeof IconLayoutDashboard | LucideIcon

interface BottomNavItem {
  title: string
  url: string
  icon: IconType
  isFloating?: boolean
}

const bottomNavItems: BottomNavItem[] = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: IconLayoutDashboard,
  },
  {
    title: "Customer",
    url: "/customers",
    icon: IconUsers,
  },
  {
    title: "OneInbox",
    url: "/oneinbox",
    icon: IconMessageCircle,
    isFloating: true,
  },
  {
    title: "Broadcast",
    url: "/broadcast",
    icon: IconBroadcast,
  },
]

export function BottomNav() {
  const pathname = usePathname()
  const { setOpenMobile } = useSidebar()
  const { isHidden } = useBottomNav()

  if (isHidden) {
    return null
  }

  return (
    <div className="fixed bottom-0 left-0 z-40 w-full border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <nav className="flex h-16 items-center justify-around px-1">
        {bottomNavItems.map((item) => {
          const Icon = item.icon
          const isActive = checkIsActive(pathname, item.url)

          if (item.isFloating) {
            return (
              <Link
                key={item.title}
                href={item.url}
                className="relative flex flex-col items-center justify-center -mt-8"
              >
                <div
                  className={cn(
                    "flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-primary/90 text-primary-foreground hover:bg-primary"
                  )}
                >
                  <Icon className="h-6 w-6" />
                </div>
              </Link>
            )
          }

          return (
            <Link
              key={item.title}
              href={item.url}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors",
                isActive
                  ? "text-primary"
                  : "text-muted-foreground hover:text-primary"
              )}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate w-full text-center leading-none">{item.title}</span>
            </Link>
          )
        })}
        
        <button
          type="button"
          onClick={() => setOpenMobile(true)}
          className="flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium text-muted-foreground hover:text-primary transition-colors cursor-pointer"
        >
          <Menu className="h-5 w-5" />
          <span className="truncate w-full text-center leading-none">Menu</span>
        </button>
      </nav>
    </div>
  )
}

function checkIsActive(pathname: string, url: string): boolean {
  return (
    pathname === url ||
    pathname.split("?")[0] === url ||
    (pathname.split("/")[1] !== "" &&
      pathname.split("/")[1] === url.split("/")[1])
  )
}