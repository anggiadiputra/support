"use client"

import { useState, useCallback, useEffect, useRef } from "react"
import { useRouter } from "@/i18n/routing"
import { useQueryClient } from "@tanstack/react-query"
import { SESSION_QUERY_KEY } from "@/hooks/use-cached-session"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

type RegistrationStep = "form" | "otp"

interface RegistrationState {
  step: RegistrationStep
  loading: boolean
  error: string | null
  errorCode: string | null
  email: string
  expiresAt: Date | null
  resendCooldown: number
  resendsRemaining: number
  attemptsRemaining: number
}

interface InitiateResponse {
  success: boolean
  data?: {
    message: string
    expiresAt: string
    resendCooldown: number
  }
  error?: {
    code: string
    message: string
    retryAfter?: number
  }
}

interface VerifyResponse {
  success: boolean
  data?: {
    token: string
    user: {
      id: string
      email: string
      name: string
      role: string
      emailVerified: boolean
    }
  }
  error?: {
    code: string
    message: string
    attemptsRemaining?: number
  }
}

interface ResendResponse {
  success: boolean
  data?: {
    message: string
    expiresAt: string
    resendCooldown: number
    resendsRemaining: number
  }
  error?: {
    code: string
    message: string
    retryAfter?: number
  }
}

export function useRegister() {
  const router = useRouter()
  const queryClient = useQueryClient()
  const [state, setState] = useState<RegistrationState>({
    step: "form",
    loading: false,
    error: null,
    errorCode: null,
    email: "",
    expiresAt: null,
    resendCooldown: 0,
    resendsRemaining: 5,
    attemptsRemaining: 5,
  })

  const cooldownTimerRef = useRef<NodeJS.Timeout | null>(null)
  const expirationTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Countdown for resend cooldown
  useEffect(() => {
    if (state.resendCooldown > 0) {
      cooldownTimerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          resendCooldown: Math.max(0, prev.resendCooldown - 1),
        }))
      }, 1000)
    }

    return () => {
      if (cooldownTimerRef.current) {
        clearInterval(cooldownTimerRef.current)
      }
    }
  }, [state.resendCooldown > 0])

  // Calculate time remaining until OTP expires
  const getTimeRemaining = useCallback(() => {
    if (!state.expiresAt) return 0
    const remaining = Math.max(0, Math.floor((state.expiresAt.getTime() - Date.now()) / 1000))
    return remaining
  }, [state.expiresAt])

  const [timeRemaining, setTimeRemaining] = useState(0)

  useEffect(() => {
    if (state.expiresAt) {
      setTimeRemaining(getTimeRemaining())
      expirationTimerRef.current = setInterval(() => {
        const remaining = getTimeRemaining()
        setTimeRemaining(remaining)
        if (remaining <= 0 && expirationTimerRef.current) {
          clearInterval(expirationTimerRef.current)
        }
      }, 1000)
    }

    return () => {
      if (expirationTimerRef.current) {
        clearInterval(expirationTimerRef.current)
      }
    }
  }, [state.expiresAt, getTimeRemaining])

  const initiateRegistration = useCallback(
    async (data: {
      email: string
      password: string
      name: string
      referralCode?: string
    }) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const response = await fetch(`${API_URL}/api/v1/auth/register/initiate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        })

        const result: InitiateResponse = await response.json()

        if (!response.ok || !result.success) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: result.error?.message || null,
            errorCode: result.error?.code || "UnknownError",
          }))
          return { success: false, error: result.error }
        }

        setState((prev) => ({
          ...prev,
          loading: false,
          step: "otp",
          email: data.email,
          expiresAt: result.data ? new Date(result.data.expiresAt) : null,
          resendCooldown: result.data?.resendCooldown || 60,
          error: null,
        }))

        return { success: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : null
        setState((prev) => ({ ...prev, loading: false, error: message, errorCode: "NetworkError" }))
        return { success: false, error: { code: "NetworkError", message: message || "Network error" } }
      }
    },
    []
  )

  const verifyOTP = useCallback(
    async (otp: string) => {
      setState((prev) => ({ ...prev, loading: true, error: null }))

      try {
        const response = await fetch(`${API_URL}/api/v1/auth/register/verify`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ email: state.email, otp }),
        })

        const result: VerifyResponse = await response.json()

        if (!response.ok || !result.success) {
          setState((prev) => ({
            ...prev,
            loading: false,
            error: result.error?.message || null,
            errorCode: result.error?.code || "InvalidOTP",
            attemptsRemaining: result.error?.attemptsRemaining ?? prev.attemptsRemaining,
          }))
          return { success: false, error: result.error }
        }

        setState((prev) => ({ ...prev, loading: false, error: null }))
        
        // Invalidate and refetch session cache, wait for completion before redirect
        await queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY })
        await queryClient.refetchQueries({ queryKey: SESSION_QUERY_KEY })
        
        // Redirect to dashboard on success
        router.push("/dashboard")
        
        return { success: true, data: result.data }
      } catch (error) {
        const message = error instanceof Error ? error.message : null
        setState((prev) => ({ ...prev, loading: false, error: message, errorCode: "NetworkError" }))
        return { success: false, error: { code: "NetworkError", message: message || "Network error" } }
      }
    },
    [state.email, router, queryClient]
  )

  const resendOTP = useCallback(async () => {
    if (state.resendCooldown > 0) {
      return { success: false, error: { code: "CooldownActive", message: "Cooldown active" } }
    }

    setState((prev) => ({ ...prev, loading: true, error: null }))

    try {
      const response = await fetch(`${API_URL}/api/v1/auth/register/resend`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email: state.email }),
      })

      const result: ResendResponse = await response.json()

      if (!response.ok || !result.success) {
        setState((prev) => ({
          ...prev,
          loading: false,
          error: result.error?.message || null,
          errorCode: result.error?.code || "ResendFailed",
          resendCooldown: result.error?.retryAfter || 0,
        }))
        return { success: false, error: result.error }
      }

      setState((prev) => ({
        ...prev,
        loading: false,
        expiresAt: result.data ? new Date(result.data.expiresAt) : null,
        resendCooldown: result.data?.resendCooldown || 60,
        resendsRemaining: result.data?.resendsRemaining ?? prev.resendsRemaining,
        error: null,
      }))

      return { success: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : null
      setState((prev) => ({ ...prev, loading: false, error: message, errorCode: "NetworkError" }))
      return { success: false, error: { code: "NetworkError", message: message || "Network error" } }
    }
  }, [state.email, state.resendCooldown])

  const goBackToForm = useCallback(() => {
    setState((prev) => ({
      ...prev,
      step: "form",
      error: null,
      errorCode: null,
      expiresAt: null,
      resendCooldown: 0,
    }))
  }, [])

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null, errorCode: null }))
  }, [])

  return {
    ...state,
    timeRemaining,
    initiateRegistration,
    verifyOTP,
    resendOTP,
    goBackToForm,
    clearError,
  }
}
