"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Send, Image, Paperclip, Loader2 } from "lucide-react"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { messengerApi } from "@/lib/api/messenger"
import { useToast } from "@/hooks/use-toast"
import { useMessengerTyping } from "@/hooks/use-messenger-typing"

interface Props {
  onSendMessage: (data: { type: "text" | "image" | "video" | "audio" | "file"; text?: string; mediaUrl?: string }) => Promise<boolean>
  sending: boolean
  disabled?: boolean
  conversationId?: string
}

export function MessengerMessageInput({ onSendMessage, sending, disabled, conversationId }: Props) {
  const [text, setText] = useState("")
  const [uploading, setUploading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { toast } = useToast()

  // Typing indicator - sends to customer when agent types
  const { sendTyping } = useMessengerTyping(conversationId)

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || disabled || uploading) return

    // Validate file size (25MB max for Messenger)
    const maxSize = 25 * 1024 * 1024
    if (file.size > maxSize) {
      toast({
        variant: "destructive",
        title: "File too large",
        description: "Maximum file size is 25MB",
      })
      return
    }

    // Determine type based on MIME type
    let type: "image" | "video" | "audio" | "file" = "file"
    if (file.type.startsWith("image/")) type = "image"
    else if (file.type.startsWith("video/")) type = "video"
    else if (file.type.startsWith("audio/")) type = "audio"

    try {
      setUploading(true)
      
      // Upload file to server first
      const uploadResult = await messengerApi.uploadMedia(file)
      
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
        {/* Image button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "image/*,video/*,audio/*"
                    fileInputRef.current.click()
                  }
                }}
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
            <TooltipContent>Send image/video/audio</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        {/* File button */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (fileInputRef.current) {
                    fileInputRef.current.accept = "*/*"
                    fileInputRef.current.click()
                  }
                }}
                disabled={disabled || isLoading}
                className="h-10 w-10 p-0 flex-shrink-0"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Send file</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <input
          ref={fileInputRef}
          type="file"
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Text input */}
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            // Send typing indicator to customer (debounced, fire-and-forget)
            if (e.target.value.trim()) {
              sendTyping()
            }
          }}
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
          className="h-10 w-10 p-0 flex-shrink-0 bg-blue-500 hover:bg-blue-600"
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
