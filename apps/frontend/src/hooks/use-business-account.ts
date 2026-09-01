import { useCachedSession } from "@/hooks/use-cached-session"

// Extended user type with custom properties
type ExtendedUser = {
    id: string
    email: string
    name: string
    image?: string | null
    role?: string | null
    whatsappAccountCount?: number
    hasConnectedWhatsApp?: boolean
    [key: string]: any
}

/**
 * Custom hook to get user and WhatsApp account information from session.
 * WhatsApp credentials are now managed per-account via WhatsAppAccount model.
 *
 * Uses cached session to prevent blocking navigation on route changes.
 * Session is cached with React Query and only refetched when stale.
 */
export function useBusinessAccount() {
    const { data: session, isPending } = useCachedSession()
    const user = session?.user as ExtendedUser | undefined

    return {
        // User info
        userId: user?.id || null,
        userEmail: user?.email || null,
        userName: user?.name || null,
        userImage: user?.image || null,
        userRole: user?.role || null,

        // WhatsApp account info (multi-number architecture)
        whatsappAccountCount: user?.whatsappAccountCount ?? 0,
        hasConnectedWhatsApp: user?.hasConnectedWhatsApp ?? false,

        // Loading states
        isLoading: isPending,
        isAuthenticated: !!user,

        // Full session for advanced use
        session
    }
}

/**
 * Type guard to ensure at least one WhatsApp account is connected
 */
export function requireWhatsApp(hasConnectedWhatsApp: boolean): asserts hasConnectedWhatsApp is true {
    if (!hasConnectedWhatsApp) {
        throw new Error('No WhatsApp Business Account connected. Please connect your WABA first.')
    }
}
