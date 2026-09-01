"use client"

import { useState } from "react"
import { IconMoodSmile, IconCornerDownRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

// WhatsApp default reaction emojis
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

interface MessageHoverActionsProps {
  onReact: (emoji: string) => void
  onReply: () => void
  isOutbound: boolean
  disabled?: boolean
  className?: string
}

export function MessageHoverActions({
  onReact,
  onReply,
  isOutbound,
  disabled = false,
  className,
}: MessageHoverActionsProps) {
  const [reactionOpen, setReactionOpen] = useState(false)

  const handleReact = (emoji: string) => {
    onReact(emoji)
    setReactionOpen(false)
  }

  return (
    <div
      className={cn(
        "absolute top-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity z-10",
        isOutbound ? "right-full mr-1" : "left-full ml-1",
        className
      )}
    >
      {/* Reaction button */}
      <Popover open={reactionOpen} onOpenChange={setReactionOpen}>
        <PopoverTrigger asChild disabled={disabled}>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 bg-background/90 hover:bg-background border shadow-sm"
            title="React"
          >
            <IconMoodSmile className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto p-1"
          side={isOutbound ? "left" : "right"}
          align="start"
          sideOffset={4}
        >
          <div className="flex items-center gap-0.5">
            {REACTION_EMOJIS.map((emoji) => (
              <Button
                key={emoji}
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-lg hover:bg-muted hover:scale-110 transition-transform"
                onClick={() => handleReact(emoji)}
              >
                {emoji}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {/* Reply button */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 bg-background/90 hover:bg-background border shadow-sm"
        onClick={onReply}
        disabled={disabled}
        title="Reply"
      >
        <IconCornerDownRight className="h-4 w-4" />
      </Button>
    </div>
  )
}
