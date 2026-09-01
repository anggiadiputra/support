"use client"

import { useEffect } from "react"
import { useRouter } from "@/i18n/routing"
import { useSession } from "@/lib/auth-client"
import { Loader2 } from "lucide-react"

export default function RootPage() {
  const { data: session, isPending } = useSession()
  const router = useRouter()

  useEffect(() => {
    if (isPending) return
    
    if (session?.user) {
      router.replace("/dashboard")
    } else {
      router.replace("/login")
    }
  }, [session, isPending, router])

  return (
    <div className="flex h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  )
}
