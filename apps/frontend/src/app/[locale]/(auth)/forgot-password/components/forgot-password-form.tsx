"use client"

import { HTMLAttributes, useState, useEffect } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
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
import { OTPInput } from "@/components/ui/otp-input"
import { Link, useRouter } from "@/i18n/routing"
import { IconArrowLeft, IconMail, IconRefresh, IconCheck } from "@tabler/icons-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

function useEmailSchema() {
  const t = useTranslations("validation")
  return z.object({
    email: z.string().min(1, t("emailRequired")).email(t("invalidEmailFormat")),
  })
}

function useResetSchema() {
  const t = useTranslations("validation")
  return z.object({
    otp: z.string().length(6, t("required")),
    newPassword: z.string().min(8, t("minLength", { min: 8 })),
    confirmPassword: z.string(),
  }).refine((data) => data.newPassword === data.confirmPassword, {
    message: t("passwordMismatch"),
    path: ["confirmPassword"],
  })
}

type Step = "email" | "otp" | "success"

export function ForgotPasswordForm({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const router = useRouter()
  const t = useTranslations("auth")
  const tCommon = useTranslations("common")
  const tErrors = useTranslations("errors")
  const emailSchema = useEmailSchema()
  const resetSchema = useResetSchema()
  const [step, setStep] = useState<Step>("email")
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [otp, setOtp] = useState("")
  const [error, setError] = useState("")
  const [resendCooldown, setResendCooldown] = useState(0)
  const [resendsRemaining, setResendsRemaining] = useState(5)
  const [attemptsRemaining, setAttemptsRemaining] = useState(5)
  const [timeRemaining, setTimeRemaining] = useState(0)

  const emailForm = useForm<z.infer<typeof emailSchema>>({
    resolver: zodResolver(emailSchema),
    defaultValues: { email: "" },
  })

  const resetForm = useForm<z.infer<typeof resetSchema>>({
    resolver: zodResolver(resetSchema),
    defaultValues: { otp: "", newPassword: "", confirmPassword: "" },
  })

  // Cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setInterval(() => {
        setResendCooldown((prev) => Math.max(0, prev - 1))
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [resendCooldown])

  // OTP expiry timer
  useEffect(() => {
    if (timeRemaining > 0) {
      const timer = setInterval(() => {
        setTimeRemaining((prev) => Math.max(0, prev - 1))
      }, 1000)
      return () => clearInterval(timer)
    }
  }, [timeRemaining])

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  async function onEmailSubmit(data: z.infer<typeof emailSchema>) {
    setIsLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.error?.code === "RateLimitExceeded") {
          setError(tErrors("tooManyAttempts", { seconds: result.error.retryAfter }))
        } else {
          setError(result.error?.message || tErrors("failedToSendReset"))
        }
        return
      }

      setEmail(data.email)
      setResendCooldown(result.data.resendCooldown || 60)
      setTimeRemaining(10 * 60) // 10 minutes
      setStep("otp")
    } catch {
      setError(tErrors("errorOccurred"))
    } finally {
      setIsLoading(false)
    }
  }

  async function onResetSubmit(data: z.infer<typeof resetSchema>) {
    setIsLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          otp: data.otp,
          newPassword: data.newPassword,
        }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.error?.attemptsRemaining !== undefined) {
          setAttemptsRemaining(result.error.attemptsRemaining)
        }
        setError(result.error?.message || tErrors("failedToResetPassword"))
        return
      }

      setStep("success")
    } catch {
      setError(tErrors("errorOccurred"))
    } finally {
      setIsLoading(false)
    }
  }

  async function handleResendOTP() {
    if (resendCooldown > 0) return
    
    setIsLoading(true)
    setError("")
    try {
      const res = await fetch(`${API_URL}/api/v1/auth/forgot-password/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })

      const result = await res.json()

      if (!res.ok) {
        if (result.error?.retryAfter) {
          setResendCooldown(result.error.retryAfter)
        }
        setError(result.error?.message || tErrors("errorOccurred"))
        return
      }

      setResendCooldown(result.data.resendCooldown || 60)
      setResendsRemaining(result.data.resendsRemaining)
      setTimeRemaining(10 * 60)
      setOtp("")
      resetForm.setValue("otp", "")
    } catch {
      setError(tErrors("errorOccurred"))
    } finally {
      setIsLoading(false)
    }
  }

  // Success step
  if (step === "success") {
    return (
      <div className={cn("grid gap-6", className)} {...props}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-green-500/10">
            <IconCheck className="h-8 w-8 text-green-500" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold">{t("passwordResetSuccess")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("passwordResetSuccessDesc")}
            </p>
          </div>
        </div>
        <Button onClick={() => router.push("/login")} className="h-11">
          {t("goToLogin")}
        </Button>
      </div>
    )
  }

  // OTP step
  if (step === "otp") {
    return (
      <div className={cn("grid gap-6", className)} {...props}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <IconMail className="h-8 w-8 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-xl font-semibold">{t("resetPassword")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t("enterOtpCode")}
            </p>
            <p className="font-medium text-primary">{email}</p>
          </div>
        </div>

        <Form {...resetForm}>
          <form onSubmit={resetForm.handleSubmit(onResetSubmit)} className="space-y-4">
            <div className="space-y-2">
              <OTPInput
                value={otp}
                onChange={(value) => {
                  setOtp(value)
                  resetForm.setValue("otp", value)
                  setError("")
                }}
                disabled={isLoading}
                autoFocus
              />
            </div>

            {/* Countdown timer */}
            {timeRemaining > 0 && (
              <p className="text-center text-sm text-muted-foreground">
                {t("codeValidFor")}{" "}
                <span className="font-medium text-foreground">
                  {formatTime(timeRemaining)}
                </span>
              </p>
            )}

            {timeRemaining === 0 && (
              <p className="text-center text-sm text-destructive">
                {t("codeExpired")}
              </p>
            )}

            <FormField
              control={resetForm.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>{t("newPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput placeholder={t("minChars", { min: 8 })} className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={resetForm.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>{t("confirmNewPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput placeholder={t("confirmNewPassword")} className="h-11" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error message */}
            {error && (
              <div className="rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
                {error}
                {attemptsRemaining < 5 && attemptsRemaining > 0 && (
                  <span className="block mt-1 text-xs">
                    {t("remainingAttempts", { count: attemptsRemaining })}
                  </span>
                )}
              </div>
            )}

            <Button type="submit" className="w-full h-11" disabled={isLoading || otp.length !== 6}>
              {isLoading ? t("processing") : t("resetPassword")}
            </Button>
          </form>
        </Form>

        {/* Resend OTP */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-sm text-muted-foreground">{t("didntReceiveCode")}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleResendOTP}
            disabled={isLoading || resendCooldown > 0 || resendsRemaining === 0}
            className="gap-2"
          >
            <IconRefresh className="h-4 w-4" />
            {resendCooldown > 0
              ? t("resendIn", { seconds: resendCooldown })
              : resendsRemaining === 0
              ? t("resendLimitReached")
              : t("resendCode")}
          </Button>
          {resendsRemaining > 0 && resendsRemaining < 5 && (
            <p className="text-xs text-muted-foreground">
              {t("remainingResends", { count: resendsRemaining })}
            </p>
          )}
        </div>

        {/* Back button */}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full gap-2"
          onClick={() => setStep("email")}
          disabled={isLoading}
        >
          <IconArrowLeft className="h-4 w-4" />
          {t("changeEmail")}
        </Button>
      </div>
    )
  }

  // Email step
  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <div className="space-y-2 text-center">
        <h2 className="text-xl font-semibold">{t("forgotPasswordTitle")}</h2>
        <p className="text-muted-foreground text-sm">
          {t("forgotPasswordDesc")}
        </p>
      </div>

      <Form {...emailForm}>
        <form onSubmit={emailForm.handleSubmit(onEmailSubmit)} className="space-y-4">
          <FormField
            control={emailForm.control}
            name="email"
            render={({ field }) => (
              <FormItem className="space-y-2">
                <FormLabel>{t("email")}</FormLabel>
                <FormControl>
                  <Input placeholder={tCommon("emailPlaceholder")} className="h-11" {...field} />
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

          <Button type="submit" className="w-full h-11" disabled={isLoading}>
            {isLoading ? t("sending") : t("sendResetCode")}
          </Button>
        </form>
      </Form>

      <div className="text-center text-sm">
        <Link href="/login" className="text-primary hover:underline">
          {t("backToLogin")}
        </Link>
      </div>
    </div>
  )
}
