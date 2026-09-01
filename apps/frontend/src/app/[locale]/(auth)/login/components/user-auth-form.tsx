"use client"

import { HTMLAttributes, useState } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useQueryClient } from "@tanstack/react-query"
import { Link, useRouter } from "@/i18n/routing"
import { authClient } from "@/lib/auth-client"
import { SESSION_QUERY_KEY } from "@/hooks/use-cached-session"
import { cn } from "@/lib/utils"
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
import { useToast } from "@/hooks/use-toast"
import { GoogleSignInButton } from "@/components/auth/google-signin-button"
import { useMascot } from "@/components/auth/mascot-context"

// Map error codes from better-auth to translation keys
const LOGIN_ERROR_MAP: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "invalidCredentials",
  USER_NOT_FOUND: "invalidCredentials",
  INVALID_PASSWORD: "invalidCredentials",
  ACCOUNT_NOT_FOUND: "invalidCredentials",
  // Account status errors  
  USER_SUSPENDED: "accountDeactivated",
  USER_BANNED: "accountDeactivated",
  USER_DISABLED: "accountDeactivated",
  // 2FA errors
  TWO_FACTOR_NOT_ENABLED: "twoFactorRequired",
  INVALID_TWO_FACTOR_CODE: "invalidTwoFactorCode",
}

function useFormSchema() {
  const t = useTranslations("validation")
  return z.object({
    email: z
      .string()
      .min(1, { message: t("enterEmail") })
      .email({ message: t("invalidEmail") }),
    password: z
      .string()
      .min(1, { message: t("enterPassword") }),
  })
}

export function UserAuthForm({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const t = useTranslations("auth")
  const tCommon = useTranslations("common")
  const tErrors = useTranslations("errors")
  const formSchema = useFormSchema()

  // Get mascot state setter (with fallback if context not available)
  let setMascotState: ((state: "idle" | "email" | "password") => void) | null = null
  try {
    const mascot = useMascot()
    setMascotState = mascot.setState
  } catch {
    // Context not available
  }

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    setIsLoading(true)

    try {
      const result = await authClient.signIn.email({
        email: data.email,
        password: data.password,
      })

      if (result.error) {
        // Get appropriate error message based on error code
        const errorCode = (result.error as any)?.code || ""
        const translationKey = LOGIN_ERROR_MAP[errorCode] || "invalidCredentials"
        
        toast({
          variant: "destructive",
          title: t("loginError"),
          description: tErrors(translationKey as any),
        })
        setIsLoading(false)
      } else {
        // Invalidate and refetch session cache, wait for completion before redirect
        await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
        await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY })
        router.replace("/dashboard")
        // Keep isLoading true to prevent double-click during navigation
      }
    } catch {
      toast({
        variant: "destructive",
        title: tErrors("generic"),
        description: tErrors("networkError"),
      })
      setIsLoading(false)
    }
  }

  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-5">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-semibold">{t("email")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={tCommon("emailPlaceholder")}
                      className="h-11"
                      {...field}
                      onFocus={(e) => {
                        field.onBlur?.()
                        setMascotState?.("email")
                      }}
                      onBlur={(e) => {
                        field.onBlur?.()
                        setMascotState?.("idle")
                      }}
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
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-sm font-semibold">{t("password")}</FormLabel>
                    <Link
                      href="/forgot-password"
                      className="text-primary text-xs font-medium hover:underline"
                    >
                      {t("forgotPassword")}
                    </Link>
                  </div>
                  <FormControl>
                    <PasswordInput
                      placeholder={t("minChars", { min: 8 })}
                      className="h-11"
                      {...field}
                      onFocus={(e) => {
                        field.onBlur?.()
                        setMascotState?.("password")
                      }}
                      onBlur={(e) => {
                        field.onBlur?.()
                        setMascotState?.("idle")
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button
              className="mt-2 h-11 font-semibold"
              disabled={isLoading}
            >
              {isLoading ? t("processing") : t("login")}
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-3 text-muted-foreground font-medium">
                  {tCommon("continueWith")}
                </span>
              </div>
            </div>

            <GoogleSignInButton />
          </div>
        </form>
      </Form>
    </div>
  )
}
