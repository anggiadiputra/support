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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Save, AlertCircle } from "lucide-react"
import { IconBrandWhatsapp } from "@tabler/icons-react"
import type { AIConfig, WorkingHours, DaySchedule } from "@/lib/api/ai-api"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"
import { useToast } from "@/hooks/use-toast"
import { useAIConfig, useUpdateAIConfig } from "@/hooks/use-ai"

interface WorkingHoursSettingsProps {
  initialConfig: AIConfig
  phoneNumbers: WhatsAppPhoneNumberOption[]
}

const TIMEZONES = [
  { value: "Asia/Jakarta", label: "WIB - Jakarta (UTC+7)" },
  { value: "Asia/Makassar", label: "WITA - Makassar (UTC+8)" },
  { value: "Asia/Jayapura", label: "WIT - Jayapura (UTC+9)" },
  { value: "Asia/Singapore", label: "Singapore (UTC+8)" },
  { value: "Asia/Kuala_Lumpur", label: "Kuala Lumpur (UTC+8)" },
  { value: "Asia/Bangkok", label: "Bangkok (UTC+7)" },
  { value: "Asia/Ho_Chi_Minh", label: "Ho Chi Minh (UTC+7)" },
  { value: "Asia/Manila", label: "Manila (UTC+8)" },
  { value: "Asia/Tokyo", label: "Tokyo (UTC+9)" },
  { value: "Asia/Seoul", label: "Seoul (UTC+9)" },
  { value: "Asia/Shanghai", label: "Shanghai (UTC+8)" },
  { value: "Asia/Hong_Kong", label: "Hong Kong (UTC+8)" },
  { value: "Asia/Kolkata", label: "Kolkata (UTC+5:30)" },
  { value: "Asia/Dubai", label: "Dubai (UTC+4)" },
  { value: "Europe/London", label: "London (UTC+0/+1)" },
  { value: "Europe/Paris", label: "Paris (UTC+1/+2)" },
  { value: "Europe/Berlin", label: "Berlin (UTC+1/+2)" },
  { value: "America/New_York", label: "New York (UTC-5/-4)" },
  { value: "America/Los_Angeles", label: "Los Angeles (UTC-8/-7)" },
  { value: "Australia/Sydney", label: "Sydney (UTC+10/+11)" },
]

const DAYS = [
  { key: "monday", label: "Monday" },
  { key: "tuesday", label: "Tuesday" },
  { key: "wednesday", label: "Wednesday" },
  { key: "thursday", label: "Thursday" },
  { key: "friday", label: "Friday" },
  { key: "saturday", label: "Saturday" },
  { key: "sunday", label: "Sunday" },
] as const

type DayKey = (typeof DAYS)[number]["key"]

const DEFAULT_SCHEDULE: DaySchedule = { start: "09:00", end: "17:00" }

