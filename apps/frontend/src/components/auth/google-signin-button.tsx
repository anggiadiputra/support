"use client"

import { Button } from "@/components/ui/button"
import { useToast } from "@/hooks/use-toast"
import { authClient } from "@/lib/auth-client"
import { useState } from "react"
import { useLocale } from "next-intl"

export function GoogleSignInButton() {
    const [isLoading, setIsLoading] = useState(false)
    const { toast } = useToast()
    const locale = useLocale()

    const handleGoogleSignIn = async () => {
        try {
            setIsLoading(true)

            // Use absolute URL for callback since frontend and backend are different origins
            const frontendUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'

            await authClient.signIn.social({
                provider: "google",
                callbackURL: `${frontendUrl}/${locale}/dashboard`,  // Absolute URL with locale
            })

            // Note: User will be redirected to Google OAuth
            // so code below may not execute
        } catch (error) {
            console.error("Google sign-in error:", error)
            toast({
                variant: "destructive",
                title: "Login Failed",
                description: "Failed to sign in with Google. Please try again.",
            })
            setIsLoading(false)
        }
    }

    return (
        <Button
            type="button"
            variant="outline"
            className="h-11 w-full font-medium transition-all hover:bg-accent/50"
            onClick={handleGoogleSignIn}
            disabled={isLoading}
        >
            {isLoading ? (
                <div className="flex items-center gap-2">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    <span>Menghubungkan...</span>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <svg className="h-5 w-5" viewBox="0 0 24 24">
                        <path
                            fill="#4285F4"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                            fill="#34A853"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                            fill="#FBBC05"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                        />
                        <path
                            fill="#EA4335"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                    </svg>
                    <span>Lanjutkan dengan Google</span>
                </div>
            )}
        </Button>
    )
}
