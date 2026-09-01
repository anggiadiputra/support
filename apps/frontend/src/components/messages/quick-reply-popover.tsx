"use client"

import { useState, useMemo } from "react"
import { IconMessageBolt, IconSearch, IconLoader2 } from "@tabler/icons-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Badge } from "@/components/ui/badge"
import { useQuickReplies, useQuickReplyCategories } from "@/hooks/use-quick-replies"
import { cn } from "@/lib/utils"
import type { QuickReply } from "@/lib/api/quick-replies-api"

interface QuickReplyPopoverProps {
  /** Callback when a quick reply is selected */
  onSelect: (content: string) => void
  /** Whether the button is disabled */
  disabled?: boolean
}

/**
 * Quick Reply Popover Component
 *
 * Shows a button that opens a popover with searchable quick replies.
 * Quick replies are grouped by category for easy navigation.
 */
export function QuickReplyPopover({ onSelect, disabled }: QuickReplyPopoverProps) {
  const [open, setOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")

  // Fetch quick replies and categories
  const { data: quickReplies = [], isLoading: isLoadingReplies } = useQuickReplies()
  const { data: categories = [], isLoading: isLoadingCategories } = useQuickReplyCategories()

  const isLoading = isLoadingReplies || isLoadingCategories

  // Filter quick replies by search query
  const filteredReplies = useMemo(() => {
    if (!searchQuery.trim()) return quickReplies

    const query = searchQuery.toLowerCase()
    return quickReplies.filter(
      (reply) =>
        reply.title.toLowerCase().includes(query) ||
        reply.shortcut.toLowerCase().includes(query) ||
        reply.content.toLowerCase().includes(query)
    )
  }, [quickReplies, searchQuery])

  // Group quick replies by category
  const groupedReplies = useMemo(() => {
    const groups: Record<string, QuickReply[]> = {
      uncategorized: [],
    }

    // Initialize groups for all categories
    categories.forEach((cat) => {
      groups[cat.id] = []
    })

    // Group quick replies
    filteredReplies.forEach((reply) => {
      const categoryId = reply.category?.id || "uncategorized"
      if (!groups[categoryId]) {
        groups[categoryId] = []
      }
      groups[categoryId].push(reply)
    })

    return groups
  }, [filteredReplies, categories])

  // Get category name by ID
  const getCategoryName = (categoryId: string): string => {
    if (categoryId === "uncategorized") return "Uncategorized"
    const category = categories.find((c) => c.id === categoryId)
    return category?.name || "Unknown"
  }

  // Handle quick reply selection
  const handleSelect = (reply: QuickReply) => {
    onSelect(reply.content)
    setOpen(false)
    setSearchQuery("")
  }

  // Check if there are any results
  const hasResults = filteredReplies.length > 0

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="flex-shrink-0 text-muted-foreground hover:text-foreground"
          title="Quick Replies"
        >
          <IconMessageBolt className="h-5 w-5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0"
        align="start"
        side="top"
        sideOffset={8}
      >
        <div className="flex flex-col">
          {/* Search Header */}
          <div className="border-b p-3">
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search quick replies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
                autoFocus
              />
            </div>
          </div>

          {/* Content Area */}
          <ScrollArea className="max-h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center p-6">
                <IconLoader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : !hasResults ? (
              <div className="p-6 text-center text-sm text-muted-foreground">
                {searchQuery
                  ? "No quick replies found"
                  : "No quick replies available"}
              </div>
            ) : (
              <div className="p-2">
                {Object.entries(groupedReplies).map(([categoryId, replies]) => {
                  if (replies.length === 0) return null

                  return (
                    <div key={categoryId} className="mb-3 last:mb-0">
                      {/* Category Header */}
                      <div className="mb-1.5 px-2">
                        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                          {getCategoryName(categoryId)}
                        </span>
                      </div>

                      {/* Quick Reply Items */}
                      <div className="space-y-0.5">
                        {replies.map((reply) => (
                          <button
                            key={reply.id}
                            onClick={() => handleSelect(reply)}
                            className={cn(
                              "w-full rounded-md px-2 py-2 text-left transition-colors",
                              "hover:bg-accent focus:bg-accent focus:outline-none"
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-sm truncate">
                                    {reply.title}
                                  </span>
                                  <Badge
                                    variant="secondary"
                                    className="flex-shrink-0 text-[10px] font-mono"
                                  >
                                    /{reply.shortcut}
                                  </Badge>
                                </div>
                                <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">
                                  {reply.content}
                                </p>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer Hint */}
          <div className="border-t px-3 py-2">
            <p className="text-[10px] text-muted-foreground">
              Tip: Type <code className="rounded bg-muted px-1">/shortcut</code> in the message box for quick access
            </p>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
