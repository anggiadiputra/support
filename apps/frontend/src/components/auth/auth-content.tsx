"use client"

import { ReactNode } from "react"
import Image from "next/image"
import { MascotProvider } from "@/components/auth/mascot-context"
import { EyeTrackingMascot } from "@/components/auth/eye-tracking-mascot"
import { useBranding } from "@/hooks/use-branding"

interface AuthContentProps {
    children: ReactNode
    appName: string
    subtitle: string
}

export function AuthContent({ children, appName, subtitle }: AuthContentProps) {
    const { websiteName, logoUrl, isLoading } = useBranding()
    
    // Use branding websiteName if available, fallback to appName prop
    const displayName = websiteName || appName

    return (
        <MascotProvider>
            <div className="flex min-h-svh w-full items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/5">
                <div className="mx-auto w-full max-w-md space-y-8 px-4 py-12 sm:px-6 lg:px-8">
                    <div className="flex flex-col items-center justify-center space-y-3">
                        {logoUrl ? (
                            <Image
                                src={logoUrl}
                                alt={displayName}
                                width={80}
                                height={80}
                                className="h-20 w-auto object-contain"
                                priority
                            />
                        ) : (
                            <EyeTrackingMascot />
                        )}
                        <div className="text-center">
                            <h1 className="text-2xl font-bold tracking-tight">
                                {isLoading ? appName : displayName}
                            </h1>
                            <p className="text-muted-foreground mt-1 text-sm">
                                {subtitle}
                            </p>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </MascotProvider>
    )
}
