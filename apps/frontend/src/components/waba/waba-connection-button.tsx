"use client"

import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Loader2 } from "lucide-react"
import { wabaApi, type WABADetails } from "@/lib/api/waba-api"
import { useToast } from "@/hooks/use-toast"
import { getSafeErrorMessage } from "@/lib/error-utils"

declare global {
    interface Window {
        FB?: {
            init: (options: Record<string, unknown>) => void
            login: (
                callback: (response: {
                    authResponse?: { code?: string }
                    status?: string
                }) => void,
                options: Record<string, unknown>
            ) => void
        }
        fbAsyncInit?: () => void
    }
}

const FACEBOOK_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js"
const SESSION_EVENT_WAIT_MS = 500

function isAllowedMetaOrigin(origin: string) {
    try {
        const { hostname, protocol } = new URL(origin)
        return (
            protocol === "https:" &&
            (hostname === "www.facebook.com" ||
                hostname === "web.facebook.com" ||
                hostname.endsWith(".facebook.com"))
        )
    } catch {
        return false
    }
}

function parseEmbeddedSignupMessage(rawData: unknown) {
    const data =
        typeof rawData === "string"
            ? (() => {
                  try {
                      return JSON.parse(rawData)
                  } catch {
                      return null
                  }
              })()
            : rawData

    if (!data || typeof data !== "object") {
        return null
    }

    const payload = data as {
        type?: string
        event?: string
        data?: {
            waba_id?: string
            phone_number_id?: string
        }
    }

    if (payload.type !== "WA_EMBEDDED_SIGNUP") {
        return null
    }

    return {
        type: payload.type,
        event: payload.event,
        wabaId: payload.data?.waba_id,
        phoneNumberId: payload.data?.phone_number_id,
    }
}

async function ensureFacebookSdk(appId: string) {
    if (window.FB) {
        window.FB.init({
            appId,
            autoLogAppEvents: true,
            xfbml: false,
            version: "v23.0",
        })
        return window.FB
    }

    await new Promise<void>((resolve, reject) => {
        const existingScript = document.querySelector<HTMLScriptElement>(`script[src="${FACEBOOK_SDK_SRC}"]`)

        window.fbAsyncInit = () => {
            if (!window.FB) {
                reject(new Error("Facebook SDK failed to initialize"))
                return
            }

            window.FB.init({
                appId,
                autoLogAppEvents: true,
                xfbml: false,
                version: "v23.0",
            })
            resolve()
        }

        if (existingScript) {
            return
        }

        const script = document.createElement("script")
        script.async = true
        script.defer = true
        script.src = FACEBOOK_SDK_SRC
        script.onerror = () => reject(new Error("Failed to load Facebook SDK"))
        document.body.appendChild(script)
    })

    return window.FB
}

async function waitForEmbeddedSignupSession(
    sessionRef: React.RefObject<{
        state?: string
        wabaId?: string
        phoneNumberId?: string
        event?: string
    }>
) {
    if (sessionRef.current.wabaId) {
        return
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < SESSION_EVENT_WAIT_MS) {
        await new Promise((resolve) => setTimeout(resolve, 50))
        if (sessionRef.current.wabaId) {
            return
        }
    }
}

interface WABAConnectionButtonProps {
    onSuccess?: (waba: WABADetails) => void
    onError?: (error: Error) => void
    className?: string
    enableCoexistence?: boolean
    variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link"
    children?: React.ReactNode
}

export function WABAConnectionButton({
    onSuccess,
    onError,
    className,
    enableCoexistence = true, // Enable coexistence by default (Embedded Signup v4)
    variant = "default",
    children,
}: WABAConnectionButtonProps) {
    const [loading, setLoading] = useState(false)
    const { toast } = useToast()
    const sessionRef = useRef<{
        state?: string
        wabaId?: string
        phoneNumberId?: string
        event?: string
    }>({})

    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (!isAllowedMetaOrigin(event.origin)) {
                return
            }

            const payload = parseEmbeddedSignupMessage(event.data)
            if (!payload) {
                return
            }

            sessionRef.current = {
                ...sessionRef.current,
                event: payload.event,
                wabaId: payload.wabaId || sessionRef.current.wabaId,
                phoneNumberId:
                    payload.phoneNumberId || sessionRef.current.phoneNumberId,
            }
        }

        window.addEventListener("message", handleMessage)
        return () => window.removeEventListener("message", handleMessage)
    }, [])

    const handleConnect = async () => {
        try {
            setLoading(true)
            const { appId, configId, state } = await wabaApi.initEmbeddedSignup(
                enableCoexistence
            )
            sessionRef.current = {
                ...sessionRef.current,
                state,
            }

            const fb = await ensureFacebookSdk(appId)
            if (!fb) {
                throw new Error("Facebook SDK unavailable")
            }

            const response = await new Promise<{
                authResponse?: { code?: string }
                status?: string
            }>((resolve) => {
                fb.login(resolve, {
                    config_id: configId,
                    response_type: "code",
                    override_default_response_type: true,
                    extras: {
                        featureType: "whatsapp_business_app_onboarding",
                        sessionInfoVersion: "3",
                    },
                })
            })

            const code = response.authResponse?.code
            if (!code) {
                throw new Error("WhatsApp connection cancelled")
            }

            await waitForEmbeddedSignupSession(sessionRef)

            const result = await wabaApi.exchangeEmbeddedSignupCode({
                code,
                state,
                providedWabaId: sessionRef.current.wabaId,
            })

            setLoading(false)
            toast({
                title: "Success",
                description: "WhatsApp Business Account connected successfully!",
            })

            if (onSuccess) {
                onSuccess(result.waba)
            }
        } catch (error: any) {
            setLoading(false)
            toast({
                variant: "destructive",
                title: "Error",
                description: getSafeErrorMessage(error, "Failed to initialize WhatsApp connection"),
            })

            if (onError) {
                onError(error)
            }
        }
    }

    return (
        <Button
            onClick={handleConnect}
            disabled={loading}
            variant={variant}
            className={className}
        >
            {loading ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                </>
            ) : children ? (
                children
            ) : (
                <>
                    <svg
                        className="mr-2 h-5 w-5"
                        fill="currentColor"
                        viewBox="0 0 24 24"
                        xmlns="http://www.w3.org/2000/svg"
                    >
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    Connect WhatsApp
                </>
            )}
        </Button>
    )
}
