/**
 * Referral Link Handler
 *
 * Validates referral code and redirects to the route handler
 * which sets the cookie then redirects to register.
 */

import { redirect } from "next/navigation"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface Props {
  params: Promise<{ locale: string; code: string }>
}

interface ValidateResponse {
  valid: boolean
  affiliateName?: string
  signedToken?: string
}

async function validateReferralCode(code: string): Promise<ValidateResponse> {
  try {
    const response = await fetch(
      `${API_URL}/api/v1/affiliate/validate/${code}`,
      {
        method: "GET",
        cache: "no-store",
      }
    )

    const result = await response.json()

    if (!result.success) {
      return { valid: false }
    }

    return {
      valid: result.data.valid,
      affiliateName: result.data.affiliateName,
      signedToken: result.data.signedToken,
    }
  } catch {
    return { valid: false }
  }
}

export default async function ReferralPage({ params }: Props) {
  const { locale, code } = await params

  const validation = await validateReferralCode(code)

  if (validation.valid && validation.signedToken) {
    redirect(
      `/api/ref/${code}?token=${encodeURIComponent(validation.signedToken)}&locale=${locale}`
    )
  }

  redirect(`/${locale}/register`)
}

export async function generateMetadata({ params }: Props) {
  const { code } = await params

  return {
    title: "Join via Referral - Messaging Platform",
    description: `You've been invited to join Messaging Platform with referral code ${code}`,
  }
}
