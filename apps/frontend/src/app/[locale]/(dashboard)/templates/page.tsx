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
      <div className="space-y-4 p-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">
            {t("title")}
          </h2>
          <p className="text-muted-foreground">
            Create and manage WhatsApp message templates for your business
          </p>
        </div>
        <div className="flex items-center justify-end gap-2">
          <WhatsAppPhoneSelector
            phoneNumbers={phoneNumbers}
            selectedId={selectedPhoneNumberId}
            onSelect={setSelectedPhoneNumberId}
          />
          <div className="h-6 w-px bg-border" />
          <TemplatesPrimaryActions
            phoneNumbers={phoneNumbers}
            selectedWhatsappAccountId={selectedWhatsappAccountId}
          />
        </div>

        {templates.length === 0 && !isLoading ? (
          <Card className="border-dashed">
            <CardContent className="flex flex-col items-center justify-center py-16">
              <IconTemplate className="text-muted-foreground mb-4 h-12 w-12" />
              <h3 className="mb-2 text-lg font-semibold">No templates yet</h3>
              <p className="text-muted-foreground mb-4 text-center text-sm">
                Create your first WhatsApp message template to start sending
                messages
              </p>
              <TemplatesPrimaryActions
                phoneNumbers={phoneNumbers}
                selectedWhatsappAccountId={selectedWhatsappAccountId}
              />
            </CardContent>
          </Card>
        ) : (
          <div className="flex-1">
            <TemplatesTable data={templates} columns={columns} />
          </div>
        )}
      </div>
    </RoleGuard>
  )
}
