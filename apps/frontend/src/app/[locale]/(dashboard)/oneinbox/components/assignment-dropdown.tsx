"use client"

import * as React from "react"
import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { IconUserPlus, IconUserOff, IconCheck, IconChevronDown, IconRobot } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import type { AssignableUser, AssignableEntity, AssigneeType } from "../types/unified-inbox"
import { AssignmentBadge } from "./assignment-badge"
import { assignmentApi } from "@/lib/api/assignment-api"

/**
 * AssignmentDropdown Component
 * 
 * Dropdown for selecting an assignee for a conversation.
 * Lists assignable users and AI Agents, supports self-assign and unassign actions.
 * Shows current assignee as selected.
 * Groups items into "Team Members" and "AI Agents" sections.
 * 
 * Requirements: 1.1, 1.3, 1.4, 1.5, 2.1, 2.3, 3.1
 */

interface AssignmentDropdownProps {
  conversationId: string
  conversationType: "whatsapp" | "instagram"
  currentAssignee: AssignableUser | null
  // Extended to support AI Agent assignment info
  currentAssigneeType?: AssigneeType
  currentAIAgentId?: string | null
  currentAIAgentName?: string | null
  assignableUsers: AssignableUser[]
  currentUserId: string
  onAssign: (userId: string, type?: 'human' | 'ai') => Promise<void>
  onUnassign: () => Promise<void>
  disabled?: boolean
  size?: "sm" | "md"
  className?: string
}

