"use client"

import * as React from "react"
import { useTranslations } from "next-intl"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { IconUserOff, IconRobot } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import type { AssignableUser, AssigneeType } from "../types/unified-inbox"

/**
 * AssignmentBadge Component
 * 
 * Displays the assignee avatar or initials for a conversation.
 * Shows "Unassigned" state when no assignee is present.
 * Supports AI Agent assignments with robot icon.
 * Supports tooltip with assignee name on hover.
 * 
 * Requirements: 1.5, 1.6, 4.1, 4.2, 4.3
 */

interface AssignmentBadgeProps {
  assignee: AssignableUser | null
  size?: "sm" | "md"
  showTooltip?: boolean
  className?: string
  // AI Agent assignment fields - Requirements: 1.5, 1.6
  assigneeType?: AssigneeType
  aiAgentName?: string | null
}

export function AssignmentBadge({
  assignee,
  size = "sm",
  showTooltip = true,
  className,
  assigneeType,
  aiAgentName,
}: AssignmentBadgeProps) {
  const t = useTranslations("messages.assignment")
  const tDropdown = useTranslations("messages.assignment.dropdown")

  const sizeClasses = {
    sm: "h-6 w-6 text-[10px]",
    md: "h-8 w-8 text-xs",
  }

  const getInitials = (name: string): string => {
    const parts = name.trim().split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase()
    }
    return name.substring(0, 2).toUpperCase()
  }

  const getRoleColor = (role: AssignableUser["role"]): string => {
    return role === "BUSINESS_OWNER"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
      : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
  }

  // Check if this is an AI Agent assignment - Requirements: 1.5, 1.6
  const isAIAgent = assigneeType === "AI_AGENT"

  // AI Agent badge with robot icon - Requirements: 1.5
  const aiAgentBadge = (
    <div
      className={cn(
        sizeClasses[size],
        "flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
        className
      )}
    >
      <IconRobot className={size === "sm" ? "h-3.5 w-3.5" : "h-4.5 w-4.5"} />
    </div>
  )

  // Human assignee badge
  const humanBadge = assignee ? (
    <Avatar className={cn(sizeClasses[size], className)}>
      <AvatarImage src={assignee.image || undefined} alt={assignee.name} />
      <AvatarFallback className={cn("font-medium", getRoleColor(assignee.role))}>
        {getInitials(assignee.name)}
      </AvatarFallback>
    </Avatar>
  ) : null

  // Unassigned badge
  const unassignedBadge = (
    <div
      className={cn(
        sizeClasses[size],
        "flex items-center justify-center rounded-full bg-muted text-muted-foreground border border-dashed border-muted-foreground/30",
        className
      )}
    >
      <IconUserOff className={size === "sm" ? "h-3 w-3" : "h-4 w-4"} />
    </div>
  )

  // Determine which badge to show - Requirements: 1.5
  let badge: React.ReactNode
  if (isAIAgent && aiAgentName) {
    badge = aiAgentBadge
  } else if (assignee) {
    badge = humanBadge
  } else {
    badge = unassignedBadge
  }

  if (!showTooltip) {
    return badge
  }

  // Tooltip content based on assignee type - Requirements: 1.6
  let tooltipContent: React.ReactNode
  if (isAIAgent && aiAgentName) {
    tooltipContent = (
      <div className="text-center">
        <p className="font-medium">{aiAgentName}</p>
        <p className="text-xs opacity-80">{tDropdown("aiAgent")}</p>
      </div>
    )
  } else if (assignee) {
    tooltipContent = (
      <div className="text-center">
        <p className="font-medium">{assignee.name}</p>
        <p className="text-xs opacity-80">
          {assignee.role === "BUSINESS_OWNER" ? tDropdown("owner") : tDropdown("agent")}
        </p>
      </div>
    )
  } else {
    tooltipContent = <p>{t("badge.unassigned")}</p>
  }

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{badge}</TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          {tooltipContent}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
