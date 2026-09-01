import { useRef, useCallback } from "react"
import { messengerApi } from "@/lib/api/messenger"

/**
 * Hook to send typing indicator for Messenger conversations
 * - Sends max 1 request per 3 seconds (debounce)
 * - Fire-and-forget, non-blocking
 * - Silent fail - non-critical feature
 */
export function useMessengerTyping(conversationId: string | undefined) {
  const lastSentRef = useRef<number>(0)
  const DEBOUNCE_MS = 3000

  const sendTyping = useCallback(() => {
    if (!conversationId) return

    const now = Date.now()

    // Check if enough time has passed since last send
    if (now - lastSentRef.current < DEBOUNCE_MS) {
      return
    }

    lastSentRef.current = now

    // Fire-and-forget - don't await, don't block UI
    messengerApi.sendTypingIndicator(conversationId).catch(() => {
      // Silent fail - non-critical feature
    })
  }, [conversationId])

  return { sendTyping }
}
