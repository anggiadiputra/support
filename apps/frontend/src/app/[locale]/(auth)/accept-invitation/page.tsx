"use client"

import { useEffect, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconAlertCircle, IconLoader2, IconUserPlus } from "@tabler/icons-react"
import { AcceptInvitationForm } from "./components/accept-invitation-form"
import { ExistingUserPrompt } from "./components/existing-user-prompt"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface InvitationData {
  id: string
  email: string
  businessOwnerName: string
  expiresAt: string
  userExists?: boolean
  hasPassword?: boolean
}

type PageState = "loading" | "valid" | "invalid" | "existing_user" | "success"

export default function AcceptInvitationPage() {
  const searchParams = useSearchParams()
  const token = searchParams.get("token")
  const t = useTranslations("team.acceptInvitation")

  const [state, setState] = useState<PageState>("loading")
  const [invitation, setInvitation] = useState<InvitationData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [existingUser, setExistingUser] = useState(false)

  useEffect(() => {
    if (!token) {
      setState("invalid")
      return
    }

    validateToken(token)
  }, [token])

  async function validateToken(token: string) {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/team/invitations/validate/${token}`
      )
      const result = await response.json()

      if (!result.success) {
        setState("invalid")
        setError(result.error?.message || "Invalid invitation")
        return
      }

      setInvitation(result.data)
      // If user already exists, show login prompt directly
      if (result.data.userExists) {
        setExistingUser(true)
        setState("existing_user")
      } else {
        setState("valid")
      }
    } catch (err) {
      setState("invalid")
      setError("Failed to validate invitation")
    }
  }

  function handleExistingUser() {
    setExistingUser(true)
    setState("existing_user")
  }

  function handleSuccess() {
    setState("success")
  }

  // Loading state
  if (state === "loading") {
    return (
      <div className="space-y-6" data-auth-content>
        <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4">
            <IconLoader2 className="h-12 w-12 animate-spin text-primary" />
            <p className="text-muted-foreground">{t("loading")}</p>
          </div>
        </Card>
      </div>
    )
  }

  // Invalid/expired state
  if (state === "invalid") {
    return (
      <div className="space-y-6" data-auth-content>
        <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <IconAlertCircle className="h-8 w-8 text-destructive" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">{t("invalidTitle")}</h1>
              <p className="mt-2 text-muted-foreground">
                {t("invalidDescription")}
              </p>
            </div>
            <Button asChild className="mt-4">
              <Link href="/login">{t("backToLogin")}</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // Success state
  if (state === "success") {
    return (
      <div className="space-y-6" data-auth-content>
        <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
              <IconUserPlus className="h-8 w-8 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">
                {existingUser ? t("linkedSuccess") : t("success")}
              </h1>
              <p className="mt-2 text-muted-foreground">
                {existingUser ? t("linkedSuccessDesc") : t("successDesc")}
              </p>
            </div>
            <Button asChild className="mt-4">
              <Link href="/login">{t("goToLogin")}</Link>
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  // Existing user - show login prompt
  if (state === "existing_user" && invitation) {
    return (
      <ExistingUserPrompt
        invitation={invitation}
        token={token!}
        hasPassword={invitation.hasPassword ?? true}
      />
    )
  }

  // Valid invitation - show registration form
  if (state === "valid" && invitation) {
    return (
      <AcceptInvitationForm
        invitation={invitation}
        token={token!}
        onExistingUser={handleExistingUser}
        onSuccess={handleSuccess}
      />
    )
  }

  return null
}
