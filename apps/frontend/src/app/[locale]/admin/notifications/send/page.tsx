"use client"

import { useState, useCallback } from "react"
import { Link, useRouter } from "@/i18n/routing"
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
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import {
  IconSend,
  IconBell,
  IconUser,
  IconUsers,
  IconUsersGroup,
  IconSearch,
  IconX,
  IconLoader2,
  IconAlertCircle,
} from "@tabler/icons-react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

interface User {
  id: string
  email: string
  name: string
  subscriptionTier: string
  role: string
}

const NOTIFICATION_TYPES = [
  { value: "SYSTEM_ANNOUNCEMENT", label: "System Announcement" },
  { value: "MAINTENANCE", label: "Maintenance" },
  { value: "PROMOTION", label: "Promotion" },
  { value: "CUSTOM", label: "Custom" },
]

const PRIORITIES = [
  { value: "LOW", label: "Low" },
  { value: "NORMAL", label: "Normal" },
  { value: "HIGH", label: "High" },
  { value: "URGENT", label: "Urgent" },
]

const TIERS = [
  { value: "FREE", label: "Free" },
  { value: "BASIC", label: "Basic" },
  { value: "LITE", label: "Lite" },
  { value: "PRO", label: "Pro" },
]

type RecipientType = "single" | "multiple" | "all" | "by_tier"

