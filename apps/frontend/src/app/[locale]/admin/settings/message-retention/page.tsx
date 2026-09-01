"use client"

import { useState, useEffect, useCallback } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  IconDeviceFloppy,
  IconAlertCircle,
  IconCircleCheck,
  IconInfoCircle,
  IconTrash,
  IconCalendar,
  IconPlayerPlay,
  IconBell,
  IconSend,
  IconEye,
} from "@tabler/icons-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface MessageRetentionSettings {
  enabled: boolean
  enabledAt: string | null
}

export default function MessageRetentionSettingsPage() {
  const [settings, setSettings] = useState<MessageRetentionSettings>({
    enabled: false,
    enabledAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [runResult, setRunResult] = useState<{ success: boolean; message: string; data?: { totalDeleted: number; usersAffected: number } } | null>(null)
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined)

  // Test notification state
  const [testUserId, setTestUserId] = useState("")
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)

  // Preview state
  const [isLoadingPreview, setIsLoadingPreview] = useState(false)
  const [previewData, setPreviewData] = useState<{
    enabled: boolean
    enabledAt?: string
    now?: string
    summary?: {
      usersWithMessages: number
      usersWithDeletions: number
      totalMessagesToDelete: number
    }
    preview?: Array<{
      userId: string
      email: string
      name: string
      tier: string
      tierCode?: string
      retentionDays: number | null
      retentionLabel?: string
      totalMessages: number
      toDeleteGrandfathered: number
      toDeleteTierBased: number
      totalToDelete: number
      cutoffDates?: {
        grandfathered: string
        tierBased: string | null
      }
      messageDates?: {
        oldest: string | null
        newest: string | null
      }
    }>
    message?: string
  } | null>(null)

  // Fetch message retention settings
  const fetchSettings = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/message-retention`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access these settings")
        }
        throw new Error("Failed to fetch message retention settings")
      }

      const result = await response.json()

      if (result.success && result.data) {
        const data = result.data as MessageRetentionSettings
        setSettings(data)
        if (data.enabledAt) {
          setSelectedDate(new Date(data.enabledAt))
        }
      } else {
        throw new Error(result.error?.message || "Failed to fetch settings")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleToggleChange = (checked: boolean) => {
    setSettings((prev) => ({ ...prev, enabled: checked }))
    setSaveResult(null)

    // If enabling and no date selected, default to today
    if (checked && !selectedDate) {
      setSelectedDate(new Date())
    }
  }

  const handleDateSelect = (date: Date | undefined) => {
    setSelectedDate(date)
    setSaveResult(null)
  }

  const handleSave = async () => {
    // Validate: if enabled, must have a date
    if (settings.enabled && !selectedDate) {
      setSaveResult({
        success: false,
        message: "Please select an activation date when enabling the policy",
      })
      return
    }

    try {
      setIsSaving(true)
      setSaveResult(null)

      const payload = {
        enabled: settings.enabled,
        enabledAt: settings.enabled && selectedDate ? selectedDate.toISOString() : null,
      }

      const response = await fetch(`${API_URL}/api/v1/admin/settings/message-retention`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        setSaveResult({
          success: false,
          message: result.error?.message || "Failed to save settings",
        })
        return
      }

      // Refetch to get the latest values
      await fetchSettings()

      setSaveResult({
        success: true,
        message: result.message || "Message retention settings saved successfully",
      })
    } catch (err) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handlePreview = async () => {
    try {
      setIsLoadingPreview(true)
      setPreviewData(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/message-retention/preview`, {
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        setPreviewData({
          enabled: false,
          message: result.error?.message || "Failed to load preview",
        })
        return
      }

      setPreviewData(result.data)
    } catch (err) {
      setPreviewData({
        enabled: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsLoadingPreview(false)
    }
  }

  const handleRunNow = async () => {
    try {
      setIsRunning(true)
      setRunResult(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/message-retention/run`, {
        method: "POST",
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        setRunResult({
          success: false,
          message: result.error?.message || "Failed to run retention job",
        })
        return
      }

      setRunResult({
        success: true,
        message: result.message || "Retention job completed",
        data: result.data,
      })
    } catch (err) {
      setRunResult({
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsRunning(false)
    }
  }

  const handleSendTestNotification = async () => {
    if (!testUserId.trim()) {
      setTestResult({
        success: false,
        message: "Please enter a user ID",
      })
      return
    }

    try {
      setIsSendingTest(true)
      setTestResult(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/message-retention/test-notification`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          userId: testUserId.trim(),
          messageCount: 10,
          daysUntilDeletion: 3,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setTestResult({
          success: false,
          message: result.error?.message || "Failed to send test notification",
        })
        return
      }

      setTestResult({
        success: true,
        message: result.message || "Test notification sent",
      })
      setTestUserId("")
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Message Retention</h1>
          <p className="text-muted-foreground">
            Configure tier-based message retention policy
          </p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-full" />
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Message Retention</h1>
        <p className="text-muted-foreground">
          Configure tier-based message retention policy
        </p>
      </div>

      {/* Settings Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconTrash className="h-5 w-5" />
            Tier-Based Message Retention
          </CardTitle>
          <CardDescription>
            Control how messages are retained based on subscription tier
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
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

          {/* Policy Info */}
          <Alert>
            <IconInfoCircle className="h-4 w-4" />
            <AlertDescription>
              <strong>How tier-based retention works:</strong>
              <ul className="mt-2 ml-4 list-disc space-y-1">
                <li><strong>Free tier:</strong> Messages are deleted after 7 days</li>
                <li><strong>Basic tier:</strong> Messages are deleted after 30 days</li>
                <li><strong>Lite tier:</strong> Messages are deleted after 90 days</li>
                <li><strong>Pro tier:</strong> Messages are retained indefinitely</li>
              </ul>
              <p className="mt-2 text-sm">
                When enabled, the retention policy will apply to messages created on or after the activation date.
                Existing messages before that date will not be affected.
              </p>
            </AlertDescription>
          </Alert>

          {/* Toggle Switch */}
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="retention-toggle" className="text-base font-medium">
                Enable Tier-Based Retention
              </Label>
              <p className="text-sm text-muted-foreground">
                When enabled, messages will be automatically deleted based on the user&apos;s subscription tier
              </p>
            </div>
            <Switch
              id="retention-toggle"
              checked={settings.enabled}
              onCheckedChange={handleToggleChange}
            />
          </div>

          {/* Date Picker - Only show when enabled */}
          {settings.enabled && (
            <div className="space-y-2">
              <Label>Activation Date</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-full justify-start text-left font-normal",
                      !selectedDate && "text-muted-foreground"
                    )}
                  >
                    <IconCalendar className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, "PPP") : "Select activation date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={selectedDate}
                    onSelect={handleDateSelect}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <p className="text-xs text-muted-foreground">
                The retention policy will only apply to messages created on or after this date.
                Select a future date to give users time to upgrade their plans if needed.
              </p>
            </div>
          )}

          {/* Current Status Display */}
          <div className="rounded-lg border bg-muted/30 p-4">
            <Label className="text-sm font-medium mb-3 block">Current Settings</Label>
            <div className="grid gap-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status:</span>
                <span className={settings.enabled ? "text-green-600 font-medium" : "text-muted-foreground"}>
                  {settings.enabled ? "Enabled" : "Disabled"}
                </span>
              </div>
              {settings.enabledAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Activation Date:</span>
                  <span className="font-medium">
                    {format(new Date(settings.enabledAt), "PPP")}
                  </span>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving}>
          <IconDeviceFloppy className="mr-2 h-4 w-4" />
          {isSaving ? "Saving..." : "Save Settings"}
        </Button>
      </div>

      {/* Manual Trigger Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconPlayerPlay className="h-5 w-5" />
            Manual Trigger
          </CardTitle>
          <CardDescription>
            Run the message retention job manually for testing purposes
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {runResult && (
            <Alert variant={runResult.success ? "default" : "destructive"}>
              {runResult.success ? (
                <IconCircleCheck className="h-4 w-4" />
              ) : (
                <IconAlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>
                {runResult.message}
                {runResult.data && runResult.data.totalDeleted > 0 && (
                  <div className="mt-2 text-sm">
                    <strong>Details:</strong>
                    <ul className="mt-1 ml-4 list-disc">
                      <li>Messages deleted: {runResult.data.totalDeleted}</li>
                      <li>Users affected: {runResult.data.usersAffected}</li>
                    </ul>
                  </div>
                )}
              </AlertDescription>
            </Alert>
          )}

          <Alert>
            <IconInfoCircle className="h-4 w-4" />
            <AlertDescription>
              The retention job normally runs automatically at 2:00 AM daily.
              Use Preview to see what would be deleted, then Run Now to execute.
            </AlertDescription>
          </Alert>

          <div className="flex gap-2">
            <Button
              onClick={handlePreview}
              disabled={isLoadingPreview || !settings.enabled}
              variant="outline"
            >
              <IconEye className="mr-2 h-4 w-4" />
              {isLoadingPreview ? "Loading..." : "Preview"}
            </Button>

            <Button
              onClick={handleRunNow}
              disabled={isRunning || !settings.enabled}
              variant="secondary"
            >
              <IconPlayerPlay className="mr-2 h-4 w-4" />
              {isRunning ? "Running..." : "Run Now"}
            </Button>
          </div>

          {!settings.enabled && (
            <p className="text-xs text-muted-foreground">
              Enable tier-based retention and save settings first before running.
            </p>
          )}

          {/* Preview Results */}
          {previewData && (
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconEye className="h-4 w-4" />
                <span className="font-medium">Preview Results</span>
              </div>

              {previewData.message && !previewData.summary && (
                <p className="text-sm text-muted-foreground">{previewData.message}</p>
              )}

              {previewData.summary && (
                <>
                  {/* Debug info */}
                  <div className="text-xs text-muted-foreground space-y-1 p-2 bg-background rounded border">
                    <p><strong>Debug Info:</strong></p>
                    <p>Now: {previewData.now ? format(new Date(previewData.now), "PPP HH:mm") : "N/A"}</p>
                    <p>Enabled At: {previewData.enabledAt ? format(new Date(previewData.enabledAt), "PPP HH:mm") : "N/A"}</p>
                    <p className="text-orange-600">
                      Messages before {previewData.enabledAt ? format(new Date(previewData.enabledAt), "PPP") : "N/A"} = grandfathered (30 days)
                    </p>
                    <p className="text-blue-600">
                      Messages after {previewData.enabledAt ? format(new Date(previewData.enabledAt), "PPP") : "N/A"} = tier-based (Free: 7d, Basic: 30d, Lite: 90d, Pro: indefinite)
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div className="text-center p-2 bg-background rounded">
                      <div className="text-2xl font-bold">{previewData.summary.usersWithMessages}</div>
                      <div className="text-xs text-muted-foreground">Users with messages</div>
                    </div>
                    <div className="text-center p-2 bg-background rounded">
                      <div className="text-2xl font-bold text-orange-500">{previewData.summary.usersWithDeletions}</div>
                      <div className="text-xs text-muted-foreground">Users affected</div>
                    </div>
                    <div className="text-center p-2 bg-background rounded">
                      <div className="text-2xl font-bold text-red-500">{previewData.summary.totalMessagesToDelete}</div>
                      <div className="text-xs text-muted-foreground">Messages to delete</div>
                    </div>
                  </div>

                  {previewData.preview && previewData.preview.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">All users with messages:</p>
                      <div className="max-h-64 overflow-y-auto space-y-1">
                        {previewData.preview.map((user) => (
                          <div key={user.userId} className="text-xs p-2 bg-background rounded border space-y-1">
                            <div className="flex justify-between items-center">
                              <div>
                                <span className="font-medium">{user.email || user.name || user.userId}</span>
                                <span className={cn(
                                  "ml-2 px-1.5 py-0.5 rounded text-muted-foreground",
                                  user.retentionDays === null ? "bg-purple-100 text-purple-700" : "bg-muted"
                                )}>
                                  {user.tier} ({user.retentionLabel || `${user.retentionDays}d`})
                                </span>
                              </div>
                              <div className="text-right">
                                <div className="text-muted-foreground">{user.totalMessages} total messages</div>
                              </div>
                            </div>
                            <div className="flex justify-between text-muted-foreground">
                              <div>
                                <span>Grandfathered (before enabledAt, &gt;30d): </span>
                                <span className={user.toDeleteGrandfathered > 0 ? "text-red-500 font-medium" : "text-green-600"}>
                                  {user.toDeleteGrandfathered}
                                </span>
                              </div>
                              <div>
                                {user.retentionDays !== null ? (
                                  <>
                                    <span>Tier-based (after enabledAt, &gt;{user.retentionDays}d): </span>
                                    <span className={user.toDeleteTierBased > 0 ? "text-red-500 font-medium" : "text-green-600"}>
                                      {user.toDeleteTierBased}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-purple-600 font-medium">Indefinite retention</span>
                                )}
                              </div>
                            </div>
                            {user.messageDates && (
                              <div className="text-blue-600 text-[10px] font-medium">
                                Messages: {user.messageDates.oldest ? format(new Date(user.messageDates.oldest), "PP") : "N/A"}
                                {" → "}
                                {user.messageDates.newest ? format(new Date(user.messageDates.newest), "PP") : "N/A"}
                              </div>
                            )}
                            {user.cutoffDates && (
                              <div className="text-muted-foreground/70 text-[10px]">
                                Cutoff: grandfathered &lt;= {format(new Date(user.cutoffDates.grandfathered), "PP")}
                                {user.cutoffDates.tierBased && (
                                  <> | tier-based &lt;= {format(new Date(user.cutoffDates.tierBased), "PP")}</>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {previewData.summary.totalMessagesToDelete === 0 && (
                    <p className="text-sm text-green-600">
                      No messages meet the deletion criteria. All messages are within retention period.
                    </p>
                  )}
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Test Notification Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconBell className="h-5 w-5" />
            Test Notification
          </CardTitle>
          <CardDescription>
            Send a test retention notification to a specific user
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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

          <div className="space-y-2">
            <Label htmlFor="test-user-id">User ID</Label>
            <Input
              id="test-user-id"
              placeholder="Enter user ID (e.g., cm5abc123...)"
              value={testUserId}
              onChange={(e) => setTestUserId(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              The user will receive a test notification saying &quot;10 messages will be deleted in 3 days&quot;
            </p>
          </div>

          <Button
            onClick={handleSendTestNotification}
            disabled={isSendingTest || !testUserId.trim()}
            variant="secondary"
          >
            <IconSend className="mr-2 h-4 w-4" />
            {isSendingTest ? "Sending..." : "Send Test Notification"}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
