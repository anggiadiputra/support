"use client"

import { JSX, useState } from "react"
import { IconBook, IconKey, IconWebhook, IconLayoutDashboard, IconActivity } from "@tabler/icons-react"
import { Link, usePathname, useRouter } from "@/i18n/routing"
import { cn } from "@/lib/utils"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface SidebarNavItem {
  href: string
  title: string
  icon: JSX.Element
  disabled?: boolean
  badge?: string
}

const sidebarNavItems: SidebarNavItem[] = [
  {
    title: "Overview",
    icon: <IconLayoutDashboard className="h-4 w-4" />,
    href: "/developers/overview",
  },
  {
    title: "API Keys",
    icon: <IconKey className="h-4 w-4" />,
    href: "/developers/api-keys",
  },
  {
    title: "Webhooks",
    icon: <IconWebhook className="h-4 w-4" />,
    href: "/developers/webhooks",
  },
  {
    title: "Events & Logs",
    icon: <IconActivity className="h-4 w-4" />,
    href: "/developers/events-&-logs",
  },
  {
    title: "Documentation",
    icon: <IconBook className="h-4 w-4" />,
    href: "/developers/docs",
  },
]

export function DevelopersSidebar() {
  const router = useRouter()
  const pathname = usePathname()
  const [val, setVal] = useState(pathname ?? "/developers/overview")

  const handleSelect = (e: string) => {
    const item = sidebarNavItems.find((item) => item.href === e)
    if (item?.disabled) return
    setVal(e)
    router.push(e)
  }

  return (
    <TooltipProvider>
      {/* Mobile: Dropdown Select */}
      <div className="p-1 md:hidden">
        <Select value={pathname ?? val} onValueChange={handleSelect}>
          <SelectTrigger className="h-10 sm:w-48 bg-white border-gray-200 rounded-lg">
            <SelectValue placeholder="Select menu" />
          </SelectTrigger>
          <SelectContent>
            {sidebarNavItems.map((item) => (
              <SelectItem
                key={item.href}
                value={item.href}
                disabled={item.disabled}
              >
                <div className="flex items-center gap-x-2.5 px-2 py-0.5">
                  <span>{item.icon}</span>
                  <span className="text-sm font-medium">
                    {item.title}
                    {item.badge && (
                      <span className="text-muted-foreground ml-2 text-xs">
                        ({item.badge})
                      </span>
                    )}
                  </span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Desktop: Mini Sidebar */}
      <ScrollArea
        orientation="horizontal"
        type="always"
        className="hidden w-48 shrink-0 px-1 py-2 md:block"
      >
        <nav className="flex space-x-2 py-1 lg:flex-col lg:space-y-1.5 lg:space-x-0">
          {sidebarNavItems.map((item) => {
            const isActive = pathname === item.href

            return item.disabled ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <span
                    className="flex items-center gap-2.5 min-h-[36px] px-3 py-2 text-sm font-medium text-gray-400 cursor-not-allowed rounded-lg opacity-60"
                  >
                    <span>{item.icon}</span>
                    <span>{item.title}</span>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="right">
                  <p>{item.badge || "Coming Soon"}</p>
                </TooltipContent>
              </Tooltip>
            ) : (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 min-h-[36px] px-3 py-2 text-sm rounded-lg transition-colors",
                  isActive
                    ? "bg-black text-white font-semibold shadow-sm"
                    : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 font-medium"
                )}
              >
                <span>{item.icon}</span>
                <span>{item.title}</span>
              </Link>
            )
          })}
        </nav>
      </ScrollArea>
    </TooltipProvider>
  )
}
