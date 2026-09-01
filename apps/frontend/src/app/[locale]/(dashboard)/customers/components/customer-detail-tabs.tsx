"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IconHistory, IconUser } from "@tabler/icons-react"
import { ActivityTimeline } from "./activity-timeline"
import { Customer } from "../data/schema"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    getDisplayPhoneNumber,
    getDisplayBsuid,
    isBsuidOnlyCustomer,
} from "@/lib/customer-display"
import { format, formatDistanceToNow } from "date-fns"
import {
    IconPhone,
    IconMail,
    IconClock,
    IconCheck,
    IconTags,
    IconFileText,
    IconMessageCircle,
    IconCalendar,
    IconListDetails,
    IconBrandWhatsapp,
} from "@tabler/icons-react"

interface CustomerDetailTabsProps {
    customer: Customer
    getConsentBadge: (status: string) => React.ReactNode
}

export function CustomerDetailTabs({ customer, getConsentBadge }: CustomerDetailTabsProps) {
    return (
        <Tabs defaultValue="details" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">
                    <IconUser className="mr-2 h-4 w-4" />
                    Details
                </TabsTrigger>
                <TabsTrigger value="activity">
                    <IconHistory className="mr-2 h-4 w-4" />
                    Activity
                </TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6 mt-6">
                {/* Contact Information */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground">
                        Contact Information
                    </h4>

                    <div className="space-y-3">
                        {(() => {
                            // Helpers filter out BSUID strings that happen to live in the
                            // phoneNumber column (workaround for BSUID-only customers),
                            // so we never render a BSUID under the "Phone Number" label.
                            const displayPhone = getDisplayPhoneNumber(customer)
                            const displayBsuid = getDisplayBsuid(customer)
                            const bsuidOnly = isBsuidOnlyCustomer(customer)

                            return (
                                <>
                                    {displayPhone && (
                                        <div className="flex items-start gap-3">
                                            <IconPhone className="text-muted-foreground mt-0.5 h-4 w-4" />
                                            <div className="flex-1">
                                                <p className="text-muted-foreground text-xs">Phone Number</p>
                                                <p className="font-medium">{displayPhone}</p>
                                            </div>
                                        </div>
                                    )}

                                    {bsuidOnly && !displayPhone && (
                                        <div className="flex items-start gap-3">
                                            <IconPhone className="text-muted-foreground mt-0.5 h-4 w-4" />
                                            <div className="flex-1">
                                                <p className="text-muted-foreground text-xs">Contact Method</p>
                                                <p className="text-sm text-muted-foreground italic">
                                                    WhatsApp username / BSUID only (no phone number)
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {customer.email && (
                                        <div className="flex items-start gap-3">
                                            <IconMail className="text-muted-foreground mt-0.5 h-4 w-4" />
                                            <div className="flex-1">
                                                <p className="text-muted-foreground text-xs">Email</p>
                                                <p className="font-medium">{customer.email}</p>
                                            </div>
                                        </div>
                                    )}

                                    {(customer.whatsappUsername || displayBsuid) && (
                                        <div className="flex items-start gap-3">
                                            <IconBrandWhatsapp className="text-muted-foreground mt-0.5 h-4 w-4" />
                                            <div className="flex-1">
                                                <p className="text-muted-foreground text-xs">WhatsApp ID</p>
                                                {customer.whatsappUsername && (
                                                    <p className="font-medium">@{customer.whatsappUsername}</p>
                                                )}
                                                {displayBsuid && (
                                                    <p className="font-mono text-xs text-muted-foreground">
                                                        {displayBsuid}
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                    )}
                                </>
                            )
                        })()}
                    </div>
                </div>

                <Separator />

                {/* Marketing Consent */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground">
                        Marketing Consent
                    </h4>
                    <div className="flex items-start gap-3">
                        <IconCheck className="text-muted-foreground mt-0.5 h-4 w-4" />
                        <div className="flex-1">
                            <p className="text-muted-foreground text-xs">Status</p>
                            <div className="mt-1">
                                {getConsentBadge(customer.consentStatus)}
                            </div>
                        </div>
                    </div>
                    {customer.marketingOptOut && (
                        <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-700 dark:bg-amber-950/30">
                            <p className="text-xs font-semibold uppercase text-amber-700 dark:text-amber-400">
                                Opted out of marketing
                            </p>
                            <p className="mt-1 text-xs text-amber-900 dark:text-amber-200">
                                Customer pressed &quot;Stop receiving marketing messages&quot; on WhatsApp.
                                Utility / authentication templates and in-window freeform messages
                                are still allowed.
                            </p>
                            {customer.marketingOptOutAt && (
                                <p className="mt-1 text-xs text-amber-900/80 dark:text-amber-200/80">
                                    Since {formatDistanceToNow(new Date(customer.marketingOptOutAt), { addSuffix: true })}
                                    {customer.marketingOptOutSource && ` · ${customer.marketingOptOutSource}`}
                                </p>
                            )}
                        </div>
                    )}
                </div>

                <Separator />

                {/* Message Window */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground">
                        Message Window
                    </h4>
                    <div className="flex items-start gap-3">
                        <IconClock className="text-muted-foreground mt-0.5 h-4 w-4" />
                        <div className="flex-1">
                            <p className="text-muted-foreground text-xs">24-Hour Window</p>
                            {customer.hasActiveWindow && customer.windowExpiresAt ? (
                                <div className="mt-1">
                                    <Badge className="bg-emerald-600">Active</Badge>
                                    <p className="text-muted-foreground text-xs mt-1">
                                        Expires {formatDistanceToNow(new Date(customer.windowExpiresAt), { addSuffix: true })}
                                    </p>
                                </div>
                            ) : (
                                <div className="mt-1">
                                    <Badge variant="outline">No Active Window</Badge>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <Separator />

                {/* Tags */}
                {customer.tags && customer.tags.length > 0 && (
                    <>
                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm uppercase text-muted-foreground">
                                Tags
                            </h4>
                            <div className="flex flex-wrap gap-2">
                                {customer.tags.map((tag) => (
                                    <Badge key={tag} variant="secondary">
                                        <IconTags className="mr-1 h-3 w-3" />
                                        {tag}
                                    </Badge>
                                ))}
                            </div>
                        </div>
                        <Separator />
                    </>
                )}

                {/* Custom Fields */}
                {customer.customFields && customer.customFields.length > 0 && (
                    <>
                        <div className="space-y-4">
                            <h4 className="font-semibold text-sm uppercase text-muted-foreground">
                                Custom Fields
                            </h4>
                            <div className="space-y-3">
                                {customer.customFields.map((cf: any) => (
                                    <div key={cf.id} className="flex items-start gap-3">
                                        <IconListDetails className="text-muted-foreground mt-0.5 h-4 w-4" />
                                        <div className="flex-1">
                                            <p className="text-muted-foreground text-xs">{cf.fieldDefinition.name}</p>
                                            <p className="font-medium">{cf.value}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <Separator />
                    </>
                )}

                {/* Activity Summary */}
                <div className="space-y-4">
                    <h4 className="font-semibold text-sm uppercase text-muted-foreground">
                        Activity Summary
                    </h4>

                    <div className="space-y-3">
                        {customer.lastMessageAt && (
                            <div className="flex items-start gap-3">
                                <IconMessageCircle className="text-muted-foreground mt-0.5 h-4 w-4" />
                                <div className="flex-1">
                                    <p className="text-muted-foreground text-xs">Last Message</p>
                                    <p className="font-medium">
                                        {format(new Date(customer.lastMessageAt), "MMM dd, yyyy 'at' HH:mm")}
                                    </p>
                                    <p className="text-muted-foreground text-xs">
                                        {formatDistanceToNow(new Date(customer.lastMessageAt), { addSuffix: true })}
                                    </p>
                                </div>
                            </div>
                        )}

                        <div className="flex items-start gap-3">
                            <IconCalendar className="text-muted-foreground mt-0.5 h-4 w-4" />
                            <div className="flex-1">
                                <p className="text-muted-foreground text-xs">Added On</p>
                                <p className="font-medium">
                                    {format(new Date(customer.createdAt), "MMM dd, yyyy 'at' HH:mm")}
                                </p>
                                <p className="text-muted-foreground text-xs">
                                    {formatDistanceToNow(new Date(customer.createdAt), { addSuffix: true })}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </TabsContent>

            <TabsContent value="activity" className="mt-6">
                <ActivityTimeline customerId={customer.id} />
            </TabsContent>
        </Tabs>
    )
}
