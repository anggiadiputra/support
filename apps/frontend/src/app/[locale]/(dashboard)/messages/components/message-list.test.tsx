import React, { createRef } from "react"
import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MessageList } from "./message-list"

globalThis.React = React

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("./media-preview", () => ({
  MediaPreview: ({ mediaUrl, mediaType, caption }: { mediaUrl?: string | null; mediaType: string; caption?: string }) => (
    <div data-testid={`media-preview-${mediaType}`}>
      {mediaUrl}
      {caption ? ` ${caption}` : ""}
    </div>
  ),
}))

vi.mock("./message-hover-actions", () => ({
  MessageHoverActions: () => null,
}))

vi.mock("@/components/waba/waba-error-dialog", () => ({
  WABAErrorDialog: () => null,
}))

vi.mock("../../broadcast/utils/error-categorizer", () => ({
  getErrorInfo: () => ({
    code: null,
    message: "",
    recoveryAction: "",
  }),
}))

function renderMessageList(messageOverrides: Record<string, unknown>) {
  const scrollRef = createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement>
  const containerRef = createRef<HTMLDivElement>() as React.RefObject<HTMLDivElement>

  render(
    <MessageList
      messages={[
        {
          id: "msg-1",
          userId: "user-1",
          customerId: "customer-1",
          direction: "OUTBOUND",
          type: "interactive",
          messageType: "interactive",
          content: "Carousel message",
          status: "SENT",
          timestamp: "2026-04-10T10:00:00.000Z",
          source: "API",
          ...messageOverrides,
        },
      ]}
      currentUserId="user-1"
      scrollRef={scrollRef}
      containerRef={containerRef}
      onScroll={() => {}}
    />,
  )
}

describe("MessageList interactive carousel rendering", () => {
  it("renders URL carousel cards with media and links", () => {
    renderMessageList({
      interactive: {
        type: "carousel",
        body: { text: "Featured picks" },
        action: {
          cards: [
            {
              card_index: 0,
              type: "cta_url",
              header: {
                type: "image",
                image: { link: "https://example.com/card-1.jpg" },
              },
              body: { text: "Card one body" },
              action: {
                name: "cta_url",
                parameters: {
                  display_text: "Open card 1",
                  url: "https://example.com/card-1",
                },
              },
            },
            {
              card_index: 1,
              type: "cta_url",
              header: {
                type: "image",
                image: { link: "https://example.com/card-2.jpg" },
              },
              body: { text: "Card two body" },
              action: {
                name: "cta_url",
                parameters: {
                  display_text: "Open card 2",
                  url: "https://example.com/card-2",
                },
              },
            },
          ],
        },
      },
    })

    expect(screen.getByText("Featured picks")).toBeInTheDocument()
    expect(screen.getByText("Card one body")).toBeInTheDocument()
    expect(screen.getByText("Card two body")).toBeInTheDocument()
    expect(screen.getByText("https://example.com/card-1.jpg")).toBeInTheDocument()
    expect(screen.getByText("https://example.com/card-2.jpg")).toBeInTheDocument()
    expect(screen.getByRole("link", { name: "Open card 1" })).toHaveAttribute("href", "https://example.com/card-1")
    expect(screen.getByRole("link", { name: "Open card 2" })).toHaveAttribute("href", "https://example.com/card-2")
  })

  it("renders quick-reply carousel cards with button chips", () => {
    renderMessageList({
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
              body: { text: "Card A body" },
              action: {
                buttons: [
                  {
                    type: "quick_reply",
                    quick_reply: { id: "buy", title: "Buy now" },
                  },
                  {
                    type: "quick_reply",
                    quick_reply: { id: "later", title: "Later" },
                  },
                ],
              },
            },
            {
              card_index: 1,
              type: "cta_url",
              header: {
                type: "image",
                image: { link: "https://example.com/card-b.jpg" },
              },
              action: {
                buttons: [
                  {
                    type: "quick_reply",
                    quick_reply: { id: "buy-2", title: "Buy now" },
                  },
                  {
                    type: "quick_reply",
                    quick_reply: { id: "later-2", title: "Later" },
                  },
                ],
              },
            },
          ],
        },
      },
    })

    expect(screen.getByText("Choose a card")).toBeInTheDocument()
    expect(screen.getByText("Card A body")).toBeInTheDocument()
    expect(screen.getByText("https://example.com/card-a.jpg")).toBeInTheDocument()
    expect(screen.getByText("https://example.com/card-b.jpg")).toBeInTheDocument()
    expect(screen.getAllByText("Buy now")).toHaveLength(2)
    expect(screen.getAllByText("Later")).toHaveLength(2)
  })
})