export function WorkingHoursSettings({
  initialConfig,
  phoneNumbers,
}: WorkingHoursSettingsProps) {
  const { toast } = useToast()
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [timezone, setTimezone] = useState("Asia/Jakarta")
  const [workingHoursEnabled, setWorkingHoursEnabled] = useState(false)
  const [workingHours, setWorkingHours] = useState<WorkingHours>({})
  const updateConfig = useUpdateAIConfig()

  // Fetch config for selected WhatsApp account
  const { data: accountConfigData, isLoading: isLoadingAccountConfig } = useAIConfig(
    selectedAccountId || undefined,
    !!selectedAccountId
  )

  // Update local state when account config is loaded
  useEffect(() => {
    if (accountConfigData?.data) {
      setTimezone(accountConfigData.data.timezone || "Asia/Jakarta")
      const wh = accountConfigData.data.workingHours
      // Check if working hours is enabled (not null and has at least one day with schedule)
      const hasWorkingHours = wh && typeof wh === 'object' && Object.values(wh).some(v => v !== null)
      setWorkingHoursEnabled(!!hasWorkingHours)
      setWorkingHours(wh || {})
    } else if (!selectedAccountId) {
      // Reset to defaults when no account selected
      setTimezone("Asia/Jakarta")
      setWorkingHoursEnabled(false)
      setWorkingHours({})
    }
  }, [accountConfigData, selectedAccountId])

  const isDayEnabled = (day: DayKey): boolean => {
    return workingHours[day] !== null && workingHours[day] !== undefined
  }

  const getDaySchedule = (day: DayKey): DaySchedule => {
    return workingHours[day] || DEFAULT_SCHEDULE
  }

  const toggleDay = (day: DayKey) => {
    if (isDayEnabled(day)) {
      setWorkingHours({ ...workingHours, [day]: null })
    } else {
      setWorkingHours({ ...workingHours, [day]: { ...DEFAULT_SCHEDULE } })
    }
  }

  const updateDayTime = (
    day: DayKey,
    field: "start" | "end",
    value: string
  ) => {
    const currentSchedule = getDaySchedule(day)
    setWorkingHours({
      ...workingHours,
      [day]: { ...currentSchedule, [field]: value },
    })
  }

  const handleSave = () => {
    if (!selectedAccountId) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Please select a WhatsApp number first",
      })
      return
    }

    // If working hours disabled, save null to make AI always available
    const dataToSave = workingHoursEnabled 
      ? { timezone, workingHours } 
      : { timezone, workingHours: null }

    updateConfig.mutate(
      { data: dataToSave, wabaId: selectedAccountId },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: workingHoursEnabled 
              ? "Working hours settings saved successfully"
              : "Working hours disabled - AI will respond 24/7",
          })
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Failed to save settings",
          })
        },
      }
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Working Hours</CardTitle>
        <CardDescription>
          AI only responds during these hours. Outside working hours, messages
          will not be auto-replied.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* WhatsApp Number Selector */}
        <div className="space-y-2">
          <Label>WhatsApp Number</Label>
          {phoneNumbers.length === 0 ? (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                No WhatsApp numbers connected. Connect a WhatsApp number first to configure working hours.
              </AlertDescription>
            </Alert>
          ) : (
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="w-full sm:w-[350px]">
                <SelectValue placeholder="Select WhatsApp number..." />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((pn) => (
                  <SelectItem key={pn.whatsappAccountId} value={pn.whatsappAccountId}>
                    <div className="flex items-center gap-2">
                      <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                      {pn.displayPhoneNumber}
                      {pn.verifiedName && (
                        <span className="text-muted-foreground">({pn.verifiedName})</span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {selectedAccountId && isLoadingAccountConfig && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading settings...
          </div>
        )}

        {selectedAccountId && !isLoadingAccountConfig && (
          <>
            {/* Enable/Disable Working Hours */}
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div className="space-y-0.5">
                <Label className="text-base">Enable Working Hours</Label>
                <p className="text-sm text-muted-foreground">
                  {workingHoursEnabled 
                    ? "AI only responds during configured hours"
                    : "AI responds 24/7 (always available)"}
                </p>
              </div>
              <Switch
                checked={workingHoursEnabled}
                onCheckedChange={setWorkingHoursEnabled}
              />
            </div>

            {workingHoursEnabled && (
              <>
                <div className="space-y-2">
                  <Label>Timezone</Label>
                  <Select value={timezone} onValueChange={setTimezone}>
                    <SelectTrigger className="w-full sm:w-[300px]">
                      <SelectValue placeholder="Select timezone..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-3">
                  {DAYS.map(({ key, label }) => (
                <div
                  key={key}
                  className="flex flex-wrap items-center gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-2 w-32">
                    <Switch
                      checked={isDayEnabled(key)}
                      onCheckedChange={() => toggleDay(key)}
                    />
                    <Label className="text-sm font-medium">{label}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={isDayEnabled(key) ? getDaySchedule(key).start : ""}
                      onChange={(e) => updateDayTime(key, "start", e.target.value)}
                      disabled={!isDayEnabled(key)}
                      className="w-[120px]"
                    />
                    <span className="text-muted-foreground">-</span>
                    <Input
                      type="time"
                      value={isDayEnabled(key) ? getDaySchedule(key).end : ""}
                      onChange={(e) => updateDayTime(key, "end", e.target.value)}
                      disabled={!isDayEnabled(key)}
                      className="w-[120px]"
                    />
                  </div>
                  </div>
                ))}
                </div>
              </>
            )}

            <div className="flex justify-end">
              <Button size="sm" onClick={handleSave} disabled={updateConfig.isPending}>
                {updateConfig.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
