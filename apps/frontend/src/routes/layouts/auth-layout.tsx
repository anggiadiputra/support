import { Outlet } from "react-router-dom"
import { AuthContent } from "@/components/auth/auth-content"
import { useTranslations } from "@/lib/compat/next-intl"

export function AuthLayout() {
  const t = useTranslations("common")
  const subtitle = t("appSubtitle")
  const appName = import.meta.env.VITE_APP_NAME || "Whoops"

  return (
    <AuthContent appName={appName} subtitle={subtitle}>
      <Outlet />
    </AuthContent>
  )
}

export default AuthLayout
