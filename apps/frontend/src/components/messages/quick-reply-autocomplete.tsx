"use client"

import { useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { QuickReply } from "@/lib/api/quick-replies-api"

interface QuickReplyAutocompleteProps {
  /** Whether the autocomplete is open */
  isOpen: boolean
  /** List of matching quick replies */
  results: QuickReply[]
  /** Currently selected index */
  selectedIndex: number
  /** Callback when a quick reply is selected */
  onSelect: (quickReply: QuickReply) => void
  /** Loading state */
  isLoading?: boolean
  /** Search query being used */
  query?: string
}

/**
 * Quick Reply Autocomplete Dropdown
 *
 * Floating dropdown that shows matching quick replies when typing `/shortcut`.
 * Positioned above the input field.
 */
export function QuickReplyAutocomplete({
  isOpen,
  results,
  selectedIndex,
  onSelect,
  isLoading,
  query,
}: QuickReplyAutocompleteProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const selectedRef = useRef<HTMLButtonElement>(null)

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current && containerRef.current) {
      selectedRef.current.scrollIntoView({
        block: "nearest",
        behavior: "instant",
      })
    }
  }, [selectedIndex])

  if (!isOpen) return null

  // Show loading state
  if (isLoading) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "absolute bottom-full left-0 right-0 z-50 mb-2",
          "max-h-[200px] overflow-hidden rounded-lg border bg-popover shadow-lg"
        )}
      >
        <div className="flex items-center justify-center p-4">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          <span className="ml-2 text-sm text-muted-foreground">
            Searching...
          </span>
        </div>
      </div>
    )
  }

  // Show no results message
  if (results.length === 0) {
    return (
      <div
        ref={containerRef}
        className={cn(
          "absolute bottom-full left-0 right-0 z-50 mb-2",
          "overflow-hidden rounded-lg border bg-popover shadow-lg"
        )}
      >
        <div className="p-3 text-center text-sm text-muted-foreground">
          {query ? (
            <>
              No quick replies matching <code className="rounded bg-muted px-1">/{query}</code>
            </>
          ) : (
            "Type to search quick replies"
          )}
        </div>
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      role="listbox"
      aria-label="Quick reply suggestions"
      className={cn(
        "absolute bottom-full left-0 right-0 z-50 mb-2",
        "max-h-[200px] overflow-y-auto rounded-lg border bg-popover shadow-lg"
      )}
    >
      <div className="p-1">
        {results.map((reply, index) => {
          const isSelected = index === selectedIndex

          return (
            <button
              key={reply.id}
              ref={isSelected ? selectedRef : undefined}
              role="option"
              aria-selected={isSelected}
              onClick={() => onSelect(reply)}
              className={cn(
                "w-full rounded-md px-3 py-2 text-left transition-colors",
                "focus:outline-none",
                isSelected
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/50"
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
                    {reply.category && (
                      <Badge variant="outline" className="flex-shrink-0 text-[10px]">
                        {reply.category.name}
                      </Badge>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {reply.content}
                  </p>
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Keyboard hint */}
      <div className="border-t px-3 py-1.5 bg-muted/30">
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>
            <kbd className="rounded border bg-background px-1">↑</kbd>
            <kbd className="ml-0.5 rounded border bg-background px-1">↓</kbd>
            {" "}navigate
          </span>
          <span>
            <kbd className="rounded border bg-background px-1">Tab</kbd>
            {" "}or{" "}
            <kbd className="rounded border bg-background px-1">Enter</kbd>
            {" "}select
          </span>
          <span>
            <kbd className="rounded border bg-background px-1">Esc</kbd>
            {" "}close
          </span>
        </div>
      </div>
    </div>
  )
}
