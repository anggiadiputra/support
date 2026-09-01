"use client"

import { IconInbox, IconBrandWhatsapp, IconBrandInstagram } from "@tabler/icons-react"

export function UnifiedEmptyState() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center bg-muted/30">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-4">
          <IconInbox className="h-10 w-10 text-primary" />
        </div>
        <h3 className="text-xl font-semibold mb-2">OneInbox</h3>
        <p className="text-muted-foreground mb-6">
          Select a conversation from the list to view and reply to messages
        </p>
        <div className="flex items-center justify-center gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
            <span>WhatsApp</span>
          </div>
          <span>•</span>
          <div className="flex items-center gap-1.5">
            <IconBrandInstagram className="h-4 w-4 text-pink-500" />
            <span>Instagram</span>
          </div>
        </div>
      </div>
    </div>
  )
}
