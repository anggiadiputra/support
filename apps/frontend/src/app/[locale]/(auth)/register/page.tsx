import { useTranslations } from "next-intl"
import { Link } from "@/i18n/routing"
import { Card } from "@/components/ui/card"
import { RegisterForm } from "./components/register-form"
import { BrandingPageTitle } from "@/components/branding-page-title"
import { LegalLinks } from "@/components/auth/legal-links"

export default function RegisterPage() {
  const t = useTranslations("auth")

  return (
    <div className="space-y-6" data-auth-content>
      <BrandingPageTitle suffix={t("register")} />
      <Card
        className="border-border/50 bg-card/50 p-5 sm:p-8 shadow-xl backdrop-blur-sm transition-all hover:shadow-2xl"
        data-auth-card
      >
        <div className="mb-6 flex flex-col space-y-3 text-left">
          <h1 className="text-3xl font-bold tracking-tight">
            {t("createAccount")}
          </h1>
          <p className="text-muted-foreground text-base">
            {t("createAccountDesc")}
          </p>
        </div>

        <RegisterForm />
      </Card>

      {/* Additional links */}
      <div className="flex flex-col space-y-4 text-center">
        <p className="text-muted-foreground text-sm">
          {t("hasAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-primary transition-all hover:underline"
          >
            {t("loginNow")}
          </Link>
        </p>
        <LegalLinks
          prefix={t("registerTermsAgreement")}
          termsLabel={t("termsOfService")}
          conjunction={t("and")}
          privacyLabel={t("privacyPolicy")}
          suffix={` ${t("our")}.`}
        />
      </div>
    </div>
  )
}
