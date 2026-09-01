"use client"

import { useEffect, useState } from "react"
import { useRouter } from "@/i18n/routing"
import { useTranslations } from "next-intl"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { IconLoader2, IconAlertCircle, IconUserPlus } from "@tabler/icons-react"
import { Link } from "@/i18n/routing"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export default function AcceptInvitationCallbackPage() {
    const router = useRouter()
    const t = useTranslations("team.acceptInvitation")
    const [status, setStatus] = useState<"processing" | "success" | "error">("processing")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        acceptInvitation()
    }, [])

    async function acceptInvitation() {
        try {
            // Get the token from sessionStorage
            const token = sessionStorage.getItem("pendingInvitationToken")

            if (!token) {
                setStatus("error")
                setError(t("invalidTitle"))
                return
            }

            // Clear the stored token
            sessionStorage.removeItem("pendingInvitationToken")

            // Accept the invitation
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
                } else {
                    setError(result.error?.message || t("error"))
                }
                setStatus("error")
                return
            }

            setStatus("success")

            // Redirect to messages page after a short delay
            setTimeout(() => {
                router.replace("/messages")
            }, 2000)
        } catch (err) {
            setStatus("error")
            setError(t("error"))
        }
    }

    if (status === "processing") {
        return (
            <div className="space-y-6" data-auth-content>
                <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4">
                        <IconLoader2 className="h-12 w-12 animate-spin text-primary" />
                        <p className="text-muted-foreground">{t("submitting")}</p>
                    </div>
                </Card>
            </div>
        )
    }

    if (status === "error") {
        return (
            <div className="space-y-6" data-auth-content>
                <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
                    <div className="flex flex-col items-center gap-4 text-center">
                        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
                            <IconAlertCircle className="h-8 w-8 text-destructive" />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">{t("error")}</h1>
                            <p className="mt-2 text-muted-foreground">{error}</p>
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
    return (
        <div className="space-y-6" data-auth-content>
            <Card className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm">
                <div className="flex flex-col items-center gap-4 text-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                        <IconUserPlus className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold">{t("linkedSuccess")}</h1>
                        <p className="mt-2 text-muted-foreground">{t("linkedSuccessDesc")}</p>
                    </div>
                </div>
            </Card>
        </div>
    )
}
