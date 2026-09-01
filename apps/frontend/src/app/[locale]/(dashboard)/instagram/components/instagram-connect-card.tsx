"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconBrandInstagram, IconAlertTriangle } from "@tabler/icons-react"

interface Props {
  onConnect: () => void
  requiresReauth?: boolean
  disabled?: boolean
}

export function InstagramConnectCard({ onConnect, requiresReauth, disabled }: Props) {
  return (
    <Card className={requiresReauth ? "border-amber-200 dark:border-amber-800" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBrandInstagram className="h-5 w-5" />
          {requiresReauth ? "Reconnect Instagram" : "Connect Instagram"}
        </CardTitle>
        <CardDescription>
          {requiresReauth 
            ? "Your Instagram connection needs to be re-authenticated"
            : "Connect your Instagram Professional account to manage DMs"
          }
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {requiresReauth && (
          <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/20">
            <IconAlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Re-authentication Required
              </p>
              <p className="text-xs text-amber-700 dark:text-amber-300">
                Your access token has expired or permissions were revoked. Please reconnect your account.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm">
            Connect your Instagram Professional (Business or Creator) account to:
          </p>
          <ul className="text-muted-foreground ml-6 list-disc space-y-1 text-sm">
            <li>Receive and reply to Instagram Direct Messages</li>
            <li>Send images, videos, and audio messages</li>
            <li>React to messages with ❤️</li>
            <li>View conversation history</li>
          </ul>
        </div>

        <Button 
          onClick={onConnect} 
          className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700"
          disabled={disabled && !requiresReauth}
        >
          <IconBrandInstagram className="mr-2 h-5 w-5" />
          {requiresReauth ? "Reconnect Instagram Account" : "Connect Instagram Account"}
        </Button>

        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-muted-foreground text-xs">
            <strong>Requirements:</strong> You need an Instagram Professional account (Business or Creator). 
            Personal accounts are not supported by Instagram's Messaging API.
          </p>
        </div>


      </CardContent>
    </Card>
  )
}
