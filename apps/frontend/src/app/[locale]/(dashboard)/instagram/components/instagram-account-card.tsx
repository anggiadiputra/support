"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IconBrandInstagram, IconMessage, IconInbox } from "@tabler/icons-react"
import type { InstagramAccount } from "@/lib/api/instagram"
import { Link } from "@/i18n/routing"
import { Button } from "@/components/ui/button"

interface Props {
  account: InstagramAccount
}

export function InstagramAccountCard({ account }: Props) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBrandInstagram className="h-5 w-5" />
          Quick Actions
        </CardTitle>
        <CardDescription>Manage your Instagram DM conversations</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <Link href="/instagram/inbox" className="block">
            <div className="rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-gradient-to-br from-purple-500 to-pink-500 p-2">
                  <IconInbox className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Instagram Inbox</p>
                  <p className="text-muted-foreground text-sm">View and reply to DMs</p>
                </div>
              </div>
            </div>
          </Link>

          <Link href="/messages" className="block">
            <div className="rounded-lg border p-4 hover:bg-muted/50 transition-colors cursor-pointer">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-emerald-500 p-2">
                  <IconMessage className="h-5 w-5 text-white" />
                </div>
                <div>
                  <p className="font-medium">Unified Inbox</p>
                  <p className="text-muted-foreground text-sm">All messages in one place</p>
                </div>
              </div>
            </div>
          </Link>
        </div>

        <div className="rounded-lg border bg-muted/50 p-4">
          <h4 className="font-medium mb-2">Instagram Messaging Rules</h4>
          <ul className="text-muted-foreground text-sm space-y-1">
            <li>• You can only reply to messages within 24 hours of receiving them</li>
            <li>• Conversations must be initiated by the Instagram user, not your business</li>
            <li>• Text messages are limited to 1000 bytes (UTF-8)</li>
            <li>• Supported media: Images (8MB), Videos (25MB), Audio (25MB)</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  )
}
