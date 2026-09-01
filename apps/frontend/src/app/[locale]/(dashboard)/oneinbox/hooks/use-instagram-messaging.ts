/**
 * useInstagramMessaging Hook
 * Handles Instagram message sending with optimistic UI updates
 */

import { useState, useCallback } from "react"
import { instagramApi, type IGMessage } from "@/lib/api/instagram"
import { useToast } from "@/hooks/use-toast"
import type { UnifiedConversation, IGConversation } from "./unified-inbox-types"

interface UseInstagramMessagingOptions {
  selectedConversation: UnifiedConversation | null
}

export function useInstagramMessaging({
  selectedConversation,
}: UseInstagramMessagingOptions) {
  const { toast } = useToast()

  // Instagram specific state
  const [igMessages, setIgMessages] = useState<IGMessage[]>([])
  const [instagramConnected, setInstagramConnected] = useState<boolean | null>(null)
  const [sending, setSending] = useState(false)

  // Instagram message sending with Optimistic UI
  const sendInstagramMessage = useCallback(async (data: {
    type: "text" | "image" | "video" | "audio" | "sticker"
    text?: string
    mediaUrl?: string
  }) => {
    if (!selectedConversation || selectedConversation.channel !== "instagram") return false

    const igConversation = selectedConversation.originalData as IGConversation

    if (!igConversation.isWindowActive) {
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
    const optimisticMessage: IGMessage = {
      id: tempId,
      igMessageId: null,
      direction: "OUTBOUND",
      messageType: data.type.toUpperCase() as IGMessage["messageType"],
      text: data.text || null,
      mediaUrl: data.mediaUrl || null,
      mediaType: data.type !== "text" ? data.type : null,
      storyId: null,
      sharedPostUrl: null,
      status: "PENDING", // Shows as "sending..."
      errorMessage: null,
      reaction: null,
      timestamp: new Date().toISOString(),
      readAt: null,
    }

    // Add optimistic message to UI immediately
    setIgMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)
      const response = await instagramApi.sendMessage(igConversation.id, data)

      // Update optimistic message with real data (SENT status)
      setIgMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              id: response.id || tempId,
              igMessageId: response.igMessageId || null,
              status: "SENT" as const,
            }
          : msg
      ))

      return true
    } catch (error: any) {
      console.error("Failed to send Instagram message:", error)
      
      // Update optimistic message to FAILED status
      setIgMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              status: "FAILED" as const,
              errorMessage: error.message || "Failed to send",
            }
          : msg
      ))
      
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send message",
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, toast])

  const sendInstagramReaction = useCallback(async (messageId: string) => {
    if (!selectedConversation || selectedConversation.channel !== "instagram") return

    const igConversation = selectedConversation.originalData as IGConversation
    try {
      await instagramApi.sendReaction(messageId, "love")
      const response = await instagramApi.getMessages(igConversation.id, { limit: 100 })
      setIgMessages(response.data || [])
    } catch (error: any) {
      console.error("Failed to send reaction:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to send reaction",
      })
    }
  }, [selectedConversation, toast])

  return {
    // State
    igMessages,
    setIgMessages,
    instagramConnected,
    setInstagramConnected,
    sending,
    // Actions
    sendInstagramMessage,
    sendInstagramReaction,
  }
}
