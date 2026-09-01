/**
 * useConversationFilters Hook
 * Handles conversation filtering logic
 */

import { useState, useMemo, useCallback } from "react"
import type {
  ChannelType,
  UnifiedConversation,
  ReadStatusFilter,
  AssignmentFilterType,
} from "./unified-inbox-types"
import type { AccountFilterValue } from "../components/account-filter"

interface UseConversationFiltersOptions {
  conversations: UnifiedConversation[]
  userId: string | null
  assignmentFilter: AssignmentFilterType
}

export function useConversationFilters({
  conversations,
  userId,
  assignmentFilter,
}: UseConversationFiltersOptions) {
  // Filter state
  const [channelFilter, setChannelFilter] = useState<ChannelType | "all">("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [readStatusFilter, setReadStatusFilter] = useState<ReadStatusFilter>("all")
  const [tagsFilter, setTagsFilter] = useState<string[]>([])
  const [pipelineFilter, setPipelineFilter] = useState<string[]>([])
  const [accountFilter, setAccountFilter] = useState<AccountFilterValue>("all")

  // Clear all filters
  const clearFilters = useCallback(() => {
    setReadStatusFilter("all")
    setTagsFilter([])
    setPipelineFilter([])
    setSearchQuery("")
    setAccountFilter("all")
  }, [])

  // Filtering logic
  const filteredConversations = useMemo(() => {
    let filtered = conversations

    // Filter by channel
    if (channelFilter !== "all") {
      filtered = filtered.filter((c) => c.channel === channelFilter)
    }

    // Filter by read status
    if (readStatusFilter === "unread") {
      filtered = filtered.filter((c) => c.unreadCount > 0)
    } else if (readStatusFilter === "read") {
      filtered = filtered.filter((c) => c.unreadCount === 0)
    }

    // Filter by assignment status (Requirements: 5.2, 5.3, 5.4)
    if (assignmentFilter === "mine") {
      filtered = filtered.filter((c) => c.assigneeId === userId)
    } else if (assignmentFilter === "unassigned") {
      filtered = filtered.filter((c) => !c.assigneeId)
    } else if (assignmentFilter === "others") {
      filtered = filtered.filter((c) => c.assigneeId && c.assigneeId !== userId)
    }

    // Filter by tags (OR logic within tags)
    if (tagsFilter.length > 0) {
      filtered = filtered.filter((c) =>
        c.tags.some((tag) => tagsFilter.includes(tag))
      )
    }

    // Filter by pipeline stages (OR logic within stages)
    if (pipelineFilter.length > 0) {
      const includeNoStage = pipelineFilter.includes("no-stage")
      filtered = filtered.filter((c) => {
        if (includeNoStage && !c.pipelineStageId) return true
        return c.pipelineStageId && pipelineFilter.includes(c.pipelineStageId)
      })
    }

    // Filter by account (WhatsApp phone number, Instagram account, or Facebook Page)
    if (accountFilter !== "all") {
      if (accountFilter.startsWith("wa-")) {
        const phoneNumberId = accountFilter.replace("wa-", "")
        filtered = filtered.filter(
          (c) => c.channel === "whatsapp" && c.whatsappPhoneNumberId === phoneNumberId
        )
      } else if (accountFilter.startsWith("ig-")) {
        const accountId = accountFilter.replace("ig-", "")
        filtered = filtered.filter(
          (c) => c.channel === "instagram" && c.instagramAccountId === accountId
        )
      } else if (accountFilter.startsWith("fb-")) {
        const pageId = accountFilter.replace("fb-", "")
        filtered = filtered.filter(
          (c) => c.channel === "messenger" && c.facebookPageId === pageId
        )
      }
    }

    // Filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(
        (c) =>
          c.participantName?.toLowerCase().includes(query) ||
          c.participantIdentifier.toLowerCase().includes(query)
      )
    }

    return filtered
  }, [conversations, channelFilter, readStatusFilter, assignmentFilter, tagsFilter, pipelineFilter, accountFilter, searchQuery, userId])

  return {
    // State
    channelFilter,
    setChannelFilter,
    searchQuery,
    setSearchQuery,
    readStatusFilter,
    setReadStatusFilter,
    tagsFilter,
    setTagsFilter,
    pipelineFilter,
    setPipelineFilter,
    accountFilter,
    setAccountFilter,
    // Computed
    filteredConversations,
    // Actions
    clearFilters,
  }
}
