"use client"

import { useRef, useState } from "react"
import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { RefreshCw, Users, Package } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { SubscriptionManagementContent } from "./components/management-content"
import { SubscriptionPlansContent } from "./components/plans-content"

export default function AdminSubscriptionsPage() {
  const t = useTranslations("admin")
  const tCommon = useTranslations("common")
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()

  // Get active tab from URL, default to "management"
  const activeTab = searchParams.get("tab") || "management"

  // State to track refresh
  const [isRefreshing, setIsRefreshing] = useState(false)
  const refreshTriggerRef = useRef(0)

  // Handle tab change and update URL
  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Handle refresh - increment trigger to force child components to refresh
  const handleRefresh = () => {
    setIsRefreshing(true)
    refreshTriggerRef.current += 1
    // Reset refreshing state after a short delay
    setTimeout(() => setIsRefreshing(false), 500)
  }

  return (
    <div className="p-5 md:p-8 space-y-6">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
            {t("subscriptions")}
          </h1>
          <p className="text-sm text-gray-500">
            {t("subscriptionsDesc")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="w-full sm:w-auto rounded-lg border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? "animate-spin" : ""}`} />
          {tCommon("refresh")}
        </Button>
      </div>

      {/* Tab Navigation */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
        <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-flex">
          <TabsTrigger value="management" className="gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">{t("managementTab")}</span>
          </TabsTrigger>
          <TabsTrigger value="plans" className="gap-2">
            <Package className="h-4 w-4" />
            <span className="hidden sm:inline">{t("plansTab")}</span>
          </TabsTrigger>
        </TabsList>

        {/* Management Tab Content */}
        <TabsContent value="management" className="mt-6">
          <SubscriptionManagementContent key={`management-${refreshTriggerRef.current}`} />
        </TabsContent>

        {/* Plans Tab Content */}
        <TabsContent value="plans" className="mt-6">
          <SubscriptionPlansContent key={`plans-${refreshTriggerRef.current}`} />
        </TabsContent>
      </Tabs>
    </div>
  )
}