export default function SendNotificationPage() {
  const router = useRouter()
  const { toast } = useToast()

  // Recipient selection state
  const [recipientType, setRecipientType] = useState<RecipientType>("single")
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<User[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUsers, setSelectedUsers] = useState<User[]>([])
  const [selectedTiers, setSelectedTiers] = useState<string[]>([])
  const [allUsersCount, setAllUsersCount] = useState<number | null>(null)
  const [tierUsersCount, setTierUsersCount] = useState<number | null>(null)

  // Notification content state
  const [title, setTitle] = useState("")
  const [message, setMessage] = useState("")
  const [type, setType] = useState("CUSTOM")
  const [priority, setPriority] = useState("NORMAL")
  const [actionUrl, setActionUrl] = useState("")
  const [actionLabel, setActionLabel] = useState("")

  // UI state
  const [isSending, setIsSending] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Search users
  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query)
    if (!query.trim()) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/notifications/users/search?q=${encodeURIComponent(query)}&limit=10`,
        { credentials: "include" }
      )
      const result = await response.json()
      if (result.success) {
        setSearchResults(result.data.users)
      }
    } catch {
      // Ignore search errors
    } finally {
      setIsSearching(false)
    }
  }, [])

  // Fetch all users count
  const fetchAllUsersCount = useCallback(async () => {
    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/notifications/users/count?type=all`,
        { credentials: "include" }
      )
      const result = await response.json()
      if (result.success) {
        setAllUsersCount(result.data.count)
      }
    } catch {
      // Ignore errors
    }
  }, [])

  // Fetch tier users count
  const fetchTierUsersCount = useCallback(async (tiers: string[]) => {
    if (tiers.length === 0) {
      setTierUsersCount(null)
      return
    }

    try {
      const response = await fetch(
        `${API_URL}/api/v1/admin/notifications/users/count?type=by_tier&tiers=${tiers.join(",")}`,
        { credentials: "include" }
      )
      const result = await response.json()
      if (result.success) {
        setTierUsersCount(result.data.count)
      }
    } catch {
      // Ignore errors
    }
  }, [])

  // Handle recipient type change
  const handleRecipientTypeChange = (value: RecipientType) => {
    setRecipientType(value)
    setSelectedUsers([])
    setSelectedTiers([])
    setSearchQuery("")
    setSearchResults([])
    setAllUsersCount(null)
    setTierUsersCount(null)

    if (value === "all") {
      fetchAllUsersCount()
    }
  }

  // Handle tier selection
  const handleTierToggle = (tier: string) => {
    const newTiers = selectedTiers.includes(tier)
      ? selectedTiers.filter(t => t !== tier)
      : [...selectedTiers, tier]
    setSelectedTiers(newTiers)
    fetchTierUsersCount(newTiers)
  }

  // Add user to selection
  const handleSelectUser = (user: User) => {
    if (!selectedUsers.find(u => u.id === user.id)) {
      setSelectedUsers([...selectedUsers, user])
    }
    setSearchQuery("")
    setSearchResults([])
  }

  // Remove user from selection
  const handleRemoveUser = (userId: string) => {
    setSelectedUsers(selectedUsers.filter(u => u.id !== userId))
  }

  // Get recipient count for display
  const getRecipientCount = (): number => {
    switch (recipientType) {
      case "single":
      case "multiple":
        return selectedUsers.length
      case "all":
        return allUsersCount ?? 0
      case "by_tier":
        return tierUsersCount ?? 0
      default:
        return 0
    }
  }

  // Validate form
  const isFormValid = (): boolean => {
    if (!title.trim() || !message.trim()) return false

    switch (recipientType) {
      case "single":
        return selectedUsers.length === 1
      case "multiple":
        return selectedUsers.length > 0
      case "all":
        return allUsersCount !== null && allUsersCount > 0
      case "by_tier":
        return selectedTiers.length > 0 && tierUsersCount !== null && tierUsersCount > 0
      default:
        return false
    }
  }

  // Handle send
  const handleSend = async () => {
    setShowConfirm(false)
    setIsSending(true)
    setError(null)

    try {
      const payload = {
        recipients: {
          type: recipientType,
          ...(recipientType === "single" || recipientType === "multiple"
            ? { userIds: selectedUsers.map(u => u.id) }
            : {}),
          ...(recipientType === "by_tier" ? { tiers: selectedTiers } : {}),
        },
        notification: {
          title: title.trim(),
          message: message.trim(),
          type,
          priority,
          ...(actionUrl.trim() ? { actionUrl: actionUrl.trim() } : {}),
          ...(actionLabel.trim() ? { actionLabel: actionLabel.trim() } : {}),
        },
      }

      const response = await fetch(`${API_URL}/api/v1/admin/notifications/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error?.message || "Failed to send notification")
      }

      toast({
        title: "Notification Sent",
        description: result.message || `Notification sent to ${result.data.recipientCount} users`,
      })

      router.push("/admin/notifications/history")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send notification")
    } finally {
      setIsSending(false)
    }
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
                <Link href="/admin/notifications/history">Notifications</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Send New</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Send Notification</h2>
          <p className="text-muted-foreground">
            Send a notification to selected users
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recipient Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUsers className="h-5 w-5" />
              Recipient Selection
            </CardTitle>
            <CardDescription>
              Choose who should receive this notification
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup
              value={recipientType}
              onValueChange={(v) => handleRecipientTypeChange(v as RecipientType)}
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="single" id="single" />
                <Label htmlFor="single" className="flex items-center gap-2 cursor-pointer">
                  <IconUser className="h-4 w-4" />
                  Single User
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="multiple" id="multiple" />
                <Label htmlFor="multiple" className="flex items-center gap-2 cursor-pointer">
                  <IconUsers className="h-4 w-4" />
                  Multiple Users
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="flex items-center gap-2 cursor-pointer">
                  <IconUsersGroup className="h-4 w-4" />
                  All Users
                  {allUsersCount !== null && (
                    <Badge variant="secondary">{allUsersCount}</Badge>
                  )}
                </Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="by_tier" id="by_tier" />
                <Label htmlFor="by_tier" className="flex items-center gap-2 cursor-pointer">
                  <IconUsersGroup className="h-4 w-4" />
                  By Subscription Tier
                </Label>
              </div>
            </RadioGroup>

            {/* User Search (for single/multiple) */}
            {(recipientType === "single" || recipientType === "multiple") && (
              <div className="space-y-3">
                <div className="relative">
                  <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    placeholder="Search by email or name..."
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    className="pl-9"
                  />
                  {isSearching && (
                    <IconLoader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="rounded-md border max-h-40 overflow-y-auto">
                    {searchResults.map((user) => (
                      <button
                        key={user.id}
                        onClick={() => handleSelectUser(user)}
                        className="w-full px-3 py-2 text-left hover:bg-muted flex items-center justify-between text-sm"
                        disabled={selectedUsers.some(u => u.id === user.id)}
                      >
                        <div>
                          <div className="font-medium">{user.name || user.email}</div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                        <Badge variant="outline">{user.subscriptionTier}</Badge>
                      </button>
                    ))}
                  </div>
                )}

                {/* Selected Users */}
                {selectedUsers.length > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm">
                      Selected ({selectedUsers.length})
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {selectedUsers.map((user) => (
                        <Badge key={user.id} variant="secondary" className="gap-1">
                          {user.name || user.email}
                          <button
                            onClick={() => handleRemoveUser(user.id)}
                            className="ml-1 hover:text-destructive"
                          >
                            <IconX className="h-3 w-3" />
                          </button>
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tier Selection */}
            {recipientType === "by_tier" && (
              <div className="space-y-3">
                <Label>Select Tiers</Label>
                <div className="grid grid-cols-2 gap-2">
                  {TIERS.map((tier) => (
                    <div key={tier.value} className="flex items-center space-x-2">
                      <Checkbox
                        id={tier.value}
                        checked={selectedTiers.includes(tier.value)}
                        onCheckedChange={() => handleTierToggle(tier.value)}
                      />
                      <Label htmlFor={tier.value} className="cursor-pointer">
                        {tier.label}
                      </Label>
                    </div>
                  ))}
                </div>
                {tierUsersCount !== null && (
                  <p className="text-sm text-muted-foreground">
                    {tierUsersCount} users match selected tiers
                  </p>
                )}
              </div>
            )}

            {/* All Users Count */}
            {recipientType === "all" && allUsersCount !== null && (
              <p className="text-sm text-muted-foreground">
                Will send to {allUsersCount} active users
              </p>
            )}
          </CardContent>
        </Card>

        {/* Notification Content */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconBell className="h-5 w-5" />
              Notification Content
            </CardTitle>
            <CardDescription>
              Compose your notification message
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                placeholder="Notification title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-muted-foreground text-right">
                {title.length}/100
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="message">Message *</Label>
              <Textarea
                id="message"
                placeholder="Notification message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={500}
                rows={4}
              />
              <p className="text-xs text-muted-foreground text-right">
                {message.length}/500
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {NOTIFICATION_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p.value} value={p.value}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionUrl">Action URL (optional)</Label>
              <Input
                id="actionUrl"
                placeholder="e.g., /subscription"
                value={actionUrl}
                onChange={(e) => setActionUrl(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="actionLabel">Action Label (optional)</Label>
              <Input
                id="actionLabel"
                placeholder="e.g., View Details"
                value={actionLabel}
                onChange={(e) => setActionLabel(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview */}
      {title && message && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <IconBell className="h-5 w-5 text-primary mt-0.5" />
                <div className="flex-1">
                  <h4 className="font-semibold">{title}</h4>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {message}
                  </p>
                  {actionLabel && (
                    <Button variant="link" className="h-auto p-0 mt-2 text-primary">
                      {actionLabel}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => router.back()}>
          Cancel
        </Button>
        <Button
          onClick={() => setShowConfirm(true)}
          disabled={!isFormValid() || isSending}
        >
          {isSending ? (
            <>
              <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
              Sending...
            </>
          ) : (
            <>
              <IconSend className="mr-2 h-4 w-4" />
              Send Notification
            </>
          )}
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send Notification?</AlertDialogTitle>
            <AlertDialogDescription>
              You are about to send a notification to{" "}
              <strong>{getRecipientCount()}</strong> user(s).
              <br />
              <br />
              <strong>Title:</strong> {title}
              <br />
              <strong>Type:</strong> {type}
              <br />
              <strong>Priority:</strong> {priority}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSend}>
              Send Notification
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
