"use client"

import { useState, useEffect, useCallback } from "react"
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
import { Loader2, Save, Search, User, Phone, X, AlertCircle } from "lucide-react"
import { IconBrandWhatsapp } from "@tabler/icons-react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { AIConfig, ExcludedCustomer, CustomerSearchResult } from "@/lib/api/ai-api"
import { aiApi } from "@/lib/api/ai-api"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"
import { useToast } from "@/hooks/use-toast"
import { useAIConfig, useUpdateAIConfig } from "@/hooks/use-ai"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface FilterSettingsProps {
  initialConfig: AIConfig
  phoneNumbers: WhatsAppPhoneNumberOption[]
}

export function FilterSettings({ initialConfig, phoneNumbers }: FilterSettingsProps) {
  const { toast } = useToast()
  const [selectedAccountId, setSelectedAccountId] = useState<string>("")
  const [config, setConfig] = useState<AIConfig>(initialConfig)
  const [newFilterWord, setNewFilterWord] = useState("")
  const [manualPhoneInput, setManualPhoneInput] = useState("")
  const [customerSearchOpen, setCustomerSearchOpen] = useState(false)
  const [customerSearchQuery, setCustomerSearchQuery] = useState("")
  const [customerSearchResults, setCustomerSearchResults] = useState<CustomerSearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const updateConfig = useUpdateAIConfig()

  // Fetch config for selected WhatsApp account
  const { data: accountConfigData, isLoading: isLoadingAccountConfig } = useAIConfig(
    selectedAccountId || undefined,
    !!selectedAccountId
  )

  // Update local state when account config is loaded
  useEffect(() => {
    if (accountConfigData?.data) {
      setConfig(accountConfigData.data)
    } else if (!selectedAccountId) {
      // Reset to initial config when no account selected
      setConfig(initialConfig)
    }
  }, [accountConfigData, selectedAccountId, initialConfig])

  // Debounced customer search
  useEffect(() => {
    if (!customerSearchQuery || customerSearchQuery.length < 2) {
      setCustomerSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const results = await aiApi.searchCustomers(customerSearchQuery, selectedAccountId || undefined)
        setCustomerSearchResults(results)
      } catch {
        setCustomerSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 300)

    return () => clearTimeout(timer)
  }, [customerSearchQuery, selectedAccountId])

  const addExcludedCustomer = useCallback((customer: ExcludedCustomer) => {
    const currentExcluded = config.excludedCustomers || []
    // Check if already exists
    const exists = currentExcluded.some(
      (c) => c.type === customer.type && c.value === customer.value
    )
    if (!exists) {
      setConfig({
        ...config,
        excludedCustomers: [...currentExcluded, customer],
      })
    }
  }, [config])

  const removeExcludedCustomer = useCallback((customer: ExcludedCustomer) => {
    const currentExcluded = config.excludedCustomers || []
    setConfig({
      ...config,
      excludedCustomers: currentExcluded.filter(
        (c) => !(c.type === customer.type && c.value === customer.value)
      ),
    })
  }, [config])

  const handleAddManualPhone = () => {
    const phone = manualPhoneInput.trim()
    if (phone) {
      addExcludedCustomer({
        type: "phone",
        value: phone,
        label: phone,
      })
      setManualPhoneInput("")
    }
  }

  const handleSelectCustomer = (customer: CustomerSearchResult) => {
    addExcludedCustomer({
      type: "customerId",
      value: customer.id,
      label: customer.name || customer.phoneNumber || customer.id,
    })
    setCustomerSearchOpen(false)
    setCustomerSearchQuery("")
  }

  const addFilter = () => {
    if (newFilterWord.trim()) {
      const currentFilters = config.filterWords || [];
      if (!currentFilters.includes(newFilterWord.trim())) {
          setConfig({
            ...config,
            filterWords: [...currentFilters, newFilterWord.trim()]
          });
      }
      setNewFilterWord("");
    }
  }

  const handleSave = () => {
    updateConfig.mutate(
      { data: config, wabaId: selectedAccountId || undefined },
      {
        onSuccess: () => {
          toast({
            title: "Success",
            description: "Filter settings saved successfully",
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
        <CardTitle>Filter Settings</CardTitle>
        <CardDescription>
          Configure filter words and excluded customers. AI will not respond to messages that match these filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* WhatsApp Account Selector */}
        {phoneNumbers.length > 0 && (
          <div className="space-y-2">
            <Label>WhatsApp Account</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a WhatsApp account to customize filters" />
              </SelectTrigger>
              <SelectContent>
                {phoneNumbers.map((phone) => (
                  <SelectItem key={phone.id} value={phone.whatsappAccountId}>
                    <div className="flex items-center gap-2">
                      <IconBrandWhatsapp className="h-4 w-4 text-green-600" />
                      <span>{phone.displayPhoneNumber}</span>
                      {phone.verifiedName && (
                        <span className="text-muted-foreground text-xs">
                          ({phone.verifiedName})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Select an account to configure account-specific filters, or leave empty for global settings.
            </p>
          </div>
        )}

        {phoneNumbers.length === 0 && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              No WhatsApp accounts found. Connect a WhatsApp account first to configure per-account filters.
            </AlertDescription>
          </Alert>
        )}

        {isLoadingAccountConfig && selectedAccountId && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {/* Filter Words Section */}
        <div className="space-y-4">
          <div>
            <h3 className="text-base font-medium mb-2">Filter Words</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Messages containing these words will be ignored by the AI.
            </p>
          </div>
          <div className="flex gap-2">
            <Input 
              placeholder="Enter a word or phrase to block (e.g. 'competitor')" 
              value={newFilterWord}
              onChange={(e) => setNewFilterWord(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addFilter();
                }
              }}
            />
            <Button size="sm" onClick={addFilter}>
              Add Filter
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {(config.filterWords || []).map((word, index) => (
              <Badge key={index} variant="secondary" className="text-sm py-1 px-3">
                {word}
                <button 
                  className="ml-2 hover:text-destructive"
                  onClick={() => {
                    const newFilters = (config.filterWords || []).filter(w => w !== word);
                    setConfig({ ...config, filterWords: newFilters });
                  }}
                >
                  ×
                </button>
              </Badge>
            ))}
            {(!config.filterWords || config.filterWords.length === 0) && (
              <p className="text-sm text-muted-foreground italic">No filters added.</p>
            )}
          </div>
        </div>

        {/* Excluded Customers Section */}
        <div className="border-t pt-6 mt-6">
          <h3 className="text-base font-medium mb-2">Excluded Customers</h3>
          <p className="text-sm text-muted-foreground mb-4">
            AI will not respond to messages from these customers.
          </p>

          {/* Search customer or add phone manually */}
          <div className="flex gap-2 mb-4">
            <Popover open={customerSearchOpen} onOpenChange={setCustomerSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={customerSearchOpen}
                  className="flex-1 justify-start"
                >
                  <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
                  Search customer...
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[400px] p-0" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Search by name or phone..."
                    value={customerSearchQuery}
                    onValueChange={setCustomerSearchQuery}
                  />
                  <CommandList>
                    {isSearching ? (
                      <div className="py-6 text-center text-sm">
                        <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                        Searching...
                      </div>
                    ) : customerSearchResults.length === 0 ? (
                      <CommandEmpty>
                        {customerSearchQuery.length < 2
                          ? "Type at least 2 characters to search"
                          : "No customers found."}
                      </CommandEmpty>
                    ) : (
                      <CommandGroup>
                        {customerSearchResults.map((customer) => (
                          <CommandItem
                            key={customer.id}
                            value={customer.id}
                            onSelect={() => handleSelectCustomer(customer)}
                            className="cursor-pointer"
                          >
                            <User className="mr-2 h-4 w-4 text-muted-foreground" />
                            <div className="flex flex-col">
                              <span>{customer.name || "Unknown"}</span>
                              {customer.phoneNumber && (
                                <span className="text-xs text-muted-foreground">
                                  {customer.phoneNumber}
                                </span>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>

          {/* Manual phone input */}
          <div className="flex gap-2 mb-4">
            <Input
              placeholder="Or enter phone number manually (e.g. +6281234567890)"
              value={manualPhoneInput}
              onChange={(e) => setManualPhoneInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault()
                  handleAddManualPhone()
                }
              }}
            />
            <Button size="sm" variant="secondary" onClick={handleAddManualPhone}>
              <Phone className="h-4 w-4 mr-1" />
              Add
            </Button>
          </div>

          {/* Excluded customers list */}
          <div className="flex flex-wrap gap-2">
            {(config.excludedCustomers || []).map((customer, index) => (
              <Badge
                key={`${customer.type}-${customer.value}-${index}`}
                variant="secondary"
                className={cn(
                  "text-sm py-1.5 px-3 flex items-center gap-2",
                  customer.type === "phone" ? "bg-blue-50 dark:bg-blue-950" : "bg-purple-50 dark:bg-purple-950"
                )}
              >
                {customer.type === "phone" ? (
                  <Phone className="h-3 w-3" />
                ) : (
                  <User className="h-3 w-3" />
                )}
                <span>{customer.label || customer.value}</span>
                <button
                  className="ml-1 hover:text-destructive"
                  onClick={() => removeExcludedCustomer(customer)}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {(!config.excludedCustomers || config.excludedCustomers.length === 0) && (
              <p className="text-sm text-muted-foreground italic">
                No customers excluded.
              </p>
            )}
          </div>
        </div>

        <div className="flex justify-end pt-4">
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
      </CardContent>
    </Card>
  )
}