"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconBrandInstagram, IconBrandFacebook, IconBrandWhatsapp, IconUsers } from "@tabler/icons-react"
import type { InstagramAccount } from "@/lib/api/instagram"
import type { FacebookPage } from "@/lib/api/messenger"

export interface WhatsAppPhoneNumberOption {
  id: string
  phoneNumberId: string
  displayPhoneNumber: string
}

export type AccountFilterValue = "all" | `ig-${string}` | `fb-${string}` | `wa-${string}`

interface AccountFilterProps {
  value: AccountFilterValue
  onChange: (filter: AccountFilterValue) => void
  instagramAccounts: InstagramAccount[]
  facebookPages: FacebookPage[]
  whatsappPhoneNumbers?: WhatsAppPhoneNumberOption[]
}

export function AccountFilter({
  value,
  onChange,
  instagramAccounts,
  facebookPages,
  whatsappPhoneNumbers = [],
}: AccountFilterProps) {
  const hasAccounts = instagramAccounts.length > 0 || facebookPages.length > 0 || whatsappPhoneNumbers.length > 1

  // Build options list
  const options: {
    key: AccountFilterValue
    label: string
    icon: React.ReactNode
    group?: string
  }[] = [
    {
      key: "all",
      label: "All Accounts",
      icon: <IconUsers className="h-4 w-4" />,
    },
  ]

  // Add WhatsApp phone numbers (only if more than 1)
  if (whatsappPhoneNumbers.length > 1) {
    whatsappPhoneNumbers.forEach((pn) => {
      options.push({
        key: `wa-${pn.id}`,
        label: pn.displayPhoneNumber,
        icon: <IconBrandWhatsapp className="h-4 w-4 text-green-500" />,
        group: "WhatsApp",
      })
    })
  }

  // Add Instagram accounts
  instagramAccounts.forEach((account) => {
    options.push({
      key: `ig-${account.id}`,
      label: `@${account.username}`,
      icon: <IconBrandInstagram className="h-4 w-4 text-pink-500" />,
      group: "Instagram",
    })
  })

  // Add Facebook Pages
  facebookPages.forEach((page) => {
    options.push({
      key: `fb-${page.id}`,
      label: page.pageName,
      icon: <IconBrandFacebook className="h-4 w-4 text-blue-500" />,
      group: "Messenger",
    })
  })

  const selectedOption = options.find((o) => o.key === value)

  // Don't render if no accounts connected
  if (!hasAccounts) {
    return null
  }

  return (
    <Select value={value} onValueChange={(v) => onChange(v as AccountFilterValue)}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue>
          <div className="flex items-center gap-2">
            {selectedOption?.icon}
            <span className="truncate">{selectedOption?.label}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.key} value={option.key}>
            <div className="flex items-center gap-2">
              {option.icon}
              <span>{option.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
