"use client"

import { useState, useEffect } from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconDeviceFloppy, IconAlertCircle, IconCircleCheck } from "@tabler/icons-react"
import {
  useAffiliateSettings,
  useUpdateAffiliateSettings,
} from "@/app/[locale]/admin/hooks/use-admin-affiliate"

export function AffiliateSettingsForm() {
  // Form state
  const [isEnabled, setIsEnabled] = useState(false)
  const [holdingPeriodDays, setHoldingPeriodDays] = useState(14)
  const [commissionPercentage, setCommissionPercentage] = useState(10)
  const [referredUserBonusEnabled, setReferredUserBonusEnabled] = useState(false)
  const [referredUserBonusAmount, setReferredUserBonusAmount] = useState(0)

  // Query and mutation
  const { data: settings, isLoading, isError, error } = useAffiliateSettings()
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
    min: number = 0
  ) => {
    const num = parseInt(value, 10)
    if (!isNaN(num) && num >= min) {
      setter(num)
    } else if (value === "") {
      setter(min)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Settings</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </CardContent>
      </Card>
    )
  }

  if (isError) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Affiliate Settings</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>
              {error instanceof Error ? error.message : "Failed to load settings"}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Affiliate Settings</CardTitle>
        <CardDescription>
          Configure affiliate program settings for commission and referral bonuses
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
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

        {/* Enable Affiliate System */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="affiliate-enabled">Enable Affiliate System</Label>
            <p className="text-sm text-muted-foreground">
              Turn the affiliate program on or off
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

        <Separator />

        {/* Commission Settings */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Commission Settings</h4>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="commission-rate">Default Commission Rate</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="commission-rate"
                  type="number"
                  min={0}
                  max={100}
                  value={commissionPercentage}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10)
                    if (!isNaN(val) && val >= 0 && val <= 100) {
                      setCommissionPercentage(val)
                      setSaveResult(null)
                    }
                  }}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Commission percentage for affiliates (0-100)
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="holding-period">Holding Period</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="holding-period"
                  type="number"
                  min={0}
                  value={holdingPeriodDays}
                  onChange={(e) => {
                    handleNumberChange(e.target.value, setHoldingPeriodDays, 0)
                    setSaveResult(null)
                  }}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">days</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Days before commission is credited to affiliate
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Referred User Bonus */}
        <div className="space-y-4">
          <h4 className="text-sm font-medium">Referred User Bonus</h4>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="bonus-enabled">Enable Bonus</Label>
              <p className="text-sm text-muted-foreground">
                Give bonus credit to new users who sign up with referral code
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
                disabled={!referredUserBonusEnabled}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Credit amount given to referred users (in Rupiah)
            </p>
          </div>
        </div>

        <Separator />

        {/* Save Button */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={updateSettings.isPending}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {updateSettings.isPending ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
