import { useRef, useCallback } from "react"
import { messagesApi } from "@/lib/api/messages-api"

/**
 * Hook to send typing indicator to customer with debounce
 * - Sends max 1 request per 3 seconds (matches backend rate limit)
 * - Fire-and-forget, non-blocking
 * - Silent fail - non-critical feature
 */
export function useTypingIndicator(
  customerId: string | undefined,
  channel?: "whatsapp" | "instagram"
) {
  const lastSentRef = useRef<number>(0)
  const DEBOUNCE_MS = 3000 // Match backend rate limit

  const sendTyping = useCallback(() => {
    if (!customerId) return

    const now = Date.now()

    // Check if enough time has passed since last send
    if (now - lastSentRef.current < DEBOUNCE_MS) {
      return
    }

    lastSentRef.current = now

    // Fire-and-forget - don't await, don't block UI
    messagesApi.sendTypingIndicator(customerId, channel)
  }, [customerId, channel])

  return { sendTyping }
}
