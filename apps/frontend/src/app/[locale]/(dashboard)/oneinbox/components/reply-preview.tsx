"use client"

import { IconX, IconCornerDownRight } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import type { Message } from "@/lib/api/messages-api"

interface ReplyPreviewProps {
  message: Message
  onCancel: () => void
  className?: string
}

export function ReplyPreview({ message, onCancel, className }: ReplyPreviewProps) {
  // Truncate content if too long
  const truncatedContent = message.content && message.content.length > 100
    ? message.content.substring(0, 100) + "..."
    : message.content

  // Determine sender name
  const senderName = message.direction === "INBOUND"
    ? message.customer?.name || message.customer?.phoneNumber || "Customer"
    : "You"

  return (
    <div
      className={cn(
        "flex items-start gap-2 px-3 py-2 bg-muted/50 border-l-4 border-primary rounded-r-md",
        className
      )}
    >
      <IconCornerDownRight className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
      
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-primary">
          Replying to {senderName}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {truncatedContent || "[Media]"}
        </div>
      </div>

      <button
        onClick={onCancel}
        className="p-0.5 hover:bg-muted rounded transition-colors flex-shrink-0"
        title="Cancel reply"
      >
        <IconX className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  )
}
