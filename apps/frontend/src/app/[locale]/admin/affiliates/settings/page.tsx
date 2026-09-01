"use client"

import { useState, useEffect } from "react"
import { Link } from "@/i18n/routing"
import { Settings, RefreshCw } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { IconDeviceFloppy, IconAlertCircle, IconCircleCheck } from "@tabler/icons-react"
import {
  useAffiliateSettings,
  useUpdateAffiliateSettings,
} from "../../hooks/use-admin-affiliate"

export default function AffiliateSettingsPage() {
  // Form state
  const [isEnabled, setIsEnabled] = useState(false)
  const [holdingPeriodDays, setHoldingPeriodDays] = useState(14)
  const [commissionPercentage, setCommissionPercentage] = useState(10)
  const [referredUserBonusEnabled, setReferredUserBonusEnabled] = useState(false)
  const [referredUserBonusAmount, setReferredUserBonusAmount] = useState(0)

  // Query and mutation
  const { data: settings, isLoading, isError, error, refetch, isFetching } = useAffiliateSettings()
  const updateSettings = useUpdateAffiliateSettings()

  // Save result state
  const [saveResult, setSaveResult] = useState<{
    success: boolean
    message: string
  } | null>(null)

  // Initialize form from fetched settings
  useEffect(() => {
    if (settings) {
      setIsEnabled(settings.isEnabled)
      setHoldingPeriodDays(settings.holdingPeriodDays)
      setCommissionPercentage(settings.commissionPercentage)
      setReferredUserBonusEnabled(settings.referredUserBonusEnabled)
      setReferredUserBonusAmount(settings.referredUserBonusAmount)
    }
  }, [settings])

  const handleSave = async () => {
    setSaveResult(null)

    // Validation
    if (commissionPercentage < 1 || commissionPercentage > 100) {
      setSaveResult({
        success: false,
        message: "Commission rate must be between 1% and 100%",
      })
      return
    }

    if (holdingPeriodDays < 1 || holdingPeriodDays > 90) {
      setSaveResult({
        success: false,
        message: "Holding period must be between 1 and 90 days",
      })
      return
    }

    if (referredUserBonusEnabled && referredUserBonusAmount < 0) {
      setSaveResult({
        success: false,
        message: "Bonus amount cannot be negative",
      })
      return
    }

    try {
      await updateSettings.mutateAsync({
        isEnabled,
        holdingPeriodDays,
        commissionPercentage,
        referredUserBonusEnabled,
        referredUserBonusAmount,
      })

      setSaveResult({
        success: true,
        message: "Affiliate settings saved successfully",
      })
    } catch (err) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "Failed to save settings",
      })
    }
  }

  // Validate number inputs
  const handleNumberChange = (
    value: string,
    setter: (val: number) => void,
    min: number = 0,
    max?: number
  ) => {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= min && (max === undefined || num <= max)) {
      setter(num)
    } else if (value === "") {
      setter(min)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {/* Header skeleton */}
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-4 w-80" />
        </div>

        {/* Cards skeleton */}
        <div className="grid gap-6">
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-4 w-48" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-4 w-56" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-4 w-64" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-2">
          <Breadcrumb>
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admin">Admin</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link href="/admin/affiliates">Affiliates</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>
          <h2 className="text-2xl font-bold tracking-tight">Affiliate Settings</h2>
        </div>

        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error instanceof Error ? error.message : "Failed to load settings"}
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex flex-col gap-2">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admin">Admin</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/admin/affiliates">Affiliates</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Settings</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Affiliate Settings</h2>
            <p className="text-muted-foreground">
              Configure affiliate program settings for commission and referral bonuses
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Save Result Alert */}
      {saveResult && (
        <Alert variant={saveResult.success ? "default" : "destructive"}>
          {saveResult.success ? (
            <IconCircleCheck className="h-4 w-4" />
          ) : (
            <IconAlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{saveResult.message}</AlertDescription>
        </Alert>
      )}

      {/* Settings Cards */}
      <div className="grid gap-6">
        {/* General Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              General
            </CardTitle>
            <CardDescription>
              Enable or disable the affiliate system
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="affiliate-enabled">Enable Affiliate System</Label>
                <p className="text-sm text-muted-foreground">
                  Allow users to register as affiliates
                </p>
              </div>
              <Switch
                id="affiliate-enabled"
                checked={isEnabled}
                onCheckedChange={(checked) => {
                  setIsEnabled(checked)
                  setSaveResult(null)
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Commission Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Commission Settings</CardTitle>
            <CardDescription>
              Configure default commission rate and holding period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Default Commission Rate */}
            <div className="space-y-2">
              <Label htmlFor="commission-rate">Default Commission Rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commission-rate"
                  type="number"
                  min={1}
                  max={100}
                  value={commissionPercentage}
                  onChange={(e) => {
                    handleNumberChange(e.target.value, setCommissionPercentage, 1, 100)
                    setSaveResult(null)
                  }}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Commission percentage for affiliates (1-100%)
              </p>
            </div>

            <Separator />

            {/* Holding Period */}
            <div className="space-y-2">
              <Label htmlFor="holding-period">Holding Period</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="holding-period"
                  type="number"
                  min={1}
                  max={90}
                  value={holdingPeriodDays}
                  onChange={(e) => {
                    handleNumberChange(e.target.value, setHoldingPeriodDays, 1, 90)
                    setSaveResult(null)
                  }}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Commission will be credited after this period (1-90 days)
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Referred User Bonus */}
        <Card>
          <CardHeader>
            <CardTitle>Referred User Bonus</CardTitle>
            <CardDescription>
              Give bonus credit to new users who sign up with a referral code
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable Bonus Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="bonus-enabled">Enable Bonus</Label>
                <p className="text-sm text-muted-foreground">
                  Give bonus credit to new referred users
                </p>
              </div>
              <Switch
                id="bonus-enabled"
                checked={referredUserBonusEnabled}
                onCheckedChange={(checked) => {
                  setReferredUserBonusEnabled(checked)
                  setSaveResult(null)
                }}
              />
            </div>

            {/* Bonus Amount - only visible when enabled */}
            {referredUserBonusEnabled && (
              <>
                <Separator />
                <div className="space-y-2">
                  <Label htmlFor="bonus-amount">Bonus Amount</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Rp</span>
                    <Input
                      id="bonus-amount"
                      type="number"
                      min={0}
                      value={referredUserBonusAmount}
                      onChange={(e) => {
                        handleNumberChange(e.target.value, setReferredUserBonusAmount, 0)
                        setSaveResult(null)
                      }}
                      className="w-32"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Credit amount given to referred users (in Rupiah)
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button
          onClick={handleSave}
          disabled={updateSettings.isPending}
          size="lg"
        >
          <IconDeviceFloppy className="mr-2 h-4 w-4" />
          {updateSettings.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  )
}
