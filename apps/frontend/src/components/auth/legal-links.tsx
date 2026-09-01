"use client"

import { useBranding } from "@/hooks/use-branding"

interface LegalLinksProps {
  termsLabel: string
  privacyLabel: string
  prefix?: string
  conjunction?: string
  suffix?: string
}

/**
 * Client component for legal links that uses branding settings
 * Links to external URLs configured in admin dashboard
 */
export function LegalLinks({
  termsLabel,
  privacyLabel,
  prefix,
  conjunction = "&",
  suffix = ".",
}: LegalLinksProps) {
  const { termsUrl, privacyUrl } = useBranding()

  return (
    <p className="text-muted-foreground px-8 text-xs">
      {prefix}{" "}
      <a
        href={termsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-primary transition-all underline underline-offset-4"
      >
        {termsLabel}
      </a>{" "}
      {conjunction}{" "}
      <a
        href={privacyUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-primary transition-all underline underline-offset-4"
      >
        {privacyLabel}
      </a>
      {suffix}
    </p>
  )
}
