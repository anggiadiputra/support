"use client"

import { Dispatch, SetStateAction, useEffect, useState, useMemo } from "react"
import { z } from "zod"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { IconCheck, IconCopy } from "@tabler/icons-react"
import { Loader2 } from "lucide-react"
import { useQuery } from "@tanstack/react-query"
import { cn } from "@/lib/utils"
import { toast } from "@/hooks/use-toast"
import { useCreateWebhook, useUpdateWebhook } from "@/hooks/use-webhooks"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import type {
  WebhookEndpoint,
  WebhookEventType,
  WebhookChannel,
} from "@/lib/api/webhooks-api"
import { webhookEventTypes, webhookChannels } from "../data/schema"
import { wabaApi } from "@/lib/api/waba"
import { instagramApi } from "@/lib/api/instagram"
import { messengerApi } from "@/lib/api/messenger"

// Unified channel account type for all channels
interface ChannelAccount {
  id: string
  displayName: string
  subtext?: string
  channel: "whatsapp" | "instagram" | "messenger"
}

interface Props {
  open: boolean
  setOpen: Dispatch<SetStateAction<boolean>>
  currentWebhook?: WebhookEndpoint
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be 100 characters or less"),
  url: z.string().min(1, "URL is required").url("Please enter a valid URL"),
  events: z
    .array(z.enum(webhookEventTypes))
    .min(1, "Please select at least one event"),
  channels: z
    .array(z.enum(webhookChannels))
    .min(1, "Please select at least one channel"),
  accountMode: z.enum(["all", "specific"]),
  channelAccountIds: z.array(z.string()),
})
type MutateWebhookForm = z.infer<typeof formSchema>

