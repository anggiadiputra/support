"use client"

import { useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { RefreshCw, Search, Loader2 } from "lucide-react"
import { IconBrandWhatsapp, IconBrandInstagram, IconBrandFacebook, IconInbox, IconFilterOff } from "@tabler/icons-react"
import { formatDistanceToNow } from "date-fns"
import type { UnifiedConversation, ChannelType, ReadStatusFilter, AssignmentFilterType, AssignableUser, PipelineStage } from "../types/unified-inbox"
import { ChannelFilter } from "./channel-filter"
import { AssignmentFilter } from "./assignment-filter"
import { AssignmentBadge } from "./assignment-badge"
import { AIStatusIndicator } from "./ai-status-indicator"
import { FilterBar } from "./filter-bar"
import type { AccountFilterValue, WhatsAppPhoneNumberOption } from "./account-filter"
import type { InstagramAccount } from "@/lib/api/instagram"
import type { FacebookPage } from "@/lib/api/messenger"

// Skeleton component for conversation item
function ConversationSkeleton() {
  return (
    <div className="flex items-start gap-3 p-3 border-b">
      <Skeleton className="h-10 w-10 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-12" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4" />
      </div>
    </div>
  )
}

interface UnifiedConversationListProps {
  conversations: UnifiedConversation[]
  selectedConversation: UnifiedConversation | null
  onSelectConversation: (conversation: UnifiedConversation) => void
  loading: boolean
  onRefresh: () => void
  channelFilter: ChannelType | "all"
  onChannelFilterChange: (filter: ChannelType | "all") => void
  searchQuery: string
  onSearchChange: (query: string) => void
  whatsappConnected: boolean
  instagramConnected: boolean | null
  // Filter props
  readStatusFilter: ReadStatusFilter
  onReadStatusChange: (status: ReadStatusFilter) => void
  tagsFilter: string[]
  onTagsChange: (tags: string[]) => void
  pipelineFilter: string[]
  onPipelineChange: (stages: string[]) => void
  availableTags: string[]
  pipelineStages: PipelineStage[]
  onClearFilters: () => void
  // Account filter props
  accountFilter: AccountFilterValue
  onAccountFilterChange: (filter: AccountFilterValue) => void
  instagramAccounts: InstagramAccount[]
  facebookPages: FacebookPage[]
  whatsappPhoneNumbers?: WhatsAppPhoneNumberOption[]
  // Assignment filter props (Requirements: 5.1)
  assignmentFilter: AssignmentFilterType
  onAssignmentFilterChange: (filter: AssignmentFilterType) => void
  assignableUsers: AssignableUser[]
  // AI status props (Requirements: 5.1, 5.2, 5.3, 5.4)
  aiEnabled: boolean
  defaultAIAgentName?: string | null
  className?: string
  // Infinite scroll props
  hasMore?: boolean
  isLoadingMore?: boolean
  onLoadMore?: () => void
}

export function UnifiedConversationList({
  conversations,
  selectedConversation,
  onSelectConversation,
  loading,
  onRefresh,
  channelFilter,
  onChannelFilterChange,
  searchQuery,
  onSearchChange,
  whatsappConnected,
  instagramConnected,
  readStatusFilter,
  onReadStatusChange,
  tagsFilter,
  onTagsChange,
  pipelineFilter,
  onPipelineChange,
  availableTags,
  pipelineStages,
  onClearFilters,
  accountFilter,
  onAccountFilterChange,
  instagramAccounts,
  facebookPages,
  whatsappPhoneNumbers = [],
  assignmentFilter,
  onAssignmentFilterChange,
  assignableUsers,
  aiEnabled,
  defaultAIAgentName,
  className,
  hasMore = false,
  isLoadingMore = false,
  onLoadMore,
}: UnifiedConversationListProps) {
  // Ref for infinite scroll trigger element
  const loadMoreTriggerRef = useRef<HTMLDivElement>(null)

  // Infinite scroll using Intersection Observer - more reliable than scroll listener
  useEffect(() => {
    if (!hasMore || isLoadingMore || !onLoadMore) return

    const triggerElement = loadMoreTriggerRef.current
    if (!triggerElement) return

    const observer = new IntersectionObserver(
      (entries) => {
        // When trigger element becomes visible, load more
        if (entries[0].isIntersecting) {
          onLoadMore()
        }
      },
      { 
        // Trigger when element is within 200px of viewport
        rootMargin: '200px',
        threshold: 0
      }
    )

    observer.observe(triggerElement)
    return () => observer.disconnect()
  }, [hasMore, isLoadingMore, onLoadMore])

  const getInitials = (name?: string | null, identifier?: string) => {
    if (name) return name.substring(0, 2).toUpperCase()
    if (identifier) return identifier.replace(/[@+]/g, "").substring(0, 2).toUpperCase()
    return "U"
  }

  const hasActiveFilters =
    readStatusFilter !== "all" || assignmentFilter !== "all" || tagsFilter.length > 0 || pipelineFilter.length > 0 || accountFilter !== "all"

  const getChannelIcon = (channel: ChannelType) => {
    if (channel === "whatsapp") {
      return <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
    }
    if (channel === "messenger") {
      return <IconBrandFacebook className="h-4 w-4 text-blue-500" />
    }
    return <IconBrandInstagram className="h-4 w-4 text-pink-500" />
  }

  const getChannelColor = (channel: ChannelType, isSelected: boolean) => {
    if (!isSelected) return "border-l-transparent"
    if (channel === "whatsapp") return "border-l-green-500"
    if (channel === "messenger") return "border-l-blue-500"
    return "border-l-pink-500"
  }

  const getAvatarStyle = (channel: ChannelType) => {
    if (channel === "instagram") {
      return "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
    }
    if (channel === "messenger") {
      return "bg-gradient-to-br from-blue-500 to-blue-600 text-white"
    }
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
  }

  return (
    <div className={`w-full md:w-[360px] border-r flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        {/* Filter Dropdowns - Side by side with Reload */}
        <div className="flex gap-2 items-center">
          {/* Channel Filter */}
          <div className="flex-1">
            <ChannelFilter value={channelFilter} onChange={onChannelFilterChange} />
          </div>
          
          {/* Assignment Filter (Requirements: 5.1) */}
          <div className="flex-1">
            <AssignmentFilter 
              value={assignmentFilter} 
              onChange={onAssignmentFilterChange}
            />
          </div>
          
          {/* Reload Button */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-9 w-9 p-0 shrink-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </div>

      {/* Filter Bar */}
      <FilterBar
        readStatusFilter={readStatusFilter}
        onReadStatusChange={onReadStatusChange}
        tagsFilter={tagsFilter}
        onTagsChange={onTagsChange}
        pipelineFilter={pipelineFilter}
        onPipelineChange={onPipelineChange}
        availableTags={availableTags}
        availableStages={pipelineStages}
        resultCount={conversations.length}
        onClearFilters={onClearFilters}
        accountFilter={accountFilter}
        onAccountFilterChange={onAccountFilterChange}
        instagramAccounts={instagramAccounts}
        facebookPages={facebookPages}
        whatsappPhoneNumbers={whatsappPhoneNumbers}
      />

{/* Conversations List */}
      <ScrollArea className="flex-1">
        {loading && conversations.length === 0 ? (
          // Show skeleton loader when loading and no cached data
          <div>
            {Array.from({ length: 8 }).map((_, i) => (
              <ConversationSkeleton key={i} />
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              {hasActiveFilters ? (
                <IconFilterOff className="h-8 w-8 text-primary" />
              ) : (
                <IconInbox className="h-8 w-8 text-primary" />
              )}
            </div>
            <p className="text-sm font-medium mb-1">
              {hasActiveFilters ? "No conversations match your filters" : "No conversations yet"}
            </p>
            <p className="text-xs text-muted-foreground mb-3">
              {hasActiveFilters
                ? "Try adjusting your filters to see more results"
                : "Messages from WhatsApp, Instagram, and Messenger will appear here"}
            </p>
            {hasActiveFilters && (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Clear Filters
              </Button>
            )}
          </div>
        ) : (
          conversations.map((conversation) => {
            const isSelected = selectedConversation?.id === conversation.id
            const hasUnread = conversation.unreadCount > 0

            // Build assignee object for AssignmentBadge (Requirements: 4.1, 4.2)
            const assignee: AssignableUser | null = conversation.assigneeId
              ? assignableUsers.find(u => u.id === conversation.assigneeId) || {
                  id: conversation.assigneeId,
                  name: conversation.assigneeName || "Unknown",
                  email: "",
                  image: conversation.assigneeImage,
                  role: "AGENT" as const,
                }
              : null

            return (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={`group w-full p-3 flex items-start gap-3 transition-all duration-150 border-b border-l-4 ${
                  isSelected
                    ? `bg-accent ${getChannelColor(conversation.channel, true)}`
                    : `hover:bg-accent/50 ${getChannelColor(conversation.channel, false)}`
                }`}
              >
                <div className="relative flex-shrink-0">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={conversation.participantAvatar || undefined} />
                    <AvatarFallback className={getAvatarStyle(conversation.channel)}>
                      {getInitials(conversation.participantName, conversation.participantDisplayId)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Channel indicator */}
                  <div className="absolute -bottom-0.5 -right-0.5 bg-background rounded-full p-0.5">
                    {getChannelIcon(conversation.channel)}
                  </div>
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-0.5">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <p className={`font-semibold text-sm truncate max-w-[120px] ${
                        isSelected 
                          ? conversation.channel === "whatsapp" 
                            ? "text-green-600" 
                            : conversation.channel === "messenger"
                            ? "text-blue-600"
                            : "text-pink-600"
                          : ""
                      }`}>
                        {conversation.participantName || conversation.participantDisplayId}
                      </p>
                      {/* Assignment & AI badges - show on hover only */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {/* Assignment Badge (Requirements: 1.5, 1.6, 4.1, 4.2) */}
                        <AssignmentBadge 
                          assignee={assignee} 
                          size="sm" 
                          showTooltip={true}
                          assigneeType={conversation.assigneeType}
                          aiAgentName={conversation.aiAgentName}
                        />
                        {/* AI Status Indicator (Requirements: 5.1, 5.2, 5.3, 5.4) */}
                        <AIStatusIndicator
                          assignment={null}
                          aiEnabled={aiEnabled}
                          defaultAIAgentName={defaultAIAgentName}
                          size="sm"
                          showTooltip={true}
                          assigneeType={conversation.assigneeType}
                          aiAgentName={conversation.aiAgentName}
                          hasHumanAssignee={!!conversation.assigneeId && conversation.assigneeType !== "AI_AGENT"}
                        />
                      </div>
                    </div>
                    {conversation.lastMessageAt && (
                      <span className="text-[10px] text-muted-foreground ml-1 flex-shrink-0">
                        {formatDistanceToNow(conversation.lastMessageAt, { addSuffix: false })}
                      </span>
                    )}
                  </div>

                  <p className="text-[11px] text-muted-foreground mb-0.5 truncate">
                    {conversation.participantDisplayId}
                    {/* WhatsApp phone number badge (multi-number) */}
                    {conversation.channel === "whatsapp" && conversation.whatsappDisplayNumber && whatsappPhoneNumbers.length > 1 && (
                      <span className="ml-1 text-green-600">
                        via {conversation.whatsappDisplayNumber}
                      </span>
                    )}
                  </p>

                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-xs truncate flex-1 ${hasUnread ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                      {conversation.lastMessagePreview || "No messages"}
                    </p>
                    {hasUnread && (
                      <Badge className={`flex-shrink-0 text-white text-[10px] h-4 min-w-4 px-1 flex items-center justify-center ${
                        conversation.channel === "whatsapp" 
                          ? "bg-green-500" 
                          : conversation.channel === "messenger"
                          ? "bg-blue-500"
                          : "bg-pink-500"
                      }`}>
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>

                  {/* Window status indicator */}
                  {!conversation.isWindowActive && (
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      24h window closed
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
        
        {/* Infinite scroll loading indicator */}
        {isLoadingMore && (
          <div className="flex items-center justify-center py-4 border-t">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mr-2" />
            <span className="text-sm text-muted-foreground">Loading more...</span>
          </div>
        )}
        
        {/* Load more trigger element */}
        {hasMore && !isLoadingMore && conversations.length > 0 && (
          <div 
            ref={loadMoreTriggerRef}
            className="flex items-center justify-center py-4 border-t"
          >
            <Button
              variant="ghost"
              size="sm"
              onClick={onLoadMore}
              className="text-muted-foreground"
            >
              Load more conversations
            </Button>
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
