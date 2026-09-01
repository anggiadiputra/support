"use client"

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconBrandFacebook, IconAlertTriangle } from "@tabler/icons-react"

interface Props {
  onConnect: () => void
  requiresReauth?: boolean
  disabled?: boolean
}

export function MessengerConnectCard({ onConnect, requiresReauth, disabled }: Props) {
  return (
    <Card className={requiresReauth ? "border-amber-200 dark:border-amber-800" : ""}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IconBrandFacebook className="h-5 w-5" />
          {requiresReauth ? "Reconnect Facebook Page" : "Connect Facebook Page"}
        </CardTitle>
        <CardDescription>
          {requiresReauth 
            ? "Your Facebook Page connection needs to be re-authenticated"
            : "Connect your Facebook Page to manage Messenger conversations"
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
                Your access token has expired or permissions were revoked. Please reconnect your page.
              </p>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <p className="text-sm">
            Connect your Facebook Page to:
          </p>
          <ul className="text-muted-foreground ml-6 list-disc space-y-1 text-sm">
            <li>Receive and reply to Messenger conversations</li>
            <li>Send images, videos, audio, and files</li>
            <li>View message delivery and read receipts</li>
            <li>Use AI auto-reply for common questions</li>
          </ul>
        </div>

        <Button 
          onClick={onConnect} 
          className="w-full bg-[#1877F2] hover:bg-[#166FE5]"
          disabled={disabled && !requiresReauth}
        >
          <IconBrandFacebook className="mr-2 h-5 w-5" />
          {requiresReauth ? "Reconnect Facebook Page" : "Connect Facebook Page"}
        </Button>

        <div className="rounded-lg border bg-muted/50 p-3">
          <p className="text-muted-foreground text-xs">
            <strong>Requirements:</strong> You need to be an admin of the Facebook Page you want to connect. 
            Personal Facebook accounts are not supported.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
