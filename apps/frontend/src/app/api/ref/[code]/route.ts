/**
 * Route Handler for setting referral cookie and redirecting.
 * Cookies can only be set in Route Handlers or Server Actions.
 */

import { cookies } from "next/headers"
import { NextRequest, NextResponse } from "next/server"

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params
  const { searchParams } = request.nextUrl
  const token = searchParams.get("token")
  const locale = searchParams.get("locale") || "en"

  if (token) {
    const cookieStore = await cookies()
    cookieStore.set("referral_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 24 * 60 * 60,
      path: "/",
    })
  }

  return NextResponse.redirect(
    `${APP_URL}/${locale}/register?ref=${code.toUpperCase()}`
  )
}
