"use client"

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { Customer } from "../data/schema"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { format, formatDistanceToNow } from "date-fns"
import {
  IconUser,
  IconPhone,
  IconMail,
  IconClock,
  IconCheck,
  IconX,
  IconTags,
  IconFileText,
  IconMessageCircle,
  IconCalendar,
  IconChartBar,
  IconListDetails,
  IconTrophy,
} from "@tabler/icons-react"
import { CustomerDetailTabs } from "./customer-detail-tabs"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  customer: Customer | null
}

export function CustomerViewDrawer({ open, onOpenChange, customer }: Props) {
  if (!customer) return null

  const initials = (customer.name || "")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) || "U"

  const getConsentBadge = (status: string) => {
    switch (status) {
      case "CONSENTED":
        return (
          <Badge className="bg-emerald-500">
            <IconCheck className="mr-1 h-3 w-3" />
            Consented
          </Badge>
        )
      case "NOT_CONSENTED":
        return (
          <Badge variant="outline">
            <IconX className="mr-1 h-3 w-3" />
            Not Consented
          </Badge>
        )
      case "REVOKED":
        return (
          <Badge variant="destructive">
            <IconX className="mr-1 h-3 w-3" />
            Revoked
          </Badge>
        )
      default:
        return null
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Customer Details</SheetTitle>
          <SheetDescription>
            View customer information and interaction history
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 space-y-6 py-4">
          {/* Customer Header */}
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h3 className="text-xl font-semibold">{customer.name || "Unnamed Customer"}</h3>
              <p className="text-muted-foreground text-sm">
                {customer.phoneNumber}
              </p>
              {customer.email && (
                <p className="text-muted-foreground text-xs">{customer.email}</p>
              )}
            </div>
          </div>

          <Separator />

          {/* CRM Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <IconChartBar className="h-4 w-4" />
                <span className="text-xs font-medium uppercase">Pipeline Stage</span>
              </div>
              <div className="font-medium">
                {customer.pipelineStage ? (
                  <Badge
                    variant="outline"
                    style={{
                      borderColor: customer.pipelineStage.color,
                      color: customer.pipelineStage.color
                    }}
                  >
                    {customer.pipelineStage.name}
                  </Badge>
                ) : (
                  <span className="text-sm text-muted-foreground">No Stage</span>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <IconTrophy className="h-4 w-4" />
                <span className="text-xs font-medium uppercase">Lead Score</span>
              </div>
              <div className="font-medium text-lg">
                {customer.leadScore || 0}
              </div>
            </div>
          </div>

          <Separator />

          {/* Tabs for Details and Activity */}
          <CustomerDetailTabs
            customer={customer}
            getConsentBadge={getConsentBadge}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
