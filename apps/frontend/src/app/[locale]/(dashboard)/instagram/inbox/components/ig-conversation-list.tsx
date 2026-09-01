"use client"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Search } from "lucide-react"
import { IconBrandInstagram } from "@tabler/icons-react"
import type { IGConversation } from "@/lib/api/instagram"
import { formatDistanceToNow } from "date-fns"

interface Props {
  conversations: IGConversation[]
  selectedConversation: IGConversation | null
  onSelectConversation: (conversation: IGConversation) => void
  loading: boolean
  onRefresh: () => void
  searchQuery: string
  onSearchChange: (query: string) => void
  onSearch: (query: string) => void
  className?: string
}

export function IGConversationList({
  conversations,
  selectedConversation,
  onSelectConversation,
  loading,
  onRefresh,
  searchQuery,
  onSearchChange,
  onSearch,
  className,
}: Props) {
  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    onSearch(searchQuery)
  }

  return (
    <div className={`w-full md:w-[320px] border-r flex flex-col ${className}`}>
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <IconBrandInstagram className="h-5 w-5 text-pink-500" />
            Instagram DMs
          </h3>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={loading}
            className="h-8 w-8 p-0"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
        {conversations.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {conversations.length} conversation{conversations.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Search */}
      <form onSubmit={handleSearch} className="p-3 border-b">
        <div className="relative">
          <Input
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-9"
          />
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        </div>
      </form>

      {/* Conversations */}
      <ScrollArea className="flex-1">
        {conversations.length === 0 ? (
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
              <IconBrandInstagram className="h-8 w-8 text-white" />
            </div>
            <p className="text-sm font-medium mb-1">No conversations yet</p>
            <p className="text-xs text-muted-foreground">
              Conversations will appear when users message you on Instagram
            </p>
          </div>
        ) : (
          conversations.map((conversation) => {
            const isSelected = selectedConversation?.id === conversation.id
            const hasUnread = conversation.unreadCount > 0

            return (
              <button
                key={conversation.id}
                onClick={() => onSelectConversation(conversation)}
                className={`w-full p-4 flex items-start gap-3 transition-all duration-150 border-b ${
                  isSelected
                    ? "bg-accent border-l-4 border-l-pink-500"
                    : "hover:bg-accent/50 border-l-4 border-l-transparent"
                }`}
              >
                <div className="relative">
                  <Avatar className="h-12 w-12">
                    <AvatarImage src={conversation.participantProfilePic || undefined} />
                    <AvatarFallback className="bg-gradient-to-br from-purple-500 to-pink-500 text-white">
                      {conversation.participantUsername?.substring(0, 2).toUpperCase() || "IG"}
                    </AvatarFallback>
                  </Avatar>
                  {conversation.isWindowActive && (
                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
                  )}
                </div>

                <div className="flex-1 min-w-0 text-left">
                  <div className="flex items-center justify-between mb-1">
                    <p className={`font-semibold truncate ${isSelected ? "text-pink-600" : ""}`}>
                      @{conversation.participantUsername || "Unknown"}
                    </p>
                    {conversation.lastMessageAt && (
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(conversation.lastMessageAt), { addSuffix: false })}
                      </span>
                    )}
                  </div>

                  {conversation.participantName && (
                    <p className="text-xs text-muted-foreground mb-1">
                      {conversation.participantName}
                    </p>
                  )}

                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${hasUnread ? "font-medium" : "text-muted-foreground"}`}>
                      {conversation.lastMessagePreview || "No messages"}
                    </p>
                    {hasUnread && (
                      <Badge className="ml-2 bg-pink-500 text-white text-xs h-5 min-w-5 flex items-center justify-center">
                        {conversation.unreadCount}
                      </Badge>
                    )}
                  </div>

                  {/* Window status indicator */}
                  {!conversation.isWindowActive && (
                    <p className="text-xs text-amber-600 mt-1">
                      ⚠️ 24h window closed
                    </p>
                  )}
                </div>
              </button>
            )
          })
        )}
      </ScrollArea>
    </div>
  )
}
