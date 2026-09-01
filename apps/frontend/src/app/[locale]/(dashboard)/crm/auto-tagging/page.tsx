"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/routing"

// Redirect to new location
export default function AutoTaggingRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace("/automation/auto-tagging")
  }, [router])

  return null
}
