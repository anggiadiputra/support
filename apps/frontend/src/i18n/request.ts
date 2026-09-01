import { getRequestConfig } from "next-intl/server"
import enAdmin from "../../messages/en/admin.json"
import enAffiliate from "../../messages/en/affiliate.json"
import enAuth from "../../messages/en/auth.json"
import enBroadcast from "../../messages/en/broadcast.json"
// Static imports for all message files - required for Cloudflare Workers compatibility
// Dynamic imports with template literals don't work reliably in bundled Workers environment
import enCommon from "../../messages/en/common.json"
import enCredit from "../../messages/en/credit.json"
import enCrmSettings from "../../messages/en/crmSettings.json"
import enCustomers from "../../messages/en/customers.json"
import enDashboard from "../../messages/en/dashboard.json"
import enErrors from "../../messages/en/errors.json"
import enHelpSupport from "../../messages/en/helpSupport.json"
import enInsights from "../../messages/en/insights.json"
import enLanguage from "../../messages/en/language.json"
import enLegal from "../../messages/en/legal.json"
import enMessages from "../../messages/en/messages.json"
import enNavigation from "../../messages/en/navigation.json"
import enPayment from "../../messages/en/payment.json"
import enPrivacy from "../../messages/en/privacy.json"
import enSettings from "../../messages/en/settings.json"
import enSubscription from "../../messages/en/subscription.json"
import enTeam from "../../messages/en/team.json"
import enTemplates from "../../messages/en/templates.json"
import enTerms from "../../messages/en/terms.json"
import enValidation from "../../messages/en/validation.json"
import enWaba from "../../messages/en/waba.json"
import enWabaHealth from "../../messages/en/wabaHealth.json"
import enWhatsappErrors from "../../messages/en/whatsappErrors.json"
import idAdmin from "../../messages/id/admin.json"
import idAffiliate from "../../messages/id/affiliate.json"
import idAuth from "../../messages/id/auth.json"
import idBroadcast from "../../messages/id/broadcast.json"
import idCommon from "../../messages/id/common.json"
import idCredit from "../../messages/id/credit.json"
import idCrmSettings from "../../messages/id/crmSettings.json"
import idCustomers from "../../messages/id/customers.json"
import idDashboard from "../../messages/id/dashboard.json"
import idErrors from "../../messages/id/errors.json"
import idHelpSupport from "../../messages/id/helpSupport.json"
import idInsights from "../../messages/id/insights.json"
import idLanguage from "../../messages/id/language.json"
import idLegal from "../../messages/id/legal.json"
import idMessages from "../../messages/id/messages.json"
import idNavigation from "../../messages/id/navigation.json"
import idPayment from "../../messages/id/payment.json"
import idPrivacy from "../../messages/id/privacy.json"
import idSettings from "../../messages/id/settings.json"
import idSubscription from "../../messages/id/subscription.json"
import idTeam from "../../messages/id/team.json"
import idTemplates from "../../messages/id/templates.json"
import idTerms from "../../messages/id/terms.json"
import idValidation from "../../messages/id/validation.json"
import idWaba from "../../messages/id/waba.json"
import idWabaHealth from "../../messages/id/wabaHealth.json"
import idWhatsappErrors from "../../messages/id/whatsappErrors.json"
import { locales, defaultLocale, Locale } from "./config"

// Pre-built message objects for each locale
const messagesByLocale: Record<string, Record<string, unknown>> = {
  en: {
    common: enCommon,
    navigation: enNavigation,
    auth: enAuth,
    validation: enValidation,
    errors: enErrors,
    dashboard: enDashboard,
    subscription: enSubscription,
    admin: enAdmin,
    settings: enSettings,
    messages: enMessages,
    customers: enCustomers,
    templates: enTemplates,
    language: enLanguage,
    payment: enPayment,
    helpSupport: enHelpSupport,
    team: enTeam,
    privacy: enPrivacy,
    terms: enTerms,
    broadcast: enBroadcast,
    insights: enInsights,
    waba: enWaba,
    wabaHealth: enWabaHealth,
    legal: enLegal,
    whatsappErrors: enWhatsappErrors,
    credit: enCredit,
    affiliate: enAffiliate,
    crmSettings: enCrmSettings,
  },
  id: {
    common: idCommon,
    navigation: idNavigation,
    auth: idAuth,
    validation: idValidation,
    errors: idErrors,
    dashboard: idDashboard,
    subscription: idSubscription,
    admin: idAdmin,
    settings: idSettings,
    messages: idMessages,
    customers: idCustomers,
    templates: idTemplates,
    language: idLanguage,
    payment: idPayment,
    helpSupport: idHelpSupport,
    team: idTeam,
    privacy: idPrivacy,
    terms: idTerms,
    broadcast: idBroadcast,
    insights: idInsights,
    waba: idWaba,
    wabaHealth: idWabaHealth,
    legal: idLegal,
    whatsappErrors: idWhatsappErrors,
    credit: idCredit,
    affiliate: idAffiliate,
    crmSettings: idCrmSettings,
  },
}

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale

  // Validate that the incoming locale is valid
  if (!locale || !locales.includes(locale as Locale)) {
    locale = defaultLocale
  }

  // Get pre-loaded messages for the locale
  const messages = messagesByLocale[locale] || messagesByLocale[defaultLocale]

  return {
    locale,
    messages,
  }
})
