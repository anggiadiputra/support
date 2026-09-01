"use client"

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { X } from "lucide-react"
import type { CRMCustomerDetail } from "../../types/unified-inbox"

interface PanelHeaderProps {
  customer: CRMCustomerDetail
  onClose: () => void
}

export function PanelHeader({ customer, onClose }: PanelHeaderProps) {
  const getInitials = (name: string | null, phone: string) => {
    if (name) {
      return name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .substring(0, 2)
        .toUpperCase()
    }
    return phone.replace(/[^0-9]/g, "").substring(0, 2)
  }

  return (
    <div className="flex items-center justify-between p-4 border-b bg-background">
      <div className="flex items-center gap-3">
        <Avatar className="h-10 w-10">
          <AvatarImage src={customer.avatar || undefined} />
          <AvatarFallback className="bg-primary/10 text-primary font-medium">
            {getInitials(customer.name, customer.phoneNumber)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold truncate">
            {customer.name || "Unknown"}
          </h3>
          <p className="text-xs text-muted-foreground truncate">
            {customer.phoneNumber}
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClose}
        className="h-8 w-8 shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  )
}
