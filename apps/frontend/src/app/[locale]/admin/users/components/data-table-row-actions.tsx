"use client"

import { DotsHorizontalIcon } from "@radix-ui/react-icons"
import { IconChecklist, IconUserCheck, IconUserX } from "@tabler/icons-react"
import { Row } from "@tanstack/react-table"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
// Types
export type Role = "ADMIN" | "BUSINESS_OWNER" | "AGENT"

export interface AdminUser {
  id: string
  name: string
  email: string
  role: Role
  subscriptionTier: string
  isActive: boolean
  createdAt: string
  lastLoginAt: string | null
  wabaConnectionStatus?: string | null
}

interface Props {
  row: Row<AdminUser>
  onActivate?: (user: AdminUser) => void
  onDeactivate?: (user: AdminUser) => void
}

export function DataTableRowActions({ row, onActivate, onDeactivate }: Props) {
  const user = row.original
  const isActive = user.isActive

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
        >
          <DotsHorizontalIcon className="h-4 w-4" />
          <span className="sr-only">Open menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuItem asChild>
          <Link href={`/admin/users/${user.id}`}>
            View Detail
            <DropdownMenuShortcut>
              <IconChecklist size={16} />
            </DropdownMenuShortcut>
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isActive ? (
          <DropdownMenuItem
            onClick={() => onDeactivate?.(user)}
            className="text-red-500!"
          >
            Deactivate
            <DropdownMenuShortcut>
              <IconUserX size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem
            onClick={() => onActivate?.(user)}
            className="text-green-600!"
          >
            Activate
            <DropdownMenuShortcut>
              <IconUserCheck size={16} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
