"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Button } from "@/components/ui/button"

// WhatsApp default reaction emojis
const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏"]

interface ReactionPickerProps {
  onReact: (emoji: string) => void
  trigger: React.ReactNode
  disabled?: boolean
  className?: string
}

export function ReactionPicker({
  onReact,
  trigger,
  disabled = false,
  className,
}: ReactionPickerProps) {
  const [open, setOpen] = useState(false)

  const handleReact = (emoji: string) => {
    onReact(emoji)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        {trigger}
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-auto p-1", className)}
        side="top"
        align="start"
        sideOffset={4}
      >
        <div className="flex items-center gap-0.5">
          {REACTION_EMOJIS.map((emoji) => (
            <Button
              key={emoji}
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0 text-lg hover:bg-muted hover:scale-125 transition-transform"
              onClick={() => handleReact(emoji)}
            >
              {emoji}
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

// Inline reaction picker for message hover actions
interface InlineReactionPickerProps {
  onReact: (emoji: string) => void
  className?: string
}

export function InlineReactionPicker({
  onReact,
  className,
}: InlineReactionPickerProps) {
  return (
    <div className={cn("flex items-center gap-0.5 bg-background border rounded-lg px-1 py-0.5 shadow-sm", className)}>
      {REACTION_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          className="h-6 w-6 flex items-center justify-center text-sm hover:bg-muted rounded transition-colors hover:scale-110"
          onClick={() => onReact(emoji)}
          title={`React with ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
