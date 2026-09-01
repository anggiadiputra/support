import { getTranslations, setRequestLocale } from "next-intl/server"
import { AuthContent } from "@/components/auth/auth-content"

interface Props {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}

export default async function AuthLayout({ children, params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations({ locale, namespace: "common" })
  const subtitle = t("appSubtitle")
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"

  return (
    <AuthContent appName={appName} subtitle={subtitle}>
      {children}
    </AuthContent>
  )
}
