"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/routing"

export default function AutomationPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/automation/quick-replies")
  }, [router])

  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="text-muted-foreground animate-pulse">
        Redirecting to Quick Replies...
      </div>
    </div>
  )
}
