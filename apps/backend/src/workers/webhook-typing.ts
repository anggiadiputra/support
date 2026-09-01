export interface WhatsAppTypingClient {
  markAsRead(phoneNumberId: string, messageId: string, showTyping?: boolean): Promise<unknown>
}

export async function sendWhatsAppTypingIndicator(
  whatsapp: WhatsAppTypingClient,
  phoneNumberId: string | null | undefined,
  messageId: string | null | undefined
): Promise<void> {
  if (!phoneNumberId || !messageId) {
    return
  }

  await whatsapp.markAsRead(phoneNumberId, messageId, true)
}

export async function runAfterWhatsAppTypingDelay<T>(
  whatsapp: WhatsAppTypingClient,
  phoneNumberId: string | null | undefined,
  messageId: string | null | undefined,
  callback: () => Promise<T>,
  delayMs = 2000
): Promise<T> {
  const result = await callback()

  if (!result) {
    return result
  }

  try {
    await sendWhatsAppTypingIndicator(whatsapp, phoneNumberId, messageId)
  } catch {
    // Typing is best-effort; AI reply should still continue.
  }

  await new Promise((resolve) => setTimeout(resolve, delayMs))

  return result
}