export function AssignmentDropdown({
  currentAssignee,
  currentAssigneeType = "HUMAN",
  currentAIAgentId,
  assignableUsers,
  currentUserId,
  onAssign,
  onUnassign,
  disabled = false,
  size = "sm",
  className,
}: AssignmentDropdownProps) {
  const t = useTranslations("messages.assignment.dropdown")
  const [isLoading, setIsLoading] = useState(false)
  const [open, setOpen] = useState(false)
  
  // State for AI Agents fetched from API
  const [aiAgents, setAIAgents] = useState<AssignableEntity[]>([])
  const [aiEnabled, setAIEnabled] = useState(false)
  const [entitiesLoaded, setEntitiesLoaded] = useState(false)

  // Fetch assignable entities (including AI Agents) when dropdown opens
  useEffect(() => {
    if (open && !entitiesLoaded) {
      fetchAssignableEntities()
    }
  }, [open, entitiesLoaded])

  const fetchAssignableEntities = async () => {
    try {
      const response = await assignmentApi.fetchAssignableEntities()
      setAIAgents(response.aiAgents || [])
      // AI is enabled if there are AI agents available
      setAIEnabled(response.aiAgents && response.aiAgents.length > 0)
      setEntitiesLoaded(true)
    } catch (error) {
      console.error("[AssignmentDropdown] Failed to fetch assignable entities:", error)
      setEntitiesLoaded(true)
    }
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

  // Find current user in assignable users for self-assign
  const currentUserData = assignableUsers.find((u) => u.id === currentUserId)
  const isAssignedToCurrentUser = currentAssignee?.id === currentUserId
  
  // Check if currently assigned to an AI Agent
  const isAssignedToAI = currentAssigneeType === "AI_AGENT" && !!currentAIAgentId
  
  // Determine if there's any current assignment (human or AI)
  const hasCurrentAssignment = !!currentAssignee || isAssignedToAI

  // Sort users: current user first, then by role (owner first), then alphabetically
  const sortedUsers = [...assignableUsers].sort((a, b) => {
    if (a.id === currentUserId) return -1
    if (b.id === currentUserId) return 1
    if (a.role === "BUSINESS_OWNER" && b.role !== "BUSINESS_OWNER") return -1
    if (b.role === "BUSINESS_OWNER" && a.role !== "BUSINESS_OWNER") return 1
    return a.name.localeCompare(b.name)
  })

  const handleAssignToHuman = async (userId: string) => {
    if (isLoading || disabled) return
    
    setIsLoading(true)
    try {
      await onAssign(userId, 'human')
      setOpen(false)
    } catch (error) {
      console.error("Failed to assign to human:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleAssignToAI = async (aiAgentId: string) => {
    if (isLoading || disabled) return
    
    setIsLoading(true)
    try {
      await onAssign(aiAgentId, 'ai')
      setOpen(false)
    } catch (error) {
      console.error("Failed to assign to AI:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleUnassign = async () => {
    // Allow unassign if assigned to human OR AI Agent
    if (isLoading || disabled || !hasCurrentAssignment) return
    
    setIsLoading(true)
    try {
      await onUnassign()
      setOpen(false)
    } catch (error) {
      console.error("Failed to unassign:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={size === "md" ? "default" : "sm"}
          disabled={disabled || isLoading}
          className={cn(
            "flex items-center gap-1.5 px-2",
            size === "sm" ? "h-7" : "h-9",
            className
          )}
        >
          {/* Show AI Agent badge if assigned to AI, otherwise show human badge */}
          {isAssignedToAI ? (
            <div
              className={cn(
                "flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
                size === "sm" ? "h-6 w-6" : "h-8 w-8"
              )}
            >
              <IconRobot className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
            </div>
          ) : (
            <AssignmentBadge
              assignee={currentAssignee}
              size={size}
              showTooltip={false}
            />
          )}
          <IconChevronDown className={cn(
            "text-muted-foreground",
            size === "sm" ? "h-3 w-3" : "h-4 w-4"
          )} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs text-muted-foreground">
          {t("assignTo")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* Self-assign option if not already assigned to current user */}
        {currentUserData && !isAssignedToCurrentUser && !isAssignedToAI && (
          <>
            <DropdownMenuItem
              onClick={() => handleAssignToHuman(currentUserId)}
              disabled={isLoading}
              className="cursor-pointer"
            >
              <div className="flex items-center gap-2 flex-1">
                <Avatar className="h-6 w-6">
                  <AvatarImage src={currentUserData.image || undefined} />
                  <AvatarFallback className={cn("text-[10px]", getRoleColor(currentUserData.role))}>
                    {getInitials(currentUserData.name)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {currentUserData.name}
                    <span className="text-muted-foreground font-normal ml-1">{t("me")}</span>
                  </p>
                </div>
                <IconUserPlus className="h-4 w-4 text-muted-foreground" />
              </div>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}

        {/* Team Members Section */}
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
            {t("teamMembers")}
          </DropdownMenuLabel>
          {sortedUsers.map((user) => {
            const isCurrentAssignee = currentAssignee?.id === user.id && currentAssigneeType === "HUMAN"
            const isCurrentUser = user.id === currentUserId

            // Skip current user in main list if shown above
            if (isCurrentUser && !isAssignedToCurrentUser && !isAssignedToAI) return null

            return (
              <DropdownMenuItem
                key={user.id}
                onClick={() => !isCurrentAssignee && handleAssignToHuman(user.id)}
                disabled={isLoading || isCurrentAssignee}
                className={cn(
                  "cursor-pointer",
                  isCurrentAssignee && "bg-accent"
                )}
              >
                <div className="flex items-center gap-2 flex-1">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={user.image || undefined} />
                    <AvatarFallback className={cn("text-[10px]", getRoleColor(user.role))}>
                      {getInitials(user.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {user.name}
                      {isCurrentUser && (
                        <span className="text-muted-foreground font-normal ml-1">{t("me")}</span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.role === "BUSINESS_OWNER" ? t("owner") : t("agent")}
                    </p>
                  </div>
                  {isCurrentAssignee && (
                    <IconCheck className="h-4 w-4 text-primary" />
                  )}
                </div>
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuGroup>

        {/* AI Agents Section - Only show if AI is enabled (has AI agents) */}
        {aiEnabled && aiAgents.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuLabel className="text-xs text-muted-foreground px-2 py-1">
                {t("aiAgents")}
              </DropdownMenuLabel>
              {aiAgents.map((agent) => {
                const isCurrentAIAssignee = isAssignedToAI && currentAIAgentId === agent.id

                return (
                  <DropdownMenuItem
                    key={agent.id}
                    onClick={() => !isCurrentAIAssignee && handleAssignToAI(agent.id)}
                    disabled={isLoading || isCurrentAIAssignee}
                    className={cn(
                      "cursor-pointer",
                      isCurrentAIAssignee && "bg-accent"
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1">
                      <div className="h-6 w-6 flex items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                        <IconRobot className="h-3.5 w-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{agent.name}</p>
                        <p className="text-xs text-muted-foreground">{t("aiAgent")}</p>
                      </div>
                      {isCurrentAIAssignee && (
                        <IconCheck className="h-4 w-4 text-primary" />
                      )}
                    </div>
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuGroup>
          </>
        )}

        {/* Unassign option */}
        {hasCurrentAssignment && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleUnassign}
              disabled={isLoading}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <IconUserOff className="h-4 w-4 mr-2" />
              {t("unassign")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
