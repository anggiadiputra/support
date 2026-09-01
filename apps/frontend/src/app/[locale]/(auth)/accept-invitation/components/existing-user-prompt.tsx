"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations, useLocale } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { PasswordInput } from "@/components/password-input"
import { IconUserCheck, IconBrandGoogle } from "@tabler/icons-react"
import { authClient } from "@/lib/auth-client"
import { useRouter } from "@/i18n/routing"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface InvitationData {
  id: string
  email: string
  businessOwnerName: string
  expiresAt: string
}

interface ExistingUserPromptProps {
  invitation: InvitationData
  token: string
  hasPassword: boolean
}

function useFormSchema() {
  const t = useTranslations("validation")
  return z.object({
    password: z.string().min(1, { message: t("enterPassword") }),
  })
}

export function ExistingUserPrompt({
  invitation,
  token,
  hasPassword,
}: ExistingUserPromptProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations("team.acceptInvitation")
  const tAuth = useTranslations("auth")
  const locale = useLocale()
  const router = useRouter()
  const formSchema = useFormSchema()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      password: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setLoading(true)
    setError(null)

    try {
      // First, authenticate the user
      const loginResult = await authClient.signIn.email({
        email: invitation.email,
        password: data.password,
      })

      if (loginResult.error) {
        setError(tAuth("loginError"))
        setLoading(false)
        return
      }

      // Then accept the invitation to link the account
      const response = await fetch(`${API_URL}/api/v1/team/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      })

      const result = await response.json()

      if (!result.success) {
        if (result.error?.code === "ALREADY_AGENT_OF_ANOTHER") {
          setError(t("alreadyAgent"))
          return
        }
        setError(result.error?.message || t("error"))
        return
      }

      // Redirect to messages page (agent dashboard)
      router.replace("/messages")
    } catch (err) {
      setError(t("error"))
    } finally {
      setLoading(false)
    }
  }

async function handleGoogleLogin() {
    setLoading(true)
    setError(null)

    try {
      // Store the token in sessionStorage so we can use it after OAuth redirect
      sessionStorage.setItem("pendingInvitationToken", token)

      // Use absolute URL for callback since frontend and backend are different origins
      const frontendUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'

      // Redirect to Google OAuth with callback to accept invitation
      await authClient.signIn.social({
        provider: "google",
        callbackURL: `${frontendUrl}/${locale}/accept-invitation/callback`,
      })
    } catch (err) {
      setError(t("error"))
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6" data-auth-content>
      <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <IconUserCheck className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("existingAccount")}</h1>
            <p className="mt-1 text-muted-foreground">
              {t("subtitle")}{" "}
              <span className="font-semibold text-foreground">
                {invitation.businessOwnerName}
              </span>
            </p>
          </div>
        </div>

        <div className="mb-6 rounded-lg bg-muted/50 p-4">
          <p className="text-sm text-muted-foreground">
            {hasPassword ? t("existingAccountDesc") : t("oauthAccountDesc")}
          </p>
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{invitation.email}</span>
          </p>
        </div>

        {hasPassword ? (
          // Password login form
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-4">
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel className="text-sm font-semibold">
                        {tAuth("password")}
                      </FormLabel>
                      <FormControl>
                        <PasswordInput
                          placeholder={tAuth("minChars", { min: 8 })}
                          className="h-11"
                          disabled={loading}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {error && (
                  <div className="rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button className="mt-2 h-11 font-semibold" disabled={loading}>
                  {loading ? tAuth("processing") : t("loginToLink")}
                </Button>
              </div>
            </form>
          </Form>
        ) : (
          // Google OAuth login
          <div className="grid gap-4">
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
                {error}
              </div>
            )}

            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 font-semibold"
              onClick={handleGoogleLogin}
              disabled={loading}
            >
              <IconBrandGoogle className="h-5 w-5" />
              {loading ? tAuth("processing") : t("continueWithGoogle")}
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
