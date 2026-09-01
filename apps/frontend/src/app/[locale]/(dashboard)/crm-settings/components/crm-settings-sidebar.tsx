"use client"

import { JSX, useState } from "react"
import { IconLayoutKanban, IconForms } from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import { Link, usePathname, useRouter } from "@/i18n/routing"
import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
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
  titleKey: string
  icon: JSX.Element
  disabled?: boolean
  badge?: string
}

const sidebarNavItems: SidebarNavItem[] = [
  {
    titleKey: "pipelines",
    icon: <IconLayoutKanban className="h-[1.125rem] w-[1.125rem]" />,
    href: "/crm-settings/pipelines",
  },
  {
    titleKey: "customFields",
    icon: <IconForms className="h-[1.125rem] w-[1.125rem]" />,
    href: "/crm-settings/custom-fields",
  },
]

export function CrmSettingsSidebar() {
  const t = useTranslations("crmSettings.sidebar")
  const router = useRouter()
  const pathname = usePathname()
  const currentPath = pathname === "/crm-settings" ? "/crm-settings/pipelines" : pathname
  const [val, setVal] = useState(currentPath ?? "/crm-settings/pipelines")

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
        <Select value={val} onValueChange={handleSelect}>
          <SelectTrigger className="h-10 sm:w-48">
            <SelectValue placeholder="Select menu" />
          </SelectTrigger>
          <SelectContent>
            {sidebarNavItems.map((item) => (
              <SelectItem
                key={item.href}
                value={item.href}
                disabled={item.disabled}
              >
                <div className="flex items-center gap-x-3 px-2 py-0.5">
                  <span className="[&_svg]:size-[1.125rem]">{item.icon}</span>
                  <span className="text-sm">
                    {t(item.titleKey)}
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
        className="bg-background hidden w-40 shrink-0 px-1 py-2 md:block"
      >
        <nav className="flex space-x-2 py-1 lg:flex-col lg:space-y-1 lg:space-x-0">
          {sidebarNavItems.map((item) =>
            item.disabled ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>
                  <span
                    className={cn(
                      buttonVariants({ variant: "ghost" }),
                      "text-muted-foreground cursor-not-allowed justify-start opacity-60"
                    )}
                  >
                    <span className="mr-2 [&_svg]:size-[1.125rem]">
                      {item.icon}
                    </span>
                    {t(item.titleKey)}
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
                  buttonVariants({ variant: "ghost" }),
                  currentPath === item.href
                    ? "bg-muted hover:bg-muted"
                    : "hover:bg-transparent hover:underline",
                  "justify-start"
                )}
              >
                <span className="mr-2 [&_svg]:size-[1.125rem]">
                  {item.icon}
                </span>
                {t(item.titleKey)}
              </Link>
            )
          )}
        </nav>
      </ScrollArea>
    </TooltipProvider>
  )
}
