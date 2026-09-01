import * as React from "react"
import { useTranslation } from "react-i18next"
import i18n from "@/i18n/i18n"

type TranslationValues = Record<string, string | number | boolean | Date | undefined | null>

export function useTranslations(namespace?: string) {
  const { t: i18nT } = useTranslation(namespace || "common")

  const t = React.useCallback(
    (key: string, values?: TranslationValues): string => {
      let result: string
      if (values) {
        result = i18nT(key, values as Record<string, unknown>)
      } else {
        result = i18nT(key)
      }

      if (result === key && namespace && namespace !== "common") {
        return i18n.t(key, { ns: "common", ...(values || {}) })
      }
      return result
    },
    [i18nT, namespace]
  ) as {
    (key: string, values?: TranslationValues): string
    raw: (key: string) => unknown
    rich: (key: string, values?: Record<string, unknown>) => React.ReactNode
    markup: (key: string, values?: Record<string, unknown>) => string
  }

  t.raw = (key: string) => {
    return i18n.getResource(i18n.language, namespace || "common", key)
  }

  t.rich = (key: string, values?: Record<string, unknown>) => {
    return i18nT(key, values)
  }

  t.markup = (key: string, values?: Record<string, unknown>) => {
    return i18nT(key, values)
  }

  return t
}

export function useLocale(): "id" | "en" {
  const { i18n: instance } = useTranslation()
  const lang = instance.language || "id"
  return lang.startsWith("en") ? "en" : "id"
}

export function useNow(): Date {
  return new Date()
}

export function useTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Jakarta"
}

export function NextIntlClientProvider({ children }: { children: React.ReactNode; [key: string]: unknown }) {
  return <>{children}</>
}

// Server functions compatibility in client SPA
export async function getTranslations(
  opts?: string | { locale?: string; namespace?: string }
) {
  const namespace = typeof opts === "string" ? opts : opts?.namespace || "common"
  const lang = (typeof opts === "object" && opts.locale) || i18n.language || "id"

  const t = (key: string, values?: TranslationValues) => {
    return i18n.t(key, { lng: lang, ns: namespace, ...(values || {}) })
  }

  t.raw = (key: string) => i18n.getResource(lang, namespace, key)
  return t
}

export function setRequestLocale(_locale: string) {
  // No-op on SPA
}

export function getRequestConfig(fn: (params: { requestLocale: Promise<string> }) => unknown) {
  return fn
}

export async function getMessages(opts?: { locale?: string }) {
  const lang = opts?.locale || i18n.language || "id"
  return i18n.getResourceBundle(lang, "common") || {}
}

export async function getLocale() {
  return i18n.language || "id"
}
