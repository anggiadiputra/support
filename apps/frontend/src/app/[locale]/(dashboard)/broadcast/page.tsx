"use client"

import { useSearchParams, useRouter, usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { IconBroadcast, IconPlayerPlay, IconHistory, IconAlertTriangle, IconPlugConnected } from "@tabler/icons-react"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { WhatsAppPhoneSelector } from "@/components/whatsapp-phone-selector"
import { RoleGuard } from "@/components/auth/role-guard"
import { Link } from "@/i18n/routing"
import { ActiveJobs } from "./components/active-jobs"
import { BroadcastHistory } from "./components/broadcast-history"
import { BroadcastForm } from "./components/broadcast-form"

export default function BroadcastPage() {
  const t = useTranslations("broadcast")
  const { 
    phoneNumbers, 
    selectedPhoneNumberId,
    setSelectedPhoneNumberId,
    isLoading 
  } = useWhatsAppPhoneNumbers()

  // Tab navigation with URL params
  const searchParams = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const activeTab = searchParams.get("tab") || "create"

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("tab", value)
    router.push(`${pathname}?${params.toString()}`)
  }

  // Check if WABA is connected (same approach as templates page)
  const isConnected = phoneNumbers.length > 0

  if (isLoading) {
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
        <div className="mb-2 flex flex-col justify-between gap-4 md:flex-row md:items-center md:gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">
              {t("title")}
            </h2>
            <p className="text-muted-foreground">
              {t("description")}
            </p>
          </div>
          {/* Phone Number Filter */}
          {isConnected && (
            <WhatsAppPhoneSelector
              phoneNumbers={phoneNumbers}
              selectedId={selectedPhoneNumberId}
              onSelect={setSelectedPhoneNumberId}
            />
          )}
        </div>

        {/* WABA Not Connected Warning */}
        {!isConnected && (
          <Alert variant="destructive">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertTitle>{t("wabaNotConnected.title")}</AlertTitle>
            <AlertDescription className="flex flex-col gap-2">
              <span>{t("wabaNotConnected.description")}</span>
              <Link href="/waba">
                <Button variant="outline" size="sm" className="w-fit gap-2">
                  <IconPlugConnected className="h-4 w-4" />
                  {t("wabaNotConnected.connectButton")}
                </Button>
              </Link>
            </AlertDescription>
          </Alert>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="create" className="gap-2" disabled={!isConnected}>
              <IconBroadcast className="h-4 w-4" />
              <span className="hidden sm:inline">{t("tabs.create")}</span>
            </TabsTrigger>
            <TabsTrigger value="active" className="gap-2">
              <IconPlayerPlay className="h-4 w-4" />
              <span className="hidden sm:inline">{t("tabs.active")}</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="gap-2">
              <IconHistory className="h-4 w-4" />
              <span className="hidden sm:inline">{t("tabs.history")}</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="mt-4">
            {isConnected ? (
              <Card>
                <CardHeader>
                  <CardTitle>{t("createBroadcast.title")}</CardTitle>
                  <CardDescription>{t("createBroadcast.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <BroadcastForm selectedPhoneNumberId={selectedPhoneNumberId} />
                </CardContent>
              </Card>
            ) : (
              <Card className="border-dashed">
                <CardContent className="flex flex-col items-center justify-center py-16">
                  <IconBroadcast className="text-muted-foreground mb-4 h-12 w-12" />
                  <h3 className="mb-2 text-lg font-semibold">{t("wabaNotConnected.title")}</h3>
                  <p className="text-muted-foreground mb-4 text-center text-sm">
                    {t("wabaNotConnected.description")}
                  </p>
                  <Link href="/waba">
                    <Button size="sm">
                      <IconPlugConnected className="h-4 w-4" />
                      {t("wabaNotConnected.connectButton")}
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="active" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("activeJobs.title")}</CardTitle>
                <CardDescription>{t("activeJobs.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <ActiveJobs />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{t("history.title")}</CardTitle>
                <CardDescription>{t("history.description")}</CardDescription>
              </CardHeader>
              <CardContent>
                <BroadcastHistory />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </RoleGuard>
  )
}
