"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconUser, IconUsers, IconUserOff, IconUsersGroup } from "@tabler/icons-react"
import type { AssignmentFilterType } from "../types/unified-inbox"

/**
 * AssignmentFilter Component
 * 
 * Dropdown filter for filtering conversations by assignment status.
 * Options: All, My Assignments, Unassigned, Assigned to Others
 * 
 * Requirements: 5.1
 */

interface AssignmentFilterProps {
  value: AssignmentFilterType
  onChange: (filter: AssignmentFilterType) => void
  className?: string
}

interface FilterOption {
  key: AssignmentFilterType
  labelKey: string
  icon: React.ReactNode
}

export function AssignmentFilter({ value, onChange, className }: AssignmentFilterProps) {
  const t = useTranslations("messages.assignment.filter")

  const filters: FilterOption[] = [
    {
      key: "all",
      labelKey: "all",
      icon: <IconUsersGroup className="h-4 w-4" />,
    },
    {
      key: "mine",
      labelKey: "mine",
      icon: <IconUser className="h-4 w-4" />,
    },
    {
      key: "unassigned",
      labelKey: "unassigned",
      icon: <IconUserOff className="h-4 w-4" />,
    },
    {
      key: "others",
      labelKey: "others",
      icon: <IconUsers className="h-4 w-4" />,
    },
  ]

  const selectedFilter = filters.find((f) => f.key === value)

  return (
    <Select value={value} onValueChange={(v) => onChange(v as AssignmentFilterType)}>
      <SelectTrigger className={`h-8 text-xs ${className}`}>
        <SelectValue>
          <div className="flex items-center gap-2">
            {selectedFilter?.icon}
            <span>{selectedFilter ? t(selectedFilter.labelKey) : ""}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {filters.map((filter) => (
          <SelectItem key={filter.key} value={filter.key}>
            <div className="flex items-center gap-2">
              {filter.icon}
              <span>{t(filter.labelKey)}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
