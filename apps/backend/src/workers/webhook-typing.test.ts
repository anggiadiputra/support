import { describe, expect, it, vi } from 'vitest'

import { runAfterWhatsAppTypingDelay } from './webhook-typing.js'

describe('runAfterWhatsAppTypingDelay', () => {
  it('does not send read receipt or typing when callback returns null', async () => {
    const markAsRead = vi.fn().mockResolvedValue(undefined)

    const result = await runAfterWhatsAppTypingDelay(
      { markAsRead },
      'phone-number-id',
      'message-id',
      async () => null,
      0
    )

    expect(result).toBeNull()
    expect(markAsRead).not.toHaveBeenCalled()
  })

  it('sends read receipt and typing when callback returns a reply', async () => {
    const markAsRead = vi.fn().mockResolvedValue(undefined)

    const result = await runAfterWhatsAppTypingDelay(
      { markAsRead },
      'phone-number-id',
      'message-id',
      async () => 'AI reply',
      0
    )

    expect(result).toBe('AI reply')
    expect(markAsRead).toHaveBeenCalledWith('phone-number-id', 'message-id', true)
    expect(markAsRead).toHaveBeenCalledTimes(1)
  })
})
