import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { messagesApi } from "@/lib/api/messages-api"

import { useWhatsAppMessaging } from "./use-whatsapp-messaging"

const mockToast = vi.fn()

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}))

vi.mock("@/lib/api/messages-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/messages-api")>(
    "@/lib/api/messages-api"
  )

  return {
    ...actual,
    messagesApi: {
      ...actual.messagesApi,
      sendMessage: vi.fn(),
    },
  }
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void

  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })

  return { promise, resolve, reject }
}

function createSelectedConversation() {
  return {
    channel: "whatsapp",
    originalData: {
      id: "customer-1",
      phoneNumber: "+628123456789",
      name: "Test Customer",
    },
  } as any
}

describe("useWhatsAppMessaging", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("builds a carousel payload with URL cards", async () => {
    const deferred = createDeferred<{ id: string; waMessageId: string }>()
    const sendMessageMock = vi.mocked(messagesApi.sendMessage)
    sendMessageMock.mockReturnValueOnce(deferred.promise as ReturnType<typeof messagesApi.sendMessage>)

    const { result } = renderHook(() =>
      useWhatsAppMessaging({
        userId: "user-1",
        selectedConversation: createSelectedConversation(),
        waWindowStatus: { isActive: true } as any,
        loadConversations: vi.fn(),
      })
    )

    const sendWhatsAppCarousel = (result.current as any).sendWhatsAppCarousel

    expect(sendWhatsAppCarousel).toBeTypeOf("function")

    if (typeof sendWhatsAppCarousel !== "function") {
      return
    }

    let sendPromise!: Promise<boolean | "WINDOW_EXPIRED">

    await act(async () => {
      sendPromise = sendWhatsAppCarousel({
        bodyText: "Carousel headline",
        cards: [
          {
            mediaType: "image",
            mediaUrl: "https://example.com/card-1.jpg",
            bodyText: "Card one",
            buttonLabel: "Open one",
            buttonUrl: "https://example.com/one",
          },
          {
            mediaType: "video",
            mediaUrl: "https://example.com/card-2.mp4",
            bodyText: "Card two",
            buttonLabel: "Open two",
            buttonUrl: "https://example.com/two",
          },
        ],
      })
    })

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith({
        userId: "user-1",
        customerId: "customer-1",
        phoneNumber: "+628123456789",
        type: "interactive",
        interactive: {
          type: "carousel",
          body: { text: "Carousel headline" },
          action: {
            cards: [
              {
                card_index: 0,
                type: "cta_url",
                header: {
                  type: "image",
                  image: { link: "https://example.com/card-1.jpg" },
                },
                body: { text: "Card one" },
                action: {
                  name: "cta_url",
                  parameters: {
                    display_text: "Open one",
                    url: "https://example.com/one",
                  },
                },
              },
              {
                card_index: 1,
                type: "cta_url",
                header: {
                  type: "video",
                  video: { link: "https://example.com/card-2.mp4" },
                },
                body: { text: "Card two" },
                action: {
                  name: "cta_url",
                  parameters: {
                    display_text: "Open two",
                    url: "https://example.com/two",
                  },
                },
              },
            ],
          },
        },
      })
    })

    expect(result.current.waMessages).toHaveLength(1)
    expect(result.current.waMessages[0]?.type).toBe("interactive")
    expect(result.current.waMessages[0]?.content).toBe("Carousel headline")
    expect(result.current.waMessages[0]?.status).toBe("PENDING")
    expect((result.current.waMessages[0] as any)?.interactive?.type).toBe("carousel")
    expect((result.current.waMessages[0] as any)?.interactive?.action?.cards?.[0]?.action).toEqual({
      name: "cta_url",
      parameters: {
        display_text: "Open one",
        url: "https://example.com/one",
      },
    })

    await act(async () => {
      deferred.resolve({ id: "message-1", waMessageId: "wam-1" })
      await sendPromise
    })

    expect(await sendPromise).toBe(true)
    expect(result.current.waMessages[0]?.id).toBe("message-1")
    expect(result.current.waMessages[0]?.waMessageId).toBe("wam-1")
    expect(result.current.waMessages[0]?.status).toBe("SENT")
  })

  it("builds a carousel payload with quick reply cards", async () => {
    const sendMessageMock = vi.mocked(messagesApi.sendMessage)
    sendMessageMock.mockResolvedValueOnce({ id: "message-2", waMessageId: "wam-2" } as any)

    const { result } = renderHook(() =>
      useWhatsAppMessaging({
        userId: "user-1",
        selectedConversation: createSelectedConversation(),
        waWindowStatus: { isActive: true } as any,
        loadConversations: vi.fn(),
      })
    )

    const sendWhatsAppCarousel = (result.current as any).sendWhatsAppCarousel

    expect(sendWhatsAppCarousel).toBeTypeOf("function")

    if (typeof sendWhatsAppCarousel !== "function") {
      return
    }

    await act(async () => {
      await sendWhatsAppCarousel({
        bodyText: "Choose a card",
        cards: [
          {
            mediaType: "image",
            mediaUrl: "https://example.com/card-a.jpg",
            bodyText: "Card A",
            buttons: [
              { id: "a-1", title: "Yes" },
              { id: "a-2", title: "No" },
            ],
          },
          {
            mediaType: "video",
            mediaUrl: "https://example.com/card-b.mp4",
            bodyText: "Card B",
            buttons: [
              { id: "b-1", title: "Yes" },
              { id: "b-2", title: "No" },
            ],
          },
        ],
      })
    })

    expect(sendMessageMock).toHaveBeenCalledWith({
      userId: "user-1",
      customerId: "customer-1",
      phoneNumber: "+628123456789",
      type: "interactive",
      interactive: {
        type: "carousel",
        body: { text: "Choose a card" },
        action: {
          cards: [
            {
              card_index: 0,
              type: "cta_url",
              header: {
                type: "image",
                image: { link: "https://example.com/card-a.jpg" },
              },
              body: { text: "Card A" },
              action: {
                buttons: [
                  { type: "quick_reply", quick_reply: { id: "a-1", title: "Yes" } },
                  { type: "quick_reply", quick_reply: { id: "a-2", title: "No" } },
                ],
              },
            },
            {
              card_index: 1,
              type: "cta_url",
              header: {
                type: "video",
                video: { link: "https://example.com/card-b.mp4" },
              },
              body: { text: "Card B" },
              action: {
                buttons: [
                  { type: "quick_reply", quick_reply: { id: "b-1", title: "Yes" } },
                  { type: "quick_reply", quick_reply: { id: "b-2", title: "No" } },
                ],
              },
            },
          ],
        },
      },
    })

    expect(result.current.waMessages[0]?.type).toBe("interactive")
    expect(result.current.waMessages[0]?.content).toBe("Choose a card")
    expect(result.current.waMessages[0]?.status).toBe("SENT")
    expect((result.current.waMessages[0] as any)?.interactive?.type).toBe("carousel")
    expect((result.current.waMessages[0] as any)?.interactive?.action?.cards?.[0]?.action?.buttons).toEqual([
      { type: "quick_reply", quick_reply: { id: "a-1", title: "Yes" } },
      { type: "quick_reply", quick_reply: { id: "a-2", title: "No" } },
    ])
  })
})
