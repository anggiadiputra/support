"use client"

import { HTMLAttributes, useState, useEffect, useMemo } from "react"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useTranslations } from "next-intl"
import { useSearchParams } from "next/navigation"
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
import { GoogleSignInButton } from "@/components/auth/google-signin-button"
import { OTPInput } from "@/components/ui/otp-input"
import { useRegister } from "@/hooks/use-register"
import { IconArrowLeft, IconMail, IconRefresh } from "@tabler/icons-react"
import { useMascot } from "@/components/auth/mascot-context"

// Map backend error codes to translation keys
const ERROR_CODE_MAP: Record<string, string> = {
  InvalidCredentials: "invalidCredentials",
  UserExists: "userAlreadyExists",
  InvalidOTP: "invalidOtp",
  OTPExpired: "otpExpired",
  RateLimitExceeded: "tooManyAttempts",
  CooldownActive: "cooldownActive",
  ResendFailed: "failedToResendOtp",
  NetworkError: "networkError",
  UserNotFound: "userNotFound",
  AccountDeactivated: "accountDeactivated",
  TwoFactorRequired: "twoFactorRequired",
  InvalidTwoFactorCode: "invalidTwoFactorCode",
}

function useFormSchema() {
  const t = useTranslations("validation")
  return z
    .object({
      email: z
        .string()
        .min(1, { message: t("enterEmail") })
        .email({ message: t("invalidEmail") }),
      password: z
        .string()
        .min(1, { message: t("enterPassword") })
        .min(8, { message: t("minLength", { min: 8 }) }),
      confirmPassword: z.string(),
      name: z.string().min(1, { message: t("enterName") }),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t("passwordMismatch"),
      path: ["confirmPassword"],
    })
}

// Note: referral_token cookie is httpOnly so cannot be read client-side
// This is intentional for security - the token is only read server-side
// For email registration, we use the URL param directly

export function RegisterForm({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  const [otp, setOtp] = useState("")
  const [referralCode, setReferralCode] = useState<string | null>(null)
  const t = useTranslations("auth")
  const tCommon = useTranslations("common")
  const tErrors = useTranslations("errors")
  const searchParams = useSearchParams()
  const formSchema = useFormSchema()

  // Get referral code from URL param
  // Note: referral_token cookie is httpOnly for security, only read server-side
  useEffect(() => {
    const refParam = searchParams.get("ref")
    if (refParam) {
      setReferralCode(refParam)
    }
  }, [searchParams])

  // Get mascot state setter (with fallback if context not available)
  let setMascotState: ((state: "idle" | "email" | "password") => void) | null = null
  try {
    const mascot = useMascot()
    setMascotState = mascot.setState
  } catch {
    // Context not available
  }
  const {
    step,
    loading,
    error,
    errorCode,
    email,
    timeRemaining,
    resendCooldown,
    resendsRemaining,
    attemptsRemaining,
    initiateRegistration,
    verifyOTP,
    resendOTP,
    goBackToForm,
    clearError,
  } = useRegister()

  // Get translated error message
  const errorMessage = useMemo(() => {
    if (!errorCode && !error) return null
    
    // Try to get translation for error code
    if (errorCode && ERROR_CODE_MAP[errorCode]) {
      const translationKey = ERROR_CODE_MAP[errorCode]
      try {
        return tErrors(translationKey as any)
      } catch {
        // Fallback to backend message
      }
    }
    
    // Fallback to backend error message or generic error
    return error || tErrors("errorOccurred")
  }, [errorCode, error, tErrors])

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
      confirmPassword: "",
      name: "",
    },
  })

  async function onSubmit(data: z.infer<typeof formSchema>) {
    await initiateRegistration({
      email: data.email,
      password: data.password,
      name: data.name,
      ...(referralCode && { referralCode }),
    })
  }

  async function handleVerifyOTP() {
    if (otp.length !== 6) return
    await verifyOTP(otp)
  }

  async function handleResendOTP() {
    setOtp("")
    clearError()
    await resendOTP()
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, "0")}`
  }

  // Step 2: OTP Verification
  if (step === "otp") {
    return (
      <div className={cn("grid gap-4 sm:gap-6", className)} {...props}>
        <div className="flex flex-col items-center gap-3 sm:gap-4">
          <div className="flex h-14 w-14 sm:h-16 sm:w-16 items-center justify-center rounded-full bg-primary/10">
            <IconMail className="h-7 w-7 sm:h-8 sm:w-8 text-primary" />
          </div>
          <div className="text-center">
            <h2 className="text-lg sm:text-xl font-semibold">{t("verifyEmail")}</h2>
            <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
              {t("enterOtpCode")}
            </p>
            <p className="font-medium text-primary text-sm sm:text-base break-all">{email}</p>
          </div>
        </div>

        <div className="space-y-4">
          <OTPInput
            value={otp}
            onChange={(value) => {
              setOtp(value)
              clearError()
            }}
            disabled={loading}
            autoFocus
          />

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

          {/* Error message */}
          {errorMessage && (
            <div className="rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
              {errorMessage}
              {attemptsRemaining < 5 && attemptsRemaining > 0 && (
                <span className="block mt-1 text-xs">
                  {t("remainingAttempts", { count: attemptsRemaining })}
                </span>
              )}
            </div>
          )}

          <Button
            className="h-11 w-full font-semibold"
            onClick={handleVerifyOTP}
            disabled={loading || otp.length !== 6}
          >
            {loading ? t("verifying") : t("verify")}
          </Button>

          {/* Resend OTP */}
          <div className="flex flex-col items-center gap-2">
            <p className="text-sm text-muted-foreground">
              {t("didntReceiveCode")}
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleResendOTP}
              disabled={loading || resendCooldown > 0 || resendsRemaining === 0}
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
            onClick={goBackToForm}
            disabled={loading}
          >
            <IconArrowLeft className="h-4 w-4" />
            {t("backToForm")}
          </Button>
        </div>
      </div>
    )
  }

  // Step 1: Registration Form
  return (
    <div className={cn("grid gap-6", className)} {...props}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <div className="grid gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-semibold">{t("fullName")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={t("fullName")}
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
              name="email"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel className="text-sm font-semibold">{t("email")}</FormLabel>
                  <FormControl>
                    <Input
                      placeholder={tCommon("emailPlaceholder")}
                      className="h-11"
                      disabled={loading}
                      {...field}
                      onFocus={() => setMascotState?.("email")}
                      onBlur={() => setMascotState?.("idle")}
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
                  <FormLabel className="text-sm font-semibold">{t("password")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={t("minChars", { min: 8 })}
                      className="h-11"
                      disabled={loading}
                      {...field}
                      onFocus={() => setMascotState?.("password")}
                      onBlur={() => setMascotState?.("idle")}
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
                  <FormLabel className="text-sm font-semibold">{t("confirmPassword")}</FormLabel>
                  <FormControl>
                    <PasswordInput
                      placeholder={t("confirmPassword")}
                      className="h-11"
                      disabled={loading}
                      {...field}
                      onFocus={() => setMascotState?.("password")}
                      onBlur={() => setMascotState?.("idle")}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Error message */}
            {errorMessage && (
              <div className="rounded-lg bg-destructive/10 p-3 text-center text-sm text-destructive">
                {errorMessage}
              </div>
            )}

            <Button className="mt-2 h-11 font-semibold" disabled={loading}>
              {loading ? t("sendingOtp") : t("register")}
            </Button>

            <div className="relative my-2">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t border-border/50" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card text-muted-foreground px-3 font-medium">
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
