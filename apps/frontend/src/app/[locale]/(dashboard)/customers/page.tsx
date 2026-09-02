"use client"

import { Header } from "@/components/layout/header"
import { columns } from "./components/customers-columns"
import { CustomersPrimaryActions } from "./components/customers-primary-actions"
import { CustomersTable } from "./components/customers-table"
import { CustomerStats } from "./components/customer-stats"
import { Customer } from "./data/schema"
import { Card, CardContent } from "@/components/ui/card"
import { IconUsers } from "@tabler/icons-react"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { CustomerViewDrawer } from "./components/customer-view-drawer"
import { CustomersMutateDrawer } from "./components/customers-mutate-drawer"
import { useCustomers } from "@/hooks/use-customers"
import { useState } from "react"
import { useTranslations } from "next-intl"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { WhatsAppPhoneSelector } from "@/components/whatsapp-phone-selector"

export default function CustomersPage() {
  const { userId, isLoading: isLoadingAccount } = useBusinessAccount()
  const t = useTranslations("customers")
  const {
    phoneNumbers,
    selectedPhoneNumberId,
    setSelectedPhoneNumberId,
  } = useWhatsAppPhoneNumbers()

  // Use TanStack Query for customers data with caching
  // Requirements: 4.1, 4.3, 4.4
  const { data: customersData = [], isLoading: customersLoading, isFetching } = useCustomers(
    selectedPhoneNumberId ? { whatsappPhoneNumberId: selectedPhoneNumberId } : undefined,
    !isLoadingAccount && !!userId
  )

  // Transform data to match frontend schema
  const customers: Customer[] = customersData.map((customer: any) => {
    const channels: string[] = []
    if (customer.phoneNumber) channels.push('whatsapp')
    if (customer.instagramUsername) channels.push('instagram')
    if (customer.messengerConversations && customer.messengerConversations.length > 0) channels.push('messenger')

    return {
      ...customer,
      channels,
      consentStatus: typeof customer.consentStatus === 'boolean'
        ? (customer.consentStatus ? 'CONSENTED' : 'NOT_CONSENTED')
        : customer.consentStatus
    }
  })

  // Drawer states
  const [viewDrawerOpen, setViewDrawerOpen] = useState(false)
  const [editDrawerOpen, setEditDrawerOpen] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)

  const loading = isLoadingAccount || customersLoading

  const handleViewCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setViewDrawerOpen(true)
  }

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer)
    setEditDrawerOpen(true)
  }

  // Show loading skeleton only on initial load, not on background refetch
  if (loading && customers.length === 0) {
    return (
      <>
        <Header />
        <div className="space-y-4 p-4">
          <div className="animate-pulse space-y-4">
            <div className="bg-muted h-8 w-48 rounded"></div>
            <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-muted h-20 rounded"></div>
              ))}
            </div>
            <div className="bg-muted h-64 w-full rounded"></div>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="p-5 md:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              {t("title")}
              {isFetching && !loading && (
                <span className="ml-2 text-xs text-gray-400 font-normal animate-pulse">
                  {t("updating")}
                </span>
              )}
            </h2>
            <p className="text-sm text-gray-500">
              {t("description")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <WhatsAppPhoneSelector
              phoneNumbers={phoneNumbers}
              selectedId={selectedPhoneNumberId}
              onSelect={setSelectedPhoneNumberId}
            />
            <div className="h-6 w-px bg-gray-200" />
            <CustomersPrimaryActions />
          </div>
        </div>

        {/* Stats Cards - filtered by selected phone number */}
        <CustomerStats 
          enabled={!isLoadingAccount && !!userId} 
          whatsappPhoneNumberId={selectedPhoneNumberId}
        />

        {customers.length === 0 && !loading ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 p-12 text-center flex flex-col items-center justify-center">
            <div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <IconUsers className="text-gray-400 h-7 w-7" />
            </div>
            <h3 className="text-base font-bold text-gray-900 mb-1">{t("noCustomers")}</h3>
            <p className="text-sm text-gray-500 max-w-sm mb-6">
              {t("noCustomersDescription")}
            </p>
            <CustomersPrimaryActions />
          </div>
        ) : (
          <div className="flex-1">
            <CustomersTable
              data={customers}
              columns={columns}
              onView={handleViewCustomer}
              onEdit={handleEditCustomer}
            />
          </div>
        )}
      </div>

      {/* Drawers */}
      <CustomerViewDrawer
        open={viewDrawerOpen}
        onOpenChange={setViewDrawerOpen}
        customer={selectedCustomer}
      />
      <CustomersMutateDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        currentRow={selectedCustomer || undefined}
      />
    </>
  )
}
