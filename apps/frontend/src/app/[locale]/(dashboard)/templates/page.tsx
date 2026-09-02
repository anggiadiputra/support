"use client"

import { useTranslations } from "next-intl"
import { Header } from "@/components/layout/header"
import { columns } from "./components/templates-columns"
import { TemplatesPrimaryActions } from "./components/templates-primary-actions"
import { TemplatesTable } from "./components/templates-table"
import { Card, CardContent } from "@/components/ui/card"
import { IconTemplate } from "@tabler/icons-react"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { RoleGuard } from "@/components/auth/role-guard"
import { useTemplates } from "@/hooks/use-templates"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { WhatsAppPhoneSelector } from "@/components/whatsapp-phone-selector"

export default function TemplatesPage() {
  const t = useTranslations("templates")
  const { userId, isLoading: isLoadingAccount } = useBusinessAccount()
  const {
    phoneNumbers,
    selectedPhoneNumberId,
    selectedWhatsappAccountId,
    setSelectedPhoneNumberId,
  } = useWhatsAppPhoneNumbers()

  // Use TanStack Query for templates data with caching
  // Requirements: 3.1, 3.3
  const {
    data: templates = [],
    isLoading,
    isFetching
  } = useTemplates(
    selectedWhatsappAccountId ? { whatsappAccountId: selectedWhatsappAccountId } : undefined,
    !isLoadingAccount && !!userId
  )

  // Show loading skeleton only on initial load, not on background refetch
  // Requirements: 2.3 - Background refetch without loading spinner
  const showLoadingSkeleton = isLoading || isLoadingAccount

  if (showLoadingSkeleton) {
    return (
      <>
        <Header />
        <div className="space-y-4 p-4">
          <div className="animate-pulse space-y-4">
            <div className="bg-muted h-8 w-48 rounded"></div>
            <div className="bg-muted h-64 w-full rounded"></div>
          </div>
        </div>
      </>
    )
  }

  return (
    <RoleGuard>
      <Header />
      <div className="p-5 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              {t("title")}
              {isFetching && !isLoading && (
                <span className="ml-2 text-xs text-gray-400 font-normal animate-pulse">
                  Updating...
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500">
              Create and manage WhatsApp message templates for your business
            </p>
          </div>
          <div className="flex items-center gap-2">
            <WhatsAppPhoneSelector
              phoneNumbers={phoneNumbers}
              selectedId={selectedPhoneNumberId}
              onSelect={setSelectedPhoneNumberId}
            />
            <div className="h-6 w-px bg-gray-200" />
            <TemplatesPrimaryActions
              phoneNumbers={phoneNumbers}
              selectedWhatsappAccountId={selectedWhatsappAccountId}
            />
          </div>
        </div>

        {templates.length === 0 && !isLoading ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <IconTemplate className="text-gray-400 h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">No templates yet</h3>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
              Create your first WhatsApp message template to start sending messages
            </p>
            <TemplatesPrimaryActions
              phoneNumbers={phoneNumbers}
              selectedWhatsappAccountId={selectedWhatsappAccountId}
            />
          </div>
        ) : (
          <div className="flex-1">
            <TemplatesTable data={templates} columns={columns} />
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
