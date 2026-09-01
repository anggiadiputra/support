"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Heart, Check, CheckCheck, AlertCircle, Clock, RotateCcw, Info } from "lucide-react"
import type { IGMessage } from "@/lib/api/instagram"
import { format } from "date-fns"
import { MediaPreview, MediaType } from "@/app/[locale]/(dashboard)/messages/components/media-preview"
import { WABAErrorDialog } from "@/components/waba/waba-error-dialog"

interface Props {
  message: IGMessage
  onReact: () => void
  onRetry?: (message: IGMessage) => void
}

// Map Instagram message types to MediaPreview types
function getMediaType(messageType: string): MediaType | null {
  switch (messageType) {
    case "IMAGE":
      return "image"
    case "VIDEO":
      return "video"
    case "AUDIO":
      return "audio"
    default:
      return null
  }
}

export function IGMessageBubble({ message, onReact, onRetry }: Props) {
  const [showErrorDialog, setShowErrorDialog] = useState(false)
  const isOutbound = message.direction === "OUTBOUND"
  const isMedia = ["IMAGE", "VIDEO", "AUDIO"].includes(message.messageType)
  const isSticker = message.messageType === "STICKER"
  const isStoryReply = message.messageType === "STORY_REPLY"
  const isStoryMention = message.messageType === "STORY_MENTION"
  const isPending = message.status === "PENDING"
  const isFailed = message.status === "FAILED"

  // Extract error code from errorMessage if present (e.g., "(#131031)")
  const extractErrorCode = (errorMsg: string | null | undefined): number | null => {
    if (!errorMsg) return null
    const match = errorMsg.match(/\(#(\d+)\)/)
    return match ? parseInt(match[1], 10) : null
  }
  const errorCode = extractErrorCode(message.errorMessage)

  const renderStatus = () => {
    if (!isOutbound) return null

    switch (message.status) {
      case "PENDING":
        return (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-white/70 animate-pulse" />
          </span>
        )
      case "SENT":
        return <Check className="h-3 w-3 text-white/70" />
      case "DELIVERED":
        return <CheckCheck className="h-3 w-3 text-white/70" />
      case "READ":
        return <CheckCheck className="h-3 w-3 text-blue-300" />
      case "FAILED":
        return (
          <span className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3 text-red-300" />
          </span>
        )
      default:
        return null
    }
  }

  const renderContent = () => {
    // Heart sticker
    if (isSticker) {
      return <span className="text-4xl">❤️</span>
    }

    // Story reply/mention
    if (isStoryReply || isStoryMention) {
      return (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground italic">
            {isStoryReply ? "Replied to your story" : "Mentioned you in their story"}
          </p>
          {message.text && <p>{message.text}</p>}
        </div>
      )
    }

    // Media message - use MediaPreview component for consistency
    if (isMedia && message.mediaUrl) {
      const mediaType = getMediaType(message.messageType)
      if (mediaType) {
        return (
          <MediaPreview
            mediaUrl={message.mediaUrl}
            mediaType={mediaType}
            caption={message.text || undefined}
            isOutbound={isOutbound}
          />
        )
      }
    }

    // Text message
    return <p className="whitespace-pre-wrap break-words break-all">{message.text}</p>
  }

  return (
    <div
      className={cn(
        "flex mb-3 group",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div className="flex items-end gap-1 max-w-[75%]">
        {/* React button (for inbound messages) */}
        {!isOutbound && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onReact}
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
            title="React with ❤️"
          >
            <Heart className="h-3 w-3" />
          </Button>
        )}

        <div
          className={cn(
            "px-4 py-2 rounded-2xl transition-opacity",
            isOutbound
              ? "bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-br-md"
              : "bg-muted rounded-bl-md",
            isSticker && "bg-transparent px-2 py-1",
            isPending && "opacity-70",
            isFailed && "from-red-500/50 to-red-600/50 border border-red-500/50"
          )}
        >
          {renderContent()}

          {/* Reaction indicator */}
          {message.reaction && (
            <div className="flex justify-end mt-1">
              <span className="text-sm">❤️</span>
            </div>
          )}

          {/* Timestamp and status */}
          <div
            className={cn(
              "flex items-center gap-1 mt-1",
              isOutbound ? "justify-end" : "justify-start"
            )}
          >
            <span
              className={cn(
                "text-xs",
                isOutbound ? "text-white/70" : "text-muted-foreground"
              )}
            >
              {format(new Date(message.timestamp), "HH:mm")}
            </span>
            {renderStatus()}
          </div>

          {/* Error message and retry button */}
          {isFailed && (
            <div className="mt-1 space-y-1">
              {message.errorMessage && (
                <p className="text-xs text-red-200">{message.errorMessage}</p>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowErrorDialog(true)}
                  className="flex items-center gap-1 text-xs text-red-200 hover:text-white transition-colors"
                >
                  <Info className="h-3 w-3" />
                  Lihat Detail
                </button>
                {onRetry && (
                  <button
                    onClick={() => onRetry(message)}
                    className="flex items-center gap-1 text-xs text-red-200 hover:text-white transition-colors"
                  >
                    <RotateCcw className="h-3 w-3" />
                    Coba Lagi
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <WABAErrorDialog
        open={showErrorDialog}
        onOpenChange={setShowErrorDialog}
        errorCode={errorCode}
        errorMessage={message.errorMessage}
      />
    </div>
  )
}
