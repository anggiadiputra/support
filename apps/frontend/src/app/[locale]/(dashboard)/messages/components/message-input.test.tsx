import React from "react"
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { MessageInput } from "./message-input"

globalThis.React = React

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("@/hooks/use-typing-indicator", () => ({
  useTypingIndicator: () => ({ sendTyping: vi.fn() }),
}))

describe("MessageInput carousel composer", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  function renderMessageInput(overrides: Record<string, unknown> = {}) {
    const onSendCarousel = vi.fn().mockResolvedValue(true)

    render(
      <MessageInput
        onSendMessage={vi.fn().mockResolvedValue(true)}
        onSendTemplate={vi.fn().mockResolvedValue(true)}
        onSendCta={vi.fn().mockResolvedValue(true)}
        onSendReplyButtons={vi.fn().mockResolvedValue(true)}
        onSendListMessage={vi.fn().mockResolvedValue(true)}
        onSendCarousel={onSendCarousel}
        onSendMedia={vi.fn().mockResolvedValue(true)}
        sending={false}
        uploading={false}
        templates={[]}
        windowStatus={{ isActive: true } as any}
        {...overrides}
      />
    )

    return { onSendCarousel }
  }

  async function openCarouselComposer() {
    fireEvent.pointerDown(screen.getByRole("button", { name: /attachments/i }))
    fireEvent.click(await screen.findByText("Carousel Message"))
    return await screen.findByRole("dialog")
  }

  it("shows a carousel composer action in the attachments menu", async () => {
    renderMessageInput()

    fireEvent.pointerDown(screen.getByRole("button", { name: /attachments/i }))

    expect(await screen.findByText("Carousel Message")).toBeInTheDocument()
  })

  it("disables submit until a URL carousel form is valid, then submits and resets on close", async () => {
    const { onSendCarousel } = renderMessageInput()

    const dialog = await openCarouselComposer()
    const sendButton = within(dialog).getByRole("button", { name: "Send Carousel Message" })

    expect(sendButton).toBeDisabled()

    fireEvent.change(within(dialog).getByLabelText("Carousel Body Text"), {
      target: { value: "Featured products" },
    })

    fireEvent.change(within(dialog).getByLabelText("Card 1 Media URL"), {
      target: { value: "https://example.com/card-1.jpg" },
    })
    fireEvent.change(within(dialog).getByLabelText("Card 1 Button Label"), {
      target: { value: "Open card 1" },
    })
    fireEvent.change(within(dialog).getByLabelText("Card 1 Button URL"), {
      target: { value: "https://example.com/card-1" },
    })

    fireEvent.change(within(dialog).getByLabelText("Card 2 Media URL"), {
      target: { value: "https://example.com/card-2.mp4" },
    })
    fireEvent.change(within(dialog).getByLabelText("Card 2 Button Label"), {
      target: { value: "Open card 2" },
    })
    fireEvent.change(within(dialog).getByLabelText("Card 2 Button URL"), {
      target: { value: "https://example.com/card-2" },
    })

    await waitFor(() => {
      expect(sendButton).toBeEnabled()
    })

    fireEvent.click(sendButton)

    await waitFor(() => {
      expect(onSendCarousel).toHaveBeenCalledWith({
        bodyText: "Featured products",
        cards: [
          {
            mediaType: "image",
            mediaUrl: "https://example.com/card-1.jpg",
            bodyText: "",
            buttonLabel: "Open card 1",
            buttonUrl: "https://example.com/card-1",
          },
          {
            mediaType: "image",
            mediaUrl: "https://example.com/card-2.mp4",
            bodyText: "",
            buttonLabel: "Open card 2",
            buttonUrl: "https://example.com/card-2",
          },
        ],
      })
    })

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()

    const reopenedDialog = await openCarouselComposer()
    expect(within(reopenedDialog).getByLabelText("Carousel Body Text")).toHaveValue("")
    expect(within(reopenedDialog).getByLabelText("Card 1 Media URL")).toHaveValue("")
  })

  it("submits a quick reply carousel with shared button titles across cards", async () => {
    const { onSendCarousel } = renderMessageInput()

    const dialog = await openCarouselComposer()

    fireEvent.change(within(dialog).getByLabelText("Carousel Body Text"), {
      target: { value: "Pick a product" },
    })
    fireEvent.click(within(dialog).getByRole("radio", { name: /Quick Reply/ }))

    fireEvent.change(within(dialog).getByLabelText("Shared Button 1 Title"), {
      target: { value: "Buy" },
    })
    fireEvent.change(within(dialog).getByLabelText("Shared Button 2 Title"), {
      target: { value: "Later" },
    })

    fireEvent.change(within(dialog).getByLabelText("Card 1 Media URL"), {
      target: { value: "https://example.com/card-a.jpg" },
    })
    fireEvent.change(within(dialog).getByLabelText("Card 2 Media URL"), {
      target: { value: "https://example.com/card-b.jpg" },
    })

    fireEvent.click(within(dialog).getByRole("button", { name: "Send Carousel Message" }))

    await waitFor(() => {
      expect(onSendCarousel).toHaveBeenCalledWith({
        bodyText: "Pick a product",
        cards: [
          {
            mediaType: "image",
            mediaUrl: "https://example.com/card-a.jpg",
            bodyText: "",
            buttons: [
              { id: "card-1-button-1", title: "Buy" },
              { id: "card-1-button-2", title: "Later" },
            ],
          },
          {
            mediaType: "image",
            mediaUrl: "https://example.com/card-b.jpg",
            bodyText: "",
            buttons: [
              { id: "card-2-button-1", title: "Buy" },
              { id: "card-2-button-2", title: "Later" },
            ],
          },
        ],
      })
    })
  })
})
