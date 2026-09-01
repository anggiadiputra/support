declare module "better-auth/types" {
  interface User {
    role?: string | null
    whatsappAccountCount?: number
    hasConnectedWhatsApp?: boolean
    subscription?: {
      tier: "FREE" | "LITE" | "PRO"
      status: string
      endDate: Date | null
    }
  }
}

export {}
