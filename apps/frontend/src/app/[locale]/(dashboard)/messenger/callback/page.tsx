"use client"

import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconBrandFacebook, IconCircleCheck, IconAlertCircle, IconLoader2 } from "@tabler/icons-react"

type CallbackStatus = "loading" | "success" | "error"

// Map error codes to predefined messages - don't use raw URL params
const ERROR_MESSAGES: Record<string, string> = {
  'access_denied': 'You cancelled the Facebook authorization. Please try again if you want to connect your page.',
  'no_pages': 'No Facebook Pages found. Make sure you are an admin of at least one Facebook Page.',
  'already_connected': 'This Facebook Page is already connected to another user.',
  'invalid_request': 'Invalid authorization request. Please try again.',
  'server_error': 'Server error occurred. Please try again later.',
}

export default function MessengerCallbackPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<CallbackStatus>("loading")
  const [message, setMessage] = useState("")

  useEffect(() => {
    handleCallback()
  }, [])

  const handleCallback = async () => {
    // Check for success/error from backend redirect
    const success = searchParams.get("success")
    const error = searchParams.get("error")
    const pageCount = searchParams.get("pageCount")

    // Check if this is a popup window (has opener)
    const isPopup = window.opener && !window.opener.closed

    // Handle success from backend redirect
    if (success === "true") {
      setStatus("success")
      const count = parseInt(pageCount || "0", 10)
      setMessage(
        count > 0
          ? `Successfully connected ${count} Facebook Page${count > 1 ? "s" : ""}!`
          : "Successfully authorized! Your pages have been connected."
      )

      if (isPopup) {
        // Send success message to parent window
        window.opener.postMessage(
          {
            type: "messenger-oauth-result",
            success: true,
            pageCount: count,
          },
          window.location.origin
        )

        // Close popup after short delay
        setTimeout(() => {
          window.close()
        }, 1500)
      } else {
        // Fallback: redirect if not in popup
        setTimeout(() => {
          router.push("/messenger")
        }, 2000)
      }
      return
    }

    // Handle error from backend redirect
    if (error) {
      setStatus("error")
      // Use predefined error messages only - don't render raw URL params
      const errMsg = ERROR_MESSAGES[error] || "An error occurred during authorization"
      setMessage(errMsg)

      if (isPopup) {
        // Send error message to parent window
        window.opener.postMessage(
          {
            type: "messenger-oauth-result",
            success: false,
            error: errMsg,
          },
          window.location.origin
        )

        // Close popup after delay
        setTimeout(() => {
          window.close()
        }, 3000)
      }
      return
    }

    // If no success/error params, show error (shouldn't happen normally)
    setStatus("error")
    const errMsg = "Invalid callback. Please try connecting again."
    setMessage(errMsg)

    if (isPopup) {
      window.opener.postMessage(
        {
          type: "messenger-oauth-result",
          success: false,
          error: errMsg,
        },
        window.location.origin
      )

      setTimeout(() => {
        window.close()
      }, 3000)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#1877F2]">
            <IconBrandFacebook className="h-8 w-8 text-white" />
          </div>
          <CardTitle>
            {status === "loading" && "Connecting Facebook..."}
            {status === "success" && "Connection Successful!"}
            {status === "error" && "Connection Failed"}
          </CardTitle>
          <CardDescription>
            {status === "loading" && "Please wait while we complete the authorization"}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          {status === "loading" && (
            <div className="flex flex-col items-center gap-4">
              <IconLoader2 className="h-8 w-8 animate-spin text-[#1877F2]" />
              <p className="text-muted-foreground text-sm">
                Exchanging authorization code for access token...
              </p>
            </div>
          )}

          {status === "success" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-900/30">
                <IconCircleCheck className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm">{message}</p>
              <p className="text-muted-foreground text-xs">
                {typeof window !== "undefined" && window.opener && !window.opener.closed
                  ? "Closing window..."
                  : "Redirecting to Messenger settings..."}
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="flex flex-col items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
                <IconAlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <p className="text-sm text-red-600 dark:text-red-400">{message}</p>
              <Button onClick={() => router.push("/messenger")} variant="outline">
                Back to Messenger Settings
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
