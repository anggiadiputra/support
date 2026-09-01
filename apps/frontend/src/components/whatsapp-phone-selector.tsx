"use client"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { IconBrandWhatsapp, IconDeviceMobile } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"

interface WhatsAppPhoneSelectorProps {
  phoneNumbers: WhatsAppPhoneNumberOption[]
  selectedId: string | null
  onSelect: (id: string | null) => void
  showAllOption?: boolean
  className?: string
  label?: string
}

export function WhatsAppPhoneSelector({
  phoneNumbers,
  selectedId,
  onSelect,
  showAllOption = true,
  className,
  label = "Filter Nomor",
}: WhatsAppPhoneSelectorProps) {
  // Don't render if no phone numbers at all
  if (phoneNumbers.length === 0) return null

  const value = selectedId || "all"
  const selectedPhone = phoneNumbers.find((p) => p.id === value)

  return (
    <Select
        value={value}
        onValueChange={(v) => onSelect(v === "all" ? null : v)}
      >
        <SelectTrigger className={className || "h-9 w-auto min-w-[160px] text-sm"}>
          <SelectValue>
            <div className="flex items-center gap-2">
              {value === "all" ? (
                <>
                  <IconDeviceMobile className="h-4 w-4 text-green-600" />
                  <span>Semua Nomor</span>
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {phoneNumbers.length}
                  </Badge>
                </>
              ) : (
                <>
                  <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                  <span className="truncate">
                    {selectedPhone?.verifiedName || selectedPhone?.displayPhoneNumber}
                  </span>
                </>
              )}
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {showAllOption && (
            <SelectItem value="all">
              <div className="flex items-center gap-2">
                <IconDeviceMobile className="h-4 w-4 text-green-600" />
                <div className="flex flex-col">
                  <span className="font-medium">Semua Nomor</span>
                  <span className="text-xs text-muted-foreground">
                    {phoneNumbers.length} nomor terhubung
                  </span>
                </div>
              </div>
            </SelectItem>
          )}
          {phoneNumbers.length > 0 && showAllOption && (
            <div className="my-1 border-t" />
          )}
          {phoneNumbers.map((pn) => (
            <SelectItem key={pn.id} value={pn.id}>
              <div className="flex items-center gap-2">
                <IconBrandWhatsapp className="h-4 w-4 text-green-500" />
                <div className="flex flex-col">
                  <span>{pn.displayPhoneNumber}</span>
                  {pn.verifiedName && (
                    <span className="text-xs text-muted-foreground">
                      {pn.verifiedName}
                    </span>
                  )}
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
    </Select>
  )
}
