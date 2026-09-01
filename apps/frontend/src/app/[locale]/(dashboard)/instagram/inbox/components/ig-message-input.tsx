"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Image, Heart, Loader2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { instagramApi } from "@/lib/api/instagram"
import { useToast } from "@/hooks/use-toast"

interface Props {
  onSendMessage: (data: { type: "text" | "image" | "video" | "audio" | "sticker"; text?: string; mediaUrl?: string }) => Promise<boolean>
  sending: boolean
  disabled?: boolean
}

export function IGMessageInput({ onSendMessage, sending, disabled }: Props) {
  const [text, setText] = useState("")
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Auto-focus on mount
  useEffect(() => {
    if (!disabled) {
      requestAnimationFrame(() => {
        textareaRef.current?.focus()
      })
    }
  }, [disabled])

  const handleSend = async () => {
    if (!text.trim() || sending || disabled) return

    const success = await onSendMessage({ type: "text", text: text.trim() })
    if (success) {
      setText("")
      textareaRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSendSticker = async () => {
    if (sending || disabled) return
    await onSendMessage({ type: "sticker" })
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || disabled || uploading) return

    // Validate file size (8MB for images, 25MB for video/audio per Instagram limits)
    const maxSize = file.type.startsWith("image/") ? 8 * 1024 * 1024 : 25 * 1024 * 1024
    if (file.size > maxSize) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: `Maximum size is ${file.type.startsWith("image/") ? "8MB" : "25MB"}`,
      })
      return
    }

    // Determine type
    let type: "image" | "video" | "audio" = "image"
    if (file.type.startsWith("video/")) type = "video"
    else if (file.type.startsWith("audio/")) type = "audio"

    try {
      setUploading(true)
      
      // Upload file to server first
      const uploadResult = await instagramApi.uploadMedia(file)
      
      // Send message with uploaded URL
      await onSendMessage({ type, mediaUrl: uploadResult.url })
      
      toast({
        title: "Media sent",
        description: `${type.charAt(0).toUpperCase() + type.slice(1)} sent successfully`,
      })
    } catch (error: any) {
      console.error("Failed to upload media:", error)
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: error.message || "Failed to upload media",
      })
    } finally {
      setUploading(false)
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = ""
      }
    }
  }

  const isLoading = sending || uploading

  return (
    <div className="p-4">
      {disabled && (
        <div className="mb-2 text-center">
          <p className="text-xs text-amber-600">
            Messaging window closed. You cannot send messages until the user messages you again.
          </p>
        </div>
      )}

      {uploading && (
        <div className="mb-2 text-center">
          <p className="text-xs text-blue-600 flex items-center justify-center gap-2">
            <Loader2 className="h-3 w-3 animate-spin" />
            Uploading media...
          </p>
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Media button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                disabled={disabled || isLoading}
                className="h-10 w-10 p-0 flex-shrink-0"
              >
                {uploading ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <Image className="h-5 w-5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send image/video</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*,audio/*"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Heart sticker button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSendSticker}
                disabled={disabled || isLoading}
                className="h-10 w-10 p-0 flex-shrink-0"
              >
                <Heart className="h-5 w-5 text-pink-500" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send ❤️</TooltipContent>
          </Tooltip>
        </TooltipProvider>

{/* Text input */}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={disabled ? "Messaging window closed" : "Type a message..."}
          disabled={disabled || isLoading}
          className="min-h-[40px] max-h-[120px] resize-none"
          rows={1}
          autoFocus
        />

        {/* Send button */}
        <Button
          onClick={handleSend}
          disabled={!text.trim() || isLoading || disabled}
          className="h-10 w-10 p-0 flex-shrink-0 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
        >
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-2 text-center">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  )
}
