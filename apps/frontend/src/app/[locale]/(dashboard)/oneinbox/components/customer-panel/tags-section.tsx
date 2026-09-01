"use client"

import { useState, useRef } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Plus, X, Loader2, Tag } from "lucide-react"

interface TagsSectionProps {
  tags: string[]
  availableTags: string[]
  onAddTag: (tag: string) => Promise<boolean>
  onRemoveTag: (tag: string) => Promise<boolean>
  loading?: boolean
  readOnly?: boolean
}

export function TagsSection({
  tags,
  availableTags,
  onAddTag,
  onRemoveTag,
  loading = false,
}: TagsSectionProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingTag, setPendingTag] = useState<string | null>(null)
  const [newTagInput, setNewTagInput] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  // Filter out tags that are already assigned
  const unassignedTags = availableTags.filter((tag) => !tags.includes(tag))
  
  // Filter suggestions based on input
  const filteredSuggestions = newTagInput.trim()
    ? unassignedTags.filter((tag) => 
        tag.toLowerCase().includes(newTagInput.toLowerCase())
      )
    : unassignedTags

  const handleAddTag = async (tag: string) => {
    const trimmedTag = tag.trim()
    if (!trimmedTag) return
    
    setPendingTag(trimmedTag)
    const success = await onAddTag(trimmedTag)
    if (success) {
      setNewTagInput("")
      setIsOpen(false)
    }
    setPendingTag(null)
  }

  const handleRemoveTag = async (tag: string) => {
    setPendingTag(tag)
    await onRemoveTag(tag)
    setPendingTag(null)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && newTagInput.trim()) {
      e.preventDefault()
      handleAddTag(newTagInput)
    }
  }

  const isNewTag = newTagInput.trim() && !availableTags.some(
    (tag) => tag.toLowerCase() === newTagInput.trim().toLowerCase()
  )

  return (
    <div className="p-4 border-b">
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium flex items-center gap-2">
          <Tag className="h-4 w-4 text-muted-foreground" />
          Tags
        </h4>
        <Popover open={isOpen} onOpenChange={(open) => {
          setIsOpen(open)
          if (open) {
            setTimeout(() => inputRef.current?.focus(), 100)
          } else {
            setNewTagInput("")
          }
        }}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              disabled={loading}
            >
              <Plus className="h-3 w-3" />
              Add Tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-3" align="end">
            <div className="space-y-3">
              {/* Input for new tag */}
              <div className="space-y-1.5">
                <Input
                  ref={inputRef}
                  placeholder="Type to add or search..."
                  value={newTagInput}
                  onChange={(e) => setNewTagInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="h-8 text-sm"
                  disabled={pendingTag !== null}
                />
                {isNewTag && (
                  <Button
                    size="sm"
                    className="w-full h-7 text-xs"
                    onClick={() => handleAddTag(newTagInput)}
                    disabled={pendingTag !== null}
                  >
                    {pendingTag === newTagInput.trim() ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Plus className="h-3 w-3 mr-1" />
                    )}
                    Create "{newTagInput.trim()}"
                  </Button>
                )}
              </div>

              {/* Existing tags suggestions */}
              {filteredSuggestions.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground">
                    {newTagInput ? "Suggestions" : "Available tags"}
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-0.5">
                    {filteredSuggestions.slice(0, 10).map((tag) => (
                      <button
                        key={tag}
                        onClick={() => handleAddTag(tag)}
                        disabled={pendingTag === tag}
                        className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent text-left text-sm disabled:opacity-50"
                      >
                        {pendingTag === tag ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Tag className="h-3 w-3 text-muted-foreground" />
                        )}
                        <span className="truncate">{tag}</span>
                      </button>
                    ))}
                    {filteredSuggestions.length > 10 && (
                      <p className="text-xs text-muted-foreground px-2 py-1">
                        +{filteredSuggestions.length - 10} more...
                      </p>
                    )}
                  </div>
                </div>
              )}

              {filteredSuggestions.length === 0 && !isNewTag && newTagInput && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Press Enter to create this tag
                </p>
              )}
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {tags.length === 0 ? (
          <p className="text-xs text-muted-foreground">No tags assigned</p>
        ) : (
          tags.map((tag) => (
            <Badge
              key={tag}
              variant="secondary"
              className="gap-1 pr-1"
            >
              {tag}
              <button
                onClick={() => handleRemoveTag(tag)}
                disabled={loading || pendingTag === tag}
                className="ml-1 hover:bg-muted rounded-full p-0.5 disabled:opacity-50"
              >
                {pendingTag === tag ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <X className="h-3 w-3" />
                )}
              </button>
            </Badge>
          ))
        )}
      </div>
    </div>
  )
}
