import React from "react"
import { render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ApiPlayground } from "./api-playground"

globalThis.React = React

vi.mock("@/i18n/routing", () => ({
  Link: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}))

describe("API playground carousel examples", () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it("includes a WhatsApp carousel URL example with supported card payload shape", () => {
    render(<ApiPlayground activeSection="send-carousel-url" />)

    expect(screen.getByText("Send WhatsApp Carousel URL")).toBeInTheDocument()

    const requestBody = screen.getByPlaceholderText("Enter JSON body...")

    expect((requestBody as HTMLTextAreaElement).value).toContain('"type": "carousel"')
    expect((requestBody as HTMLTextAreaElement).value).toContain('"cards"')
    expect((requestBody as HTMLTextAreaElement).value).toContain('"name": "cta_url"')
  })

  it("includes a WhatsApp carousel quick reply example with supported card payload shape", () => {
    render(<ApiPlayground activeSection="send-carousel-quick-reply" />)

    expect(screen.getByText("Send WhatsApp Carousel Quick Reply")).toBeInTheDocument()

    const requestBody = screen.getByPlaceholderText("Enter JSON body...")

    expect((requestBody as HTMLTextAreaElement).value).toContain('"type": "carousel"')
    expect((requestBody as HTMLTextAreaElement).value).toContain('"cards"')
    expect((requestBody as HTMLTextAreaElement).value).toContain('"quick_reply"')
    expect((requestBody as HTMLTextAreaElement).value).toContain('"buttons"')
  })
})
