"use client"

import { IconBrandInstagram } from "@tabler/icons-react"

export function IGEmptyState() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center bg-muted/30">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 mb-4">
          <IconBrandInstagram className="h-10 w-10 text-white" />
        </div>
        <h3 className="text-xl font-semibold mb-2">Instagram Direct Messages</h3>
        <p className="text-muted-foreground max-w-sm">
          Select a conversation from the list to view and reply to messages
        </p>
      </div>
    </div>
  )
}
