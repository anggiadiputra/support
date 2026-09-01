/**
 * useMessengerMessaging Hook
 * Handles Messenger message sending with optimistic UI updates
 */

import { useState, useCallback } from "react"
import { messengerApi, MessengerApiError, type MessengerMessage } from "@/lib/api/messenger"
import { useToast } from "@/hooks/use-toast"
import type { UnifiedConversation, MessengerConversation } from "./unified-inbox-types"

interface UseMessengerMessagingOptions {
  selectedConversation: UnifiedConversation | null
}

export function useMessengerMessaging({
  selectedConversation,
}: UseMessengerMessagingOptions) {
  const { toast } = useToast()

  // Messenger specific state
  const [msgMessages, setMsgMessages] = useState<MessengerMessage[]>([])
  const [messengerConnected, setMessengerConnected] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)

  // Messenger message sending with Optimistic UI
  const sendMessengerMessage = useCallback(async (data: {
    type: "text" | "image" | "video" | "audio" | "file"
    text?: string
    mediaUrl?: string
  }) => {
    if (!selectedConversation || selectedConversation.channel !== "messenger") return false

    const msgConversation = selectedConversation.originalData as MessengerConversation

    if (!msgConversation.isWindowActive) {
      toast({
        variant: "destructive",
        title: "Messaging Window Closed",
        description: "You can only reply within 24 hours of receiving a message from this user.",
      })
      return false
    }

    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create optimistic message (appears immediately)
    const optimisticMessage: MessengerMessage = {
      id: tempId,
      mid: null,
      direction: "OUTBOUND",
      messageType: data.type.toUpperCase() as MessengerMessage["messageType"],
      text: data.text || null,
      mediaUrl: data.mediaUrl || null,
      mediaType: data.type !== "text" ? data.type : null,
      fileName: null,
      stickerUrl: null,
      quickReplyPayload: null,
      status: "PENDING", // Shows as "sending..."
      errorCode: null,
      errorMessage: null,
      reaction: null,
      readAt: null,
      deliveredAt: null,
      timestamp: new Date().toISOString(),
    }

    // Add optimistic message to UI immediately
    setMsgMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)
      const response = await messengerApi.sendMessage(msgConversation.id, data)

      // Update optimistic message with real data (SENT status)
      setMsgMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              id: response.id,
              mid: response.mid,
              status: "SENT" as const,
            }
          : msg
      ))

      return true
    } catch (error: any) {
      console.error("Failed to send Messenger message:", error)
      
      // Update optimistic message to FAILED status
      setMsgMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              status: "FAILED" as const,
              errorMessage: error instanceof MessengerApiError 
                ? error.getUserFriendlyMessage() 
                : (error.message || "Failed to send"),
            }
          : msg
      ))
      
      // Use user-friendly error message from MessengerApiError
      let errorMessage = "Failed to send message"
      let errorTitle = "Error"
      
      if (error instanceof MessengerApiError) {
        errorMessage = error.getUserFriendlyMessage()
        if (error.code === 'MESSENGER_WINDOW_CLOSED' || error.code === 'WindowClosed') {
          errorTitle = "Messaging Window Closed"
        } else if (error.code === 'MESSENGER_RATE_LIMITED') {
          errorTitle = "Rate Limited"
        } else if (error.code === 'MESSENGER_INVALID_TOKEN') {
          errorTitle = "Authentication Error"
        }
      } else if (error.message) {
        errorMessage = error.message
      }
      
      toast({
        variant: "destructive",
        title: errorTitle,
        description: errorMessage,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, toast])

  return {
    // State
    msgMessages,
    setMsgMessages,
    messengerConnected,
    setMessengerConnected,
    sending,
    // Actions
    sendMessengerMessage,
  }
}
