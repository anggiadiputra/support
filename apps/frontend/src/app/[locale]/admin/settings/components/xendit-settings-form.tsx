"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
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

interface XenditSettings {
  enabled: boolean
  secretKey: string
  publicKey: string
  webhookToken: string
  environment: "sandbox" | "production"
}

const defaultSettings: XenditSettings = {
  enabled: false,
  secretKey: "",
  publicKey: "",
  webhookToken: "",
  environment: "sandbox",
}

export function XenditSettingsForm() {
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
  } = useAdminSettings<XenditSettings>("xendit")

  const [formData, setFormData] = useState<XenditSettings>(defaultSettings)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (settings) {
      setFormData(settings)
    }
  }, [settings])

  const handleSensitiveChange = (field: keyof XenditSettings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }))
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
          <CardTitle>Xendit Payment Gateway</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
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
        <CardTitle>Xendit Payment Gateway</CardTitle>
        <CardDescription>
          Configure Xendit credentials for QRIS and Virtual Account payments
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
              id="xendit-enabled"
              checked={formData.enabled}
              onCheckedChange={handleEnabledChange}
            />
            <Label htmlFor="xendit-enabled">Enable Xendit Payment Gateway</Label>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="xendit-environment">Environment</Label>
            <Select
              value={formData.environment}
              onValueChange={handleEnvironmentChange}
              disabled={!formData.enabled}
            >
              <SelectTrigger id="xendit-environment">
                <SelectValue placeholder="Select environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox (Testing)</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="xendit-secretKey">Secret Key</Label>
            <SensitiveInput
              id="xendit-secretKey"
              value={formData.secretKey}
              onChange={handleSensitiveChange("secretKey")}
              placeholder="xnd_development_..."
              isMasked={formData.secretKey?.includes("****")}
              disabled={!formData.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Your Xendit secret API key (starts with xnd_development_ or xnd_production_)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="xendit-publicKey">Public Key</Label>
            <SensitiveInput
              id="xendit-publicKey"
              value={formData.publicKey}
              onChange={handleSensitiveChange("publicKey")}
              placeholder="xnd_public_development_..."
              isMasked={formData.publicKey?.includes("****")}
              disabled={!formData.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Your Xendit public API key (starts with xnd_public_development_ or xnd_public_production_)
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="xendit-webhookToken">Webhook Verification Token</Label>
            <SensitiveInput
              id="xendit-webhookToken"
              value={formData.webhookToken}
              onChange={handleSensitiveChange("webhookToken")}
              placeholder="Your webhook verification token"
              isMasked={formData.webhookToken?.includes("****")}
              disabled={!formData.enabled}
            />
            <p className="text-xs text-muted-foreground">
              Token used to verify webhook callbacks from Xendit
            </p>
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
