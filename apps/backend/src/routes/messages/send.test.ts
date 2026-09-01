import { describe, expect, it } from 'vitest'

import * as sendModule from './send.js'

type SendMessageSchema = {
  safeParse: (value: unknown) =>
    | { success: true; data: { interactive?: unknown } }
    | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } }
}

type CarouselValidator = (interactive: unknown) => {
  success: boolean
  data?: unknown
  error?: { issues: Array<{ path: Array<string | number>; message: string }> }
}

type HistoryFormatter = (interactive: unknown) => {
  content: string
  mediaUrl: string | null
}

function getSendMessageSchema(): SendMessageSchema | undefined {
  return (sendModule as { sendMessageSchema?: SendMessageSchema }).sendMessageSchema
}

function getCarouselValidator(): CarouselValidator | undefined {
  return (sendModule as { validateWhatsAppInteractiveForSend?: CarouselValidator }).validateWhatsAppInteractiveForSend
}

function getHistoryFormatter(): HistoryFormatter | undefined {
  return (sendModule as { formatWhatsAppInteractiveForHistory?: HistoryFormatter }).formatWhatsAppInteractiveForHistory
}

function createUrlCarouselCard(cardIndex: number) {
  return {
    card_index: cardIndex,
    type: 'cta_url' as const,
    header: {
      type: 'image' as const,
      image: {
        link: `https://example.com/card-${cardIndex}.jpg`,
      },
    },
    body: {
      text: `Card body ${cardIndex + 1}`,
    },
    action: {
      name: 'cta_url' as const,
      parameters: {
        display_text: `Visit ${cardIndex + 1}`,
        url: `https://example.com/card-${cardIndex + 1}`,
      },
    },
  }
}

function createQuickReplyCarouselCard(cardIndex: number) {
  return {
    card_index: cardIndex,
    type: 'cta_url' as const,
    header: {
      type: 'video' as const,
      video: {
        link: `https://example.com/card-${cardIndex}.mp4`,
      },
    },
    body: {
      text: `Quick reply card ${cardIndex + 1}`,
    },
    action: {
      buttons: [
        {
          type: 'quick_reply' as const,
          quick_reply: {
            id: `card-${cardIndex}-button-0`,
            title: 'Option 1',
          },
        },
      ],
    },
  }
}

describe('internal WhatsApp send route', () => {
  it('accepts carousel payloads and forwards them to WhatsApp API', () => {
    const schema = getSendMessageSchema()
    const validateInteractive = getCarouselValidator()

    expect(schema).toBeDefined()
    expect(validateInteractive).toBeDefined()

    const payload = {
      customerId: 'customer-123',
      type: 'interactive' as const,
      interactive: {
        type: 'carousel' as const,
        body: { text: 'Main carousel body' },
        action: {
          cards: [createUrlCarouselCard(0), createUrlCarouselCard(1)],
        },
      },
    }

    const parsed = schema?.safeParse(payload)

    expect(parsed?.success).toBe(true)

    if (!parsed || !parsed.success) {
      return
    }

    const validationResult = validateInteractive?.(parsed.data.interactive)

    expect(validationResult?.success).toBe(true)
    expect(validationResult?.data).toEqual(payload.interactive)
  })

  it('rejects invalid carousel payloads before sending to WhatsApp API', () => {
    const validateInteractive = getCarouselValidator()

    expect(validateInteractive).toBeDefined()

    const validationResult = validateInteractive?.({
      type: 'carousel',
      body: { text: 'Main carousel body' },
      action: {
        cards: [createUrlCarouselCard(0), createQuickReplyCarouselCard(1)],
      },
    })

    expect(validationResult?.success).toBe(false)
    expect(validationResult?.error?.issues[0]?.message).toContain('same action shape')
  })

  it('rejects carousel payloads that include a footer', () => {
    const validateInteractive = getCarouselValidator()

    expect(validateInteractive).toBeDefined()

    const validationResult = validateInteractive?.({
      type: 'carousel',
      body: { text: 'Main carousel body' },
      footer: { text: 'Not allowed' },
      action: {
        cards: [createUrlCarouselCard(0), createUrlCarouselCard(1)],
      },
    })

    expect(validationResult?.success).toBe(false)
  })

  it('rejects list payloads without sections', () => {
    const validateInteractive = getCarouselValidator()

    expect(validateInteractive).toBeDefined()

    const validationResult = validateInteractive?.({
      type: 'list',
      body: { text: 'Pick one' },
      action: {
        button: 'View options',
        sections: [],
      },
    })

    expect(validationResult?.success).toBe(false)
  })

  it('formats carousel content summary for stored chat history', () => {
    const formatHistory = getHistoryFormatter()

    expect(formatHistory).toBeDefined()

    const urlModeResult = formatHistory?.({
      type: 'carousel',
      body: { text: 'Main carousel body' },
      action: {
        cards: [createUrlCarouselCard(0), createUrlCarouselCard(1)],
      },
    })

    expect(urlModeResult).toEqual({
      content: 'Main carousel body\n🎠 Carousel\n- Card 1: Card body 1\n- Card 2: Card body 2',
      mediaUrl: 'https://example.com/card-1',
    })

    const quickReplyResult = formatHistory?.({
      type: 'carousel',
      body: { text: 'Quick replies' },
      action: {
        cards: [createQuickReplyCarouselCard(0), createQuickReplyCarouselCard(1)],
      },
    })

    expect(quickReplyResult?.content).toContain('Quick replies')
    expect(quickReplyResult?.content).toContain('Quick reply card 1')
    expect(quickReplyResult?.mediaUrl).toBeNull()
  })
})
