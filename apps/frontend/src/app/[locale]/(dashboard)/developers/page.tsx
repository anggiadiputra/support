"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/routing"

export default function DevelopersPage() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/developers/api-keys")
  }, [router])

  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <div className="animate-pulse text-muted-foreground">
        Redirecting...
      </div>
    </div>
  )
}