// Hook to fetch all channel accounts
function useChannelAccounts() {
  // Fetch WhatsApp accounts
  const wabaQuery = useQuery({
    queryKey: ["waba", "accounts"],
    queryFn: () => wabaApi.getAccounts(),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch Instagram accounts
  const instagramQuery = useQuery({
    queryKey: ["instagram", "connection-status"],
    queryFn: () => instagramApi.getConnectionStatus(),
    staleTime: 5 * 60 * 1000,
  })

  // Fetch Messenger pages
  const messengerQuery = useQuery({
    queryKey: ["messenger", "pages"],
    queryFn: () => messengerApi.getPages(),
    staleTime: 5 * 60 * 1000,
  })

  const isLoading = wabaQuery.isLoading || instagramQuery.isLoading || messengerQuery.isLoading

  // Transform all accounts into unified format
  const accounts = useMemo<ChannelAccount[]>(() => {
    const result: ChannelAccount[] = []

    // WhatsApp phone numbers
    if (wabaQuery.data) {
      for (const account of wabaQuery.data) {
        if (account.connectionStatus !== "connected") continue
        for (const pn of account.phoneNumbers) {
          result.push({
            id: pn.id,
            displayName: pn.displayPhoneNumber,
            subtext: pn.verifiedName || undefined,
            channel: "whatsapp",
          })
        }
      }
    }

    // Instagram accounts
    if (instagramQuery.data?.accounts) {
      for (const acc of instagramQuery.data.accounts) {
        if (acc.connectionStatus !== "connected") continue
        result.push({
          id: acc.id,
          displayName: `@${acc.username}`,
          subtext: undefined,
          channel: "instagram",
        })
      }
    }

    // Messenger pages
    if (messengerQuery.data) {
      for (const page of messengerQuery.data) {
        if (page.connectionStatus !== "connected") continue
        result.push({
          id: page.id,
          displayName: page.pageName,
          subtext: undefined,
          channel: "messenger",
        })
      }
    }

    return result
  }, [wabaQuery.data, instagramQuery.data, messengerQuery.data])

  return { accounts, isLoading }
}

const eventLabels: Record<WebhookEventType, string> = {
  "message.received": "Message Received",
  "message.sent": "Message Sent",
  "message.delivered": "Message Delivered",
  "message.read": "Message Read",
  "message.failed": "Message Failed",
}

const channelLabels: Record<WebhookChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  all: "All Channels",
}

export function MutateWebhook({ open, setOpen, currentWebhook }: Props) {
  const isEdit = !!currentWebhook
  const [createdSecret, setCreatedSecret] = useState<string | null>(null)
  const [isCopied, setIsCopied] = useState(false)

  const createWebhook = useCreateWebhook()
  const updateWebhook = useUpdateWebhook()
  const isLoading = createWebhook.isPending || updateWebhook.isPending

  // Fetch all channel accounts
  const { accounts: allAccounts, isLoading: isLoadingAccounts } = useChannelAccounts()

  const form = useForm<MutateWebhookForm>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      url: "",
      events: [],
      channels: [],
      accountMode: "all",
      channelAccountIds: [],
    },
  })

  // Watch selected channels to filter accounts
  const selectedChannels = useWatch({ control: form.control, name: "channels" })
  const accountMode = useWatch({ control: form.control, name: "accountMode" })

  // Filter accounts based on selected channels
  const filteredAccounts = useMemo(() => {
    if (!selectedChannels || selectedChannels.length === 0) return []
    
    // If "all" is selected, show all accounts
    if (selectedChannels.includes("all")) {
      return allAccounts
    }

    // Filter by selected channels
    return allAccounts.filter((acc) => {
      if (selectedChannels.includes("whatsapp") && acc.channel === "whatsapp") return true
      if (selectedChannels.includes("instagram") && acc.channel === "instagram") return true
      // Note: messenger is not in webhookChannels yet, but keep for future compatibility
      return false
    })
  }, [allAccounts, selectedChannels])

  // Reset form and state when dialog opens
  useEffect(() => {
    if (open) {
      // Always reset secret state when sheet opens
      setCreatedSecret(null)
      setIsCopied(false)
      
      if (currentWebhook) {
        // Edit mode: populate with current webhook data
        const hasSpecificAccounts = currentWebhook.channelAccountIds && currentWebhook.channelAccountIds.length > 0
        form.reset({
          name: currentWebhook.name,
          url: currentWebhook.url,
          events: currentWebhook.events,
          channels: currentWebhook.channels,
          accountMode: hasSpecificAccounts ? "specific" : "all",
          channelAccountIds: currentWebhook.channelAccountIds || [],
        })
      } else {
        // Create mode: reset to empty
        form.reset({
          name: "",
          url: "",
          events: [],
          channels: [],
          accountMode: "all",
          channelAccountIds: [],
        })
      }
    }
  }, [open, currentWebhook, form])

  // Clear selected accounts when switching to "all" mode or when channels change
  useEffect(() => {
    if (accountMode === "all") {
      form.setValue("channelAccountIds", [])
    }
  }, [accountMode, form])

  // Remove accounts that don't match the selected channels
  useEffect(() => {
    const currentIds = form.getValues("channelAccountIds")
    if (currentIds.length > 0) {
      const validIds = currentIds.filter((id) => 
        filteredAccounts.some((acc) => acc.id === id)
      )
      if (validIds.length !== currentIds.length) {
        form.setValue("channelAccountIds", validIds)
      }
    }
  }, [filteredAccounts, form])

  const onSubmit = (data: MutateWebhookForm) => {
    // If "all" mode, send empty array. Otherwise, send selected IDs.
    const channelAccountIds = data.accountMode === "all" ? [] : data.channelAccountIds

    if (isEdit && currentWebhook) {
      updateWebhook.mutate(
        {
          id: currentWebhook.id,
          data: {
            name: data.name,
            url: data.url,
            events: data.events as WebhookEventType[],
            channels: data.channels as WebhookChannel[],
            channelAccountIds,
          },
        },
        {
          onSuccess: () => {
            toast({
              title: "Webhook Updated",
              description: "Your webhook endpoint has been updated successfully.",
            })
            handleClose()
          },
          onError: (error) => {
            toast({
              title: "Error",
              description: error.message || "Failed to update webhook",
              variant: "destructive",
            })
          },
        }
      )
    } else {
      createWebhook.mutate(
        {
          name: data.name,
          url: data.url,
          events: data.events as WebhookEventType[],
          channels: data.channels as WebhookChannel[],
          channelAccountIds,
        },
        {
          onSuccess: (created) => {
            if (created.secret) {
              setCreatedSecret(created.secret)
            }
            toast({
              title: "Webhook Created",
              description: "Your webhook endpoint has been created successfully.",
            })
          },
          onError: (error) => {
            toast({
              title: "Error",
              description: error.message || "Failed to create webhook",
              variant: "destructive",
            })
          },
        }
      )
    }
  }

  const handleCopy = async () => {
    if (!createdSecret) return
    try {
      await navigator.clipboard.writeText(createdSecret)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
      toast({
        title: "Copied!",
        description: "Webhook secret copied to clipboard",
      })
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      })
    }
  }

  const handleClose = () => {
    form.reset({
      name: "",
      url: "",
      events: [],
      channels: [],
      accountMode: "all",
      channelAccountIds: [],
    })
    setCreatedSecret(null)
    setIsCopied(false)
    setOpen(false)
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(e) => {
        if (!e) {
          handleClose()
        } else {
          setOpen(e)
        }
      }}
    >
      <SheetContent className="flex w-full max-w-none flex-col sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>
            {createdSecret
              ? "Webhook Created"
              : isEdit
              ? "Update Webhook"
              : "New Webhook"}
          </SheetTitle>
          <SheetDescription>
            {createdSecret
              ? "Your webhook has been created. Copy the secret now - you won't be able to see it again!"
              : isEdit
              ? "Update your webhook endpoint configuration."
              : "Setup your webhook endpoint to receive live events."}
          </SheetDescription>
        </SheetHeader>

        {createdSecret ? (
          <div className="flex-1 space-y-4 p-2">
            <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
              <AlertDescription className="text-yellow-800 dark:text-yellow-200">
                This is the only time you'll see this secret. Store it securely
                to verify webhook signatures!
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <label className="text-sm font-medium">Webhook Secret</label>
              <div className="flex gap-2">
                <Input
                  readOnly
                  value={createdSecret}
                  className="font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={handleCopy}
                  className="shrink-0"
                >
                  {isCopied ? (
                    <IconCheck className="h-4 w-4 text-green-500" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Use this secret to verify webhook signatures using HMAC-SHA256.
              </p>
            </div>

            <SheetFooter className="mt-4">
              <Button onClick={handleClose}>Done</Button>
            </SheetFooter>
          </div>
        ) : (
          <Form {...form}>
            <form
              id="webhook"
              onSubmit={form.handleSubmit(onSubmit)}
              className="no-scrollbar -mx-2 flex-1 space-y-5 overflow-y-auto p-2"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>Name</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="e.g., n8n Production" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="url"
                render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel>URL Endpoint</FormLabel>
                    <FormControl>
                      <Input {...field} placeholder="https://your-server.com/webhook" />
                    </FormControl>
                    <FormDescription>
                      HTTPS is required for production environments.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="events"
                render={() => (
                  <FormItem className="space-y-1">
                    <FormLabel>Events</FormLabel>
                    <FormDescription>
                      Select which events should trigger this webhook.
                    </FormDescription>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {webhookEventTypes.map((event) => (
                        <FormField
                          key={event}
                          control={form.control}
                          name="events"
                          render={({ field }) => {
                            return (
                              <FormItem key={event}>
                                <FormLabel
                                  className={cn(
                                    "flex flex-row items-start space-y-0 space-x-2",
                                    "border-border cursor-pointer rounded-lg border p-3",
                                    "[&:has([aria-checked=true])]:border-blue-500",
                                    "[&_button[aria-checked=true]]:bg-blue-500 [&_button[aria-checked=true]]:border-blue-500",
                                    "[&:has(button[aria-invalid=true])]:border-destructive"
                                  )}
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(event)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, event])
                                          : field.onChange(
                                              field.value?.filter((v) => v !== event)
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <div className="text-sm font-medium">
                                    {eventLabels[event]}
                                  </div>
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="channels"
                render={() => (
                  <FormItem className="space-y-1">
                    <FormLabel>Channels</FormLabel>
                    <FormDescription>
                      Filter events by messaging channel.
                    </FormDescription>
                    <div className="grid grid-cols-3 gap-2">
                      {webhookChannels.map((channel) => (
                        <FormField
                          key={channel}
                          control={form.control}
                          name="channels"
                          render={({ field }) => {
                            return (
                              <FormItem key={channel}>
                                <FormLabel
                                  className={cn(
                                    "flex flex-row items-center justify-center space-y-0 space-x-2",
                                    "border-border cursor-pointer rounded-lg border p-3",
                                    "[&:has([aria-checked=true])]:border-blue-500",
                                    "[&_button[aria-checked=true]]:bg-blue-500 [&_button[aria-checked=true]]:border-blue-500",
                                    "[&:has(button[aria-invalid=true])]:border-destructive"
                                  )}
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(channel)}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, channel])
                                          : field.onChange(
                                              field.value?.filter((v) => v !== channel)
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <div className="text-sm font-medium">
                                    {channelLabels[channel]}
                                  </div>
                                </FormLabel>
                              </FormItem>
                            )
                          }}
                        />
                      ))}
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Account Filter Section */}
              {selectedChannels && selectedChannels.length > 0 && (
                <FormField
                  control={form.control}
                  name="accountMode"
                  render={({ field }) => (
                    <FormItem className="space-y-3">
                      <FormLabel>Accounts</FormLabel>
                      <FormDescription>
                        Choose which accounts should trigger this webhook.
                      </FormDescription>
                      <FormControl>
                        <RadioGroup
                          onValueChange={field.onChange}
                          value={field.value}
                          className="space-y-2"
                        >
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="all" id="account-all" />
                            <Label
                              htmlFor="account-all"
                              className="cursor-pointer text-sm font-medium"
                            >
                              All connected accounts
                            </Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="specific" id="account-specific" />
                            <Label
                              htmlFor="account-specific"
                              className="cursor-pointer text-sm font-medium"
                            >
                              Specific accounts only
                            </Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Account Multi-Select (only visible when "specific" is selected) */}
              {accountMode === "specific" && selectedChannels && selectedChannels.length > 0 && (
                <FormField
                  control={form.control}
                  name="channelAccountIds"
                  render={() => (
                    <FormItem className="space-y-1">
                      <FormLabel className="sr-only">Select Accounts</FormLabel>
                      {isLoadingAccounts ? (
                        <div className="space-y-2">
                          <Skeleton className="h-12 w-full" />
                          <Skeleton className="h-12 w-full" />
                        </div>
                      ) : filteredAccounts.length === 0 ? (
                        <div className="text-muted-foreground rounded-lg border border-dashed p-4 text-center text-sm">
                          No accounts found for selected channels.
                          {selectedChannels.includes("all")
                            ? " Connect WhatsApp or Instagram accounts first."
                            : ""}
                        </div>
                      ) : (
                        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border p-2">
                          {filteredAccounts.map((account) => (
                            <FormField
                              key={account.id}
                              control={form.control}
                              name="channelAccountIds"
                              render={({ field }) => (
                                <FormItem key={account.id}>
                                  <FormLabel
                                    className={cn(
                                      "flex flex-row items-center space-y-0 space-x-3",
                                      "cursor-pointer rounded-md p-2 hover:bg-muted/50",
                                      "[&:has([aria-checked=true])]:bg-blue-50 dark:[&:has([aria-checked=true])]:bg-blue-950/30"
                                    )}
                                  >
                                    <FormControl>
                                      <Checkbox
                                        checked={field.value?.includes(account.id)}
                                        onCheckedChange={(checked) => {
                                          return checked
                                            ? field.onChange([...field.value, account.id])
                                            : field.onChange(
                                                field.value?.filter((v) => v !== account.id)
                                              )
                                        }}
                                      />
                                    </FormControl>
                                    <div className="flex flex-1 items-center justify-between">
                                      <div>
                                        <div className="text-sm font-medium">
                                          {account.displayName}
                                        </div>
                                        {account.subtext && (
                                          <div className="text-muted-foreground text-xs">
                                            {account.subtext}
                                          </div>
                                        )}
                                      </div>
                                      <span
                                        className={cn(
                                          "rounded-full px-2 py-0.5 text-xs font-medium",
                                          account.channel === "whatsapp" &&
                                            "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
                                          account.channel === "instagram" &&
                                            "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
                                          account.channel === "messenger" &&
                                            "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                                        )}
                                      >
                                        {account.channel === "whatsapp" && "WhatsApp"}
                                        {account.channel === "instagram" && "Instagram"}
                                        {account.channel === "messenger" && "Messenger"}
                                      </span>
                                    </div>
                                  </FormLabel>
                                </FormItem>
                              )}
                            />
                          ))}
                        </div>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </form>
          </Form>
        )}

        {!createdSecret && (
          <SheetFooter className="gap-2">
            <SheetClose asChild>
              <Button variant="outline" disabled={isLoading}>
                Cancel
              </Button>
            </SheetClose>
            <Button form="webhook" type="submit" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {isEdit ? "Updating..." : "Creating..."}
                </>
              ) : isEdit ? (
                "Update Webhook"
              ) : (
                "Create Webhook"
              )}
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}
