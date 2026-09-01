"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SensitiveInput } from "./sensitive-input"
import { useAdminSettings } from "../../hooks/use-admin-settings"
import {
  IconRefresh,
  IconPlugConnected,
  IconDeviceFloppy,
  IconAlertCircle,
  IconCircleCheck,
  IconInfoCircle,
} from "@tabler/icons-react"

interface DuitkuSettings {
  merchantCode: string
  apiKey: string
  enabled: boolean
  environment: "sandbox" | "production"
  litePriceMonthly: number
  proPriceMonthly: number
}

const defaultSettings: DuitkuSettings = {
  merchantCode: "",
  apiKey: "",
  enabled: false,
  environment: "sandbox",
  litePriceMonthly: 99000,
  proPriceMonthly: 299000,
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("id-ID").format(value)
}

export function DuitkuSettingsForm() {
  const {
    settings,
    source,
    isLoading,
    error,
    updateSettings,
    testConnection,
    resetToDefault,
    isUpdating,
    isTesting,
    isResetting,
  } = useAdminSettings<DuitkuSettings>("duitku")


  const [formData, setFormData] = useState<DuitkuSettings>(defaultSettings)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        litePriceMonthly: Number(settings.litePriceMonthly) || defaultSettings.litePriceMonthly,
        proPriceMonthly: Number(settings.proPriceMonthly) || defaultSettings.proPriceMonthly,
      })
    }
  }, [settings])

  const handleChange = (field: keyof DuitkuSettings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = field === "litePriceMonthly" || field === "proPriceMonthly"
      ? parseInt(e.target.value.replace(/\D/g, ""), 10) || 0
      : e.target.value
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSaveResult(null)
  }

  const handleEnabledChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, enabled: checked }))
    setSaveResult(null)
  }

  const handleEnvironmentChange = (value: "sandbox" | "production") => {
    setFormData((prev) => ({ ...prev, environment: value }))
    setSaveResult(null)
  }

  const handleSave = async () => {
    setSaveResult(null)
    setTestResult(null)
    const result = await updateSettings(formData)
    setSaveResult(result)
  }

  const handleTest = async () => {
    setTestResult(null)
    const result = await testConnection()
    setTestResult(result)
  }

  const handleReset = async () => {
    setSaveResult(null)
    setTestResult(null)
    const result = await resetToDefault()
    if (result.success) {
      setSaveResult({ success: true, message: "Settings reset to .env defaults" })
    } else {
      setSaveResult(result)
    }
  }

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Duitku Payment Gateway</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Duitku Payment Gateway</CardTitle>
        <CardDescription>
          Configure Duitku credentials for QRIS and ShopeePay payments
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {source && (
          <Alert variant={source === "database" ? "default" : "destructive"}>
            <IconInfoCircle className="h-4 w-4" />
            <AlertDescription>
              {source === "database"
                ? "Settings loaded from database"
                : "Settings loaded from .env (database unavailable or empty)"}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <IconAlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {testResult && (
          <Alert variant={testResult.success ? "default" : "destructive"}>
            {testResult.success ? (
              <IconCircleCheck className="h-4 w-4" />
            ) : (
              <IconAlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{testResult.message}</AlertDescription>
          </Alert>
        )}

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

        <div className="grid gap-4">
          <div className="flex items-center space-x-2">
            <Switch
              id="enabled"
              checked={formData.enabled}
              onCheckedChange={handleEnabledChange}
            />
            <Label htmlFor="enabled">Enable Payment Gateway</Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="environment">Environment</Label>
            <Select
              value={formData.environment}
              onValueChange={handleEnvironmentChange}
              disabled={!formData.enabled}
            >
              <SelectTrigger id="environment">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="merchantCode">Merchant Code (X-PARTNER-ID)</Label>
            <Input
              id="merchantCode"
              value={formData.merchantCode}
              onChange={handleChange("merchantCode")}
              placeholder="DXXXXX"
              disabled={!formData.enabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="apiKey">API Key</Label>
            <SensitiveInput
              id="apiKey"
              value={formData.apiKey}
              onChange={handleChange("apiKey")}
              placeholder="Your Duitku API Key"
              isMasked={formData.apiKey?.includes("****")}
              disabled={!formData.enabled}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="litePriceMonthly">LITE Plan Price (IDR/month)</Label>
              <Input
                id="litePriceMonthly"
                type="text"
                value={formatCurrency(formData.litePriceMonthly)}
                onChange={handleChange("litePriceMonthly")}
                placeholder="99000"
                disabled={!formData.enabled}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="proPriceMonthly">PRO Plan Price (IDR/month)</Label>
              <Input
                id="proPriceMonthly"
                type="text"
                value={formatCurrency(formData.proPriceMonthly)}
                onChange={handleChange("proPriceMonthly")}
                placeholder="299000"
                disabled={!formData.enabled}
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            onClick={handleTest}
            disabled={isTesting || isUpdating || !formData.enabled}
          >
            <IconPlugConnected className="mr-2 h-4 w-4" />
            {isTesting ? "Testing..." : "Test Connection"}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={isResetting || isUpdating}
          >
            <IconRefresh className="mr-2 h-4 w-4" />
            {isResetting ? "Resetting..." : "Reset to Default"}
          </Button>
          <Button onClick={handleSave} disabled={isUpdating}>
            <IconDeviceFloppy className="mr-2 h-4 w-4" />
            {isUpdating ? "Saving..." : "Save Changes"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
