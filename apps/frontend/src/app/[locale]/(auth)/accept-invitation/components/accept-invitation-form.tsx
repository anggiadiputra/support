"use client"

import { useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useRouter } from "@/i18n/routing"
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
import { Input } from "@/components/ui/input"
import { PasswordInput } from "@/components/password-input"
import { IconUserPlus } from "@tabler/icons-react"
import { authClient } from "@/lib/auth-client"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface InvitationData {
  id: string
  email: string
  businessOwnerName: string
  expiresAt: string
}

interface AcceptInvitationFormProps {
  invitation: InvitationData
  token: string
  onExistingUser: () => void
  onSuccess: () => void
}

function useFormSchema() {
  const t = useTranslations("validation")
  return z
    .object({
      name: z.string().min(1, { message: t("enterName") }),
      password: z
        .string()
        .min(1, { message: t("enterPassword") })
        .min(8, { message: t("minLength", { min: 8 }) }),
      confirmPassword: z.string(),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordMismatch"),
      path: ["confirmPassword"],
    })
}

export function AcceptInvitationForm({
  invitation,
  token,
  onExistingUser,
  onSuccess,
}: AcceptInvitationFormProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useTranslations("team.acceptInvitation")
  const router = useRouter()
  const formSchema = useFormSchema()

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      password: "",
      confirmPassword: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/v1/team/invitations/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: data.name,
          password: data.password,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        // Check if user already exists
        if (result.error?.code === "USER_DATA_REQUIRED") {
          onExistingUser()
          return
        }
        if (result.error?.code === "ALREADY_AGENT_OF_ANOTHER") {
          setError(t("alreadyAgent"))
          return
        }
        setError(result.error?.message || t("error"))
        return
      }

      // Auto-login the new user and redirect to dashboard
      if (result.data?.isNewUser) {
        const loginResult = await authClient.signIn.email({
          email: invitation.email,
          password: data.password,
        })

        if (!loginResult.error) {
          router.refresh()
          router.replace("/messages")
          return
        }
      }

      // Fallback to success page if auto-login fails
      onSuccess()
    } catch (err) {
      setError(t("error"))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6" data-auth-content>
      <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <IconUserPlus className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t("title")}</h1>
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
            {t("createAccountDesc")}
          </p>
          <p className="mt-2 text-sm">
            <span className="text-muted-foreground">Email: </span>
            <span className="font-medium">{invitation.email}</span>
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-semibold">
                      {t("name")}
                    </FormLabel>
                    <FormControl>
                      <Input
                        placeholder={t("namePlaceholder")}
                        className="h-11"
                        disabled={loading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-semibold">
                      {t("password")}
                    </FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder={t("passwordPlaceholder")}
                        className="h-11"
                        disabled={loading}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem className="space-y-2">
                    <FormLabel className="text-sm font-semibold">
                      {t("confirmPassword")}
                    </FormLabel>
                    <FormControl>
                      <PasswordInput
                        placeholder={t("confirmPasswordPlaceholder")}
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
                {loading ? t("submitting") : t("submit")}
              </Button>
            </div>
          </form>
        </Form>
      </Card>
    </div>
  )
}
