"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { SensitiveInput } from "./sensitive-input"
import { useAdminSettings } from "../../hooks/use-admin-settings"
import {
  IconRefresh,
  IconMail,
  IconDeviceFloppy,
  IconAlertCircle,
  IconCircleCheck,
  IconInfoCircle,
  IconAlertTriangle,
} from "@tabler/icons-react"

interface SmtpSettings {
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
  secure: boolean
}

const defaultSettings: SmtpSettings = {
  host: "",
  port: 587,
  user: "",
  password: "",
  fromEmail: "",
  fromName: "",
  secure: false,
}

export function SmtpSettingsForm() {
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
  } = useAdminSettings<SmtpSettings>("smtp")

  const [formData, setFormData] = useState<SmtpSettings>(defaultSettings)
  const [testEmail, setTestEmail] = useState("")
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)

  useEffect(() => {
    if (settings) {
      setFormData({
        ...settings,
        port: typeof settings.port === "string" ? parseInt(settings.port, 10) : settings.port,
      })
    }
  }, [settings])

  const handleChange = (field: keyof SmtpSettings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = field === "port" ? parseInt(e.target.value, 10) || 0 : e.target.value
    setFormData((prev) => ({ ...prev, [field]: value }))
    setSaveResult(null)
  }

  const handleSecureChange = (checked: boolean) => {
    setFormData((prev) => ({ ...prev, secure: checked }))
    setSaveResult(null)
  }

  const handleSave = async () => {
    setSaveResult(null)
    setTestResult(null)
    const result = await updateSettings(formData)
    setSaveResult(result)
  }

  const handleTest = async () => {
    if (!testEmail) {
      setTestResult({ success: false, message: "Please enter a test email address" })
      return
    }
    setTestResult(null)
    const result = await testConnection(testEmail)
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

  // Check if settings are incomplete
  const isIncomplete = !formData.host || !formData.port || !formData.fromEmail

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Email / SMTP Configuration</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 7 }).map((_, i) => (
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
        <CardTitle>Email / SMTP Configuration</CardTitle>
        <CardDescription>
          Configure SMTP settings for sending emails
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Warning banner when settings incomplete */}
        {isIncomplete && (
          <Alert variant="destructive">
            <IconAlertTriangle className="h-4 w-4" />
            <AlertDescription>
              SMTP settings are incomplete. Email functionality is disabled until Host, Port, and From Email are configured.
            </AlertDescription>
          </Alert>
        )}

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
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="host">SMTP Host</Label>
              <Input
                id="host"
                value={formData.host}
                onChange={handleChange("host")}
                placeholder="smtp.example.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="port">Port</Label>
              <Input
                id="port"
                type="number"
                value={formData.port}
                onChange={handleChange("port")}
                placeholder="587"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="user">Username</Label>
              <Input
                id="user"
                value={formData.user}
                onChange={handleChange("user")}
                placeholder="smtp-user@example.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <SensitiveInput
                id="password"
                value={formData.password}
                onChange={handleChange("password")}
                placeholder="Enter SMTP password"
                isMasked={formData.password?.includes("****")}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid gap-2">
              <Label htmlFor="fromEmail">From Email</Label>
              <Input
                id="fromEmail"
                type="email"
                value={formData.fromEmail}
                onChange={handleChange("fromEmail")}
                placeholder="noreply@example.com"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="fromName">From Name</Label>
              <Input
                id="fromName"
                value={formData.fromName}
                onChange={handleChange("fromName")}
                placeholder="My App"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Switch
              id="secure"
              checked={formData.secure}
              onCheckedChange={handleSecureChange}
            />
            <Label htmlFor="secure">Use TLS/SSL (Secure)</Label>
          </div>
        </div>

        {/* Test Email Section */}
        <div className="border-t pt-4">
          <Label className="text-sm font-medium">Send Test Email</Label>
          <div className="mt-2 flex gap-2">
            <Input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="test@example.com"
              className="flex-1"
            />
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || isUpdating || !testEmail}
            >
              <IconMail className="mr-2 h-4 w-4" />
              {isTesting ? "Sending..." : "Send Test"}
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
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
