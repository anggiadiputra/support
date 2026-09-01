/**
 * Shared hook for WhatsApp phone number selection (multi-number support)
 *
 * Fetches all connected WhatsApp accounts and their phone numbers,
 * providing a selected phone number state for filtering data across pages.
 */

import { useState, useMemo, useCallback } from "react"
import { useQuery } from "@tanstack/react-query"
import { wabaApi, type WhatsAppAccountWithPhoneNumbers } from "@/lib/api/waba"

export interface WhatsAppPhoneNumberOption {
  id: string // Internal DB ID (PhoneNumber.id)
  phoneNumberId: string // Meta phone number ID
  displayPhoneNumber: string
  verifiedName?: string | null
  whatsappAccountId: string
  wabaId: string
}

export function useWhatsAppPhoneNumbers(enabled: boolean = true) {
  const [selectedPhoneNumberId, setSelectedPhoneNumberId] = useState<string | null>(null)

  // Fetch all WhatsApp accounts with phone numbers
  const { data: accounts = [], isLoading } = useQuery<WhatsAppAccountWithPhoneNumbers[]>({
    queryKey: ["waba", "accounts"],
    queryFn: () => wabaApi.getAccounts(),
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled,
  })

  // Flatten all phone numbers from all accounts
  const phoneNumbers = useMemo<WhatsAppPhoneNumberOption[]>(() => {
    const result: WhatsAppPhoneNumberOption[] = []
    for (const account of accounts) {
      if (account.connectionStatus !== "connected") continue
      for (const pn of account.phoneNumbers) {
        result.push({
          id: pn.id,
          phoneNumberId: pn.phoneNumberId,
          displayPhoneNumber: pn.displayPhoneNumber,
          verifiedName: pn.verifiedName,
          whatsappAccountId: account.id,
          wabaId: account.wabaId,
        })
      }
    }
    return result
  }, [accounts])

  // Whether we have multiple phone numbers (show selector)
  const hasMultipleNumbers = phoneNumbers.length > 1

  // Get the selected phone number object
  const selectedPhoneNumber = useMemo(() => {
    if (!selectedPhoneNumberId) return null
    return phoneNumbers.find((pn) => pn.id === selectedPhoneNumberId) || null
  }, [phoneNumbers, selectedPhoneNumberId])

  // Get the whatsappAccountId for the selected phone number (for template filtering)
  const selectedWhatsappAccountId = selectedPhoneNumber?.whatsappAccountId || null

  const handleSelect = useCallback((id: string | null) => {
    setSelectedPhoneNumberId(id)
  }, [])

  return {
    phoneNumbers,
    selectedPhoneNumberId,
    selectedPhoneNumber,
    selectedWhatsappAccountId,
    hasMultipleNumbers,
    isLoading,
    setSelectedPhoneNumberId: handleSelect,
  }
}
