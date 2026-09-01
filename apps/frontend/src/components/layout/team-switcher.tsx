"use client"

import * as React from "react"
import { BadgeCheck } from "lucide-react"
// Dropdown imports preserved for future use
// import { ChevronsUpDown, Plus } from "lucide-react"
// import { cn } from "@/lib/utils"
// import {
//   DropdownMenu,
//   DropdownMenuContent,
//   DropdownMenuItem,
//   DropdownMenuLabel,
//   DropdownMenuSeparator,
//   DropdownMenuShortcut,
//   DropdownMenuTrigger,
// } from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"

interface Props {
  teams: {
    name: string
    logo: React.ElementType
    plan: string
  }[]
}

export function TeamSwitcher({ teams }: Props) {
  const activeTeam = teams[0]

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton
          size="lg"
          className="cursor-default hover:bg-transparent active:bg-transparent"
        >
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg">
            <activeTeam.logo className="size-6 text-primary" />
          </div>
          <div className="grid flex-1 text-left text-xs leading-tight">
            <span className="truncate font-semibold flex items-center gap-1.5">
              {activeTeam.name}
              <span aria-label="Verified" className="inline-flex items-center justify-center">
                <BadgeCheck className="size-4 text-sky-500 fill-sky-500 stroke-white stroke-[2.25]" />
              </span>
            </span>
            <span className="truncate text-xs">{activeTeam.plan}</span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
