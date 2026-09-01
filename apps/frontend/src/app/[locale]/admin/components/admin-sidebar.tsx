"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarRail,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  IconLayoutDashboard,
  IconUsers,
  IconCreditCard,
  IconActivity,
  IconFileText,
  IconArrowLeft,
  IconShieldLock,
  IconSettings,
  IconCash,
  IconPalette,
  IconTrash,
  IconBell,
  IconMail,
  IconUsersGroup,
} from "@tabler/icons-react"
import { usePathname } from "@/i18n/routing"
import { OptimizedLink } from "@/components/optimized-link"
import { useBranding } from "@/hooks/use-branding"

const adminNavGroups = [
  {
    label: "Dashboard",
    items: [
      {
        title: "Overview",
        url: "/admin",
        icon: IconLayoutDashboard,
      },
    ],
  },
  {
    label: "User Management",
    items: [
      {
        title: "Users",
        url: "/admin/users",
        icon: IconUsers,
      },
      {
        title: "Subscriptions",
        url: "/admin/subscriptions",
        icon: IconCreditCard,
      },
      {
        title: "Affiliates",
        url: "/admin/affiliates",
        icon: IconUsersGroup,
      },
      {
        title: "Revenue",
        url: "/admin/revenue",
        icon: IconCash,
      },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        title: "System Health",
        url: "/admin/system",
        icon: IconActivity,
      },
      {
        title: "Audit Logs",
        url: "/admin/audit",
        icon: IconFileText,
      },
      {
        title: "Notifications",
        url: "/admin/notifications/history",
        icon: IconBell,
      },
    ],
  },
  {
    label: "Configuration",
    items: [
      {
        title: "Settings",
        url: "/admin/settings",
        icon: IconSettings,
      },
      {
        title: "Branding",
        url: "/admin/settings/branding",
        icon: IconPalette,
      },
      {
        title: "Message Retention",
        url: "/admin/settings/message-retention",
        icon: IconTrash,
      },
      {
        title: "Email Templates",
        url: "/admin/email-templates",
        icon: IconMail,
      },
    ],
  },
]

export function AdminSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const { setOpenMobile } = useSidebar()
  const pathname = usePathname()
  const { websiteName } = useBranding()

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="ring-sidebar-primary/50 focus-visible:ring-1"
            >
              <div className="flex aspect-square size-8 items-center justify-center">
                <IconShieldLock className="size-5 text-primary" />
              </div>
              <div className="grid flex-1 text-left text-xs leading-tight">
                <span className="truncate font-semibold">Admin Panel</span>
                <span className="truncate text-xs text-muted-foreground">{websiteName}</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {adminNavGroups.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={pathname === item.url || (item.url !== "/admin" && pathname.startsWith(item.url))}
                    tooltip={item.title}
                  >
                    <OptimizedLink href={item.url} onClick={() => setOpenMobile(false)}>
                      <item.icon className="size-4" />
                      <span>{item.title}</span>
                    </OptimizedLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroup>
        ))}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild tooltip="Back to Dashboard">
                <OptimizedLink href="/dashboard" onClick={() => setOpenMobile(false)}>
                  <IconArrowLeft className="size-4" />
                  <span>Back to Dashboard</span>
                </OptimizedLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  )
}
