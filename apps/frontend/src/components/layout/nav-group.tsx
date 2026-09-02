"use client"

import { ReactNode } from "react"
import { ChevronRight } from "lucide-react"
import { usePathname } from "@/i18n/routing"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Badge } from "../ui/badge"
import { NavItem, type NavGroup } from "./types"
import { OptimizedLink } from "@/components/optimized-link"
import type { PrefetchType } from "@/hooks/use-prefetch"

/**
 * Map of routes to their prefetch types
 * High-priority pages get data prefetched on hover
 */
const PREFETCH_MAP: Record<string, PrefetchType> = {
  '/dashboard': 'dashboard',
  '/templates': 'templates',
  '/customers': 'customers',
}

export function NavGroup({ title, items }: NavGroup) {
  const { setOpenMobile } = useSidebar()
  const pathname = usePathname()
  return (
    <SidebarGroup>
      <SidebarGroupLabel>{title}</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          if (!item.items) {
            const prefetchType = PREFETCH_MAP[item.url]
            
            // Handle external links
            if (item.external) {
              return (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    tooltip={item.title}
                  >
                    <a 
                      href={item.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      onClick={() => setOpenMobile(false)}
                    >
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                      {item.badge && <NavBadge>{item.badge}</NavBadge>}
                    </a>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            }
            
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  isActive={checkIsActive(pathname, item, true)}
                  tooltip={item.title}
                >
                  {prefetchType ? (
                    <OptimizedLink 
                      href={item.url} 
                      prefetchType={prefetchType}
                      onClick={() => setOpenMobile(false)}
                    >
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                      {item.badge && <NavBadge>{item.badge}</NavBadge>}
                    </OptimizedLink>
                  ) : (
                    <OptimizedLink href={item.url} onClick={() => setOpenMobile(false)}>
                      {item.icon && <item.icon />}
                      <span>{item.title}</span>
                      {item.badge && <NavBadge>{item.badge}</NavBadge>}
                    </OptimizedLink>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          }
          return (
            <Collapsible
              key={item.title}
              asChild
              defaultOpen={checkIsActive(pathname, item, true)}
              className="group/collapsible"
            >
              <SidebarMenuItem>
                <CollapsibleTrigger asChild>
                  <SidebarMenuButton tooltip={item.title}>
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                    {item.badge && <NavBadge>{item.badge}</NavBadge>}
                    <ChevronRight className="ml-auto transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarMenuButton>
                </CollapsibleTrigger>
                <CollapsibleContent className="CollapsibleContent">
                  <SidebarMenuSub>
                    {item.items.map((subItem) => (
                      <SidebarMenuSubItem key={subItem.title}>
                        <SidebarMenuSubButton
                          asChild
                          isActive={checkIsActive(pathname, subItem)}
                        >
                          <OptimizedLink
                            href={subItem.url}
                            onClick={() => setOpenMobile(false)}
                          >
                            {subItem.icon && <subItem.icon />}
                            <span>{subItem.title}</span>
                            {subItem.badge && (
                              <NavBadge>{subItem.badge}</NavBadge>
                            )}
                          </OptimizedLink>
                        </SidebarMenuSubButton>
                      </SidebarMenuSubItem>
                    ))}
                  </SidebarMenuSub>
                </CollapsibleContent>
              </SidebarMenuItem>
            </Collapsible>
          )
        })}
      </SidebarMenu>
    </SidebarGroup>
  )
}

const NavBadge = ({ children }: { children: ReactNode }) => (
  <span className="ml-auto px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-700 border border-gray-200/50 group-data-[active=true]/menu-item:bg-white/20 group-data-[active=true]/menu-item:text-white group-data-[active=true]/menu-item:border-transparent">{children}</span>
)

function checkIsActive(href: string, item: NavItem, mainNav = false) {
  return (
    href === item.url || // /endpint?search=param
    href.split("?")[0] === item.url || // endpoint
    !!item?.items?.filter((i) => i.url === href).length || // if child nav is active
    (mainNav &&
      href.split("/")[1] !== "" &&
      href.split("/")[1] === item?.url?.split("/")[1])
  )
}
