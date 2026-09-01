import { describe, expect, it } from 'vitest'

import * as messagesModule from './messages.js'

type InteractiveSchema = {
  safeParse: (value: unknown) =>
    | { success: true; data: unknown }
    | { success: false; error: { issues: Array<{ path: Array<string | number>; message: string }> } }
}

function getInteractiveSchema(): InteractiveSchema | undefined {
  return (messagesModule as { interactiveSchema?: InteractiveSchema }).interactiveSchema
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
      text: `Card body ${cardIndex}`,
    },
    action: {
      name: 'cta_url' as const,
      parameters: {
        display_text: `Visit ${cardIndex}`,
        url: `https://example.com/card-${cardIndex}`,
      },
    },
  }
}

function createQuickReplyCarouselCard(cardIndex: number, buttonCount = 2) {
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
      text: `Quick reply card ${cardIndex}`,
    },
    action: {
      buttons: Array.from({ length: buttonCount }, (_, buttonIndex) => ({
        type: 'quick_reply' as const,
        quick_reply: {
          id: `card-${cardIndex}-button-${buttonIndex}`,
          title: `Option ${buttonIndex + 1}`,
        },
      })),
    },
  }
}

describe('public WhatsApp message validation', () => {
  it('accepts carousel messages with URL cards', () => {
    const interactiveSchema = getInteractiveSchema()

    expect(interactiveSchema).toBeDefined()

    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [createUrlCarouselCard(0), createUrlCarouselCard(1)],
      },
    })

    expect(result?.success).toBe(true)
  })

  it('accepts carousel messages with quick reply cards', () => {
    const interactiveSchema = getInteractiveSchema()

    expect(interactiveSchema).toBeDefined()

    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [createQuickReplyCarouselCard(0), createQuickReplyCarouselCard(1)],
      },
    })

    expect(result?.success).toBe(true)
  })

  it('rejects carousel body text longer than 1024 characters', () => {
    const interactiveSchema = getInteractiveSchema()
    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'x'.repeat(1025) },
      action: {
        cards: [createUrlCarouselCard(0), createUrlCarouselCard(1)],
      },
    })

    expect(result?.success).toBe(false)
    expect(result && !result.success ? result.error.issues[0]?.path.join('.') : '').toContain('body.text')
  })

  it('rejects carousel messages without a main body', () => {
    const interactiveSchema = getInteractiveSchema()
    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      action: {
        cards: [createUrlCarouselCard(0), createUrlCarouselCard(1)],
      },
    })

    expect(result?.success).toBe(false)
  })

  it('rejects carousel card counts outside 2 to 10', () => {
    const interactiveSchema = getInteractiveSchema()
    const tooFewCards = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [createUrlCarouselCard(0)],
      },
    })
    const tooManyCards = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: Array.from({ length: 11 }, (_, index) => createUrlCarouselCard(index)),
      },
    })

    expect(tooFewCards?.success).toBe(false)
    expect(tooManyCards?.success).toBe(false)
  })

  it('rejects carousel cards with mismatched header media objects', () => {
    const interactiveSchema = getInteractiveSchema()
    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [
          {
            ...createUrlCarouselCard(0),
            header: {
              type: 'image',
              video: {
                link: 'https://example.com/not-allowed.mp4',
              },
            },
          },
          createUrlCarouselCard(1),
        ],
      },
    })

    expect(result?.success).toBe(false)
  })

  it('rejects carousel card body text longer than 160 characters', () => {
    const interactiveSchema = getInteractiveSchema()
    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [
          {
            ...createUrlCarouselCard(0),
            body: {
              text: 'x'.repeat(161),
            },
          },
          createUrlCarouselCard(1),
        ],
      },
    })

    expect(result?.success).toBe(false)
  })

  it('rejects carousel messages with mixed card button modes', () => {
    const interactiveSchema = getInteractiveSchema()
    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [createUrlCarouselCard(0), createQuickReplyCarouselCard(1)],
      },
    })

    expect(result?.success).toBe(false)
  })

  it('rejects quick reply carousels when cards have different button counts', () => {
    const interactiveSchema = getInteractiveSchema()
    const result = interactiveSchema?.safeParse({
      type: 'carousel',
      body: { text: 'Carousel body' },
      action: {
        cards: [createQuickReplyCarouselCard(0, 1), createQuickReplyCarouselCard(1, 2)],
      },
    })

    expect(result?.success).toBe(false)
  })
})
