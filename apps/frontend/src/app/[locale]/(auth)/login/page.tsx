import { getTranslations } from "next-intl/server"
import { Link } from "@/i18n/routing"
import { setRequestLocale } from "next-intl/server"
import { Card } from "@/components/ui/card"
import { UserAuthForm } from "./components/user-auth-form"
import { BrandingPageTitle } from "@/components/branding-page-title"
import { LegalLinks } from "@/components/auth/legal-links"

interface Props {
  params: Promise<{ locale: string }>
}

export default async function LoginPage({ params }: Props) {
  const { locale } = await params
  setRequestLocale(locale)

  const t = await getTranslations("auth")

  return (
    <div className="space-y-6" data-auth-content>
      <BrandingPageTitle suffix={t("login")} />
      <Card
        className="border-border/50 bg-card/50 p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl"
        data-auth-card
      >
        <div className="flex flex-col space-y-3 text-left">
          <h1 className="text-3xl font-bold tracking-tight">
            {t("welcomeBack")}
          </h1>
          <p className="text-muted-foreground text-base">
            {t("enterCredentials")}
          </p>
        </div>
        <UserAuthForm />
      </Card>

      {/* Troubleshooting notice */}
      <div className="rounded-md border border-amber-200/50 bg-amber-50/50 px-3 py-2 text-center dark:border-amber-900/50 dark:bg-amber-950/30">
        <p className="text-xs text-amber-700 dark:text-amber-400">
          💡 {t("loginTroubleshoot", { defaultValue: "Login issues? Try Ctrl+Shift+R (hard refresh) or clear browser cache/storage." })}
        </p>
      </div>

      {/* Additional links */}
      <div className="flex flex-col space-y-4 text-center">
        <p className="text-muted-foreground text-sm">
          {t("noAccount")}{" "}
          <Link
            href="/register"
            className="font-semibold text-primary transition-all hover:underline"
          >
            {t("registerNow")}
          </Link>
        </p>
        <LegalLinks
          prefix={t("termsAgreement")}
          termsLabel={t("termsOfService")}
          conjunction={t("and")}
          privacyLabel={t("privacyPolicy")}
          suffix="."
        />
      </div>
    </div>
  )
}
