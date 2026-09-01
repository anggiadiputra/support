"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconBrandWhatsapp, IconBrandInstagram, IconBrandFacebook, IconInbox } from "@tabler/icons-react"
import type { ChannelType } from "../types/unified-inbox"

interface ChannelFilterProps {
  value: ChannelType | "all"
  onChange: (filter: ChannelType | "all") => void
}

export function ChannelFilter({ value, onChange }: ChannelFilterProps) {
  const filters: { key: ChannelType | "all"; label: string; icon: React.ReactNode }[] = [
    { key: "all", label: "All Channels", icon: <IconInbox className="h-4 w-4" /> },
    { key: "whatsapp", label: "WhatsApp", icon: <IconBrandWhatsapp className="h-4 w-4 text-green-500" /> },
    { key: "instagram", label: "Instagram", icon: <IconBrandInstagram className="h-4 w-4 text-pink-500" /> },
    { key: "messenger", label: "Messenger", icon: <IconBrandFacebook className="h-4 w-4 text-blue-500" /> },
  ]

  const selectedFilter = filters.find((f) => f.key === value)

  return (
    <Select value={value} onValueChange={(v) => onChange(v as ChannelType | "all")}>
      <SelectTrigger className="h-8 text-xs">
        <SelectValue>
          <div className="flex items-center gap-2">
            {selectedFilter?.icon}
            <span>{selectedFilter?.label}</span>
          </div>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {filters.map((filter) => (
          <SelectItem key={filter.key} value={filter.key}>
            <div className="flex items-center gap-2">
              {filter.icon}
              <span>{filter.label}</span>
            </div>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
