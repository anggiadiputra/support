"use client"

import { useState, useMemo, useEffect } from "react"
import { useTranslations } from "next-intl"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import {
  IconSend,
  IconLoader2,
  IconUsers,
  IconFileTypeCsv,
  IconEye,
  IconClock,
  IconInfoCircle,
  IconExternalLink,
} from "@tabler/icons-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { toast } from "@/hooks/use-toast"
import { TemplateSelector } from "./template-selector"
import { VariableInput, validateVariables } from "./variable-input"
import { CustomerSelector } from "./customer-selector"
import { CsvUploader, type CsvRow } from "./csv-uploader"
import { TemplatePreviewLive } from "./template-preview-live"
import type { Template } from "../../templates/data/schema"
import { useWhatsAppPhoneNumbers } from "@/hooks/use-whatsapp-phone-numbers"
import { WhatsAppPhoneSelector } from "@/components/whatsapp-phone-selector"

interface BroadcastFormProps {
  onSuccess?: () => void
  selectedPhoneNumberId?: string | null
}

type RecipientMode = "customers" | "csv"

// Delay options in milliseconds
const DELAY_OPTIONS = [
  { value: "0", label: "No delay" },
  { value: "500", label: "0.5 seconds" },
  { value: "1000", label: "1 second" },
  { value: "2000", label: "2 seconds" },
  { value: "3000", label: "3 seconds" },
  { value: "5000", label: "5 seconds" },
  { value: "10000", label: "10 seconds" },
]

export function BroadcastForm({ onSuccess, selectedPhoneNumberId: propPhoneNumberId }: BroadcastFormProps) {
  const t = useTranslations("broadcast")
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const {
    phoneNumbers: whatsappPhoneNumbers,
    selectedPhoneNumberId: hookPhoneNumberId,
    selectedPhoneNumber: hookSelectedPhone,
    selectedWhatsappAccountId: hookAccountId,
    setSelectedPhoneNumberId,
  } = useWhatsAppPhoneNumbers()

  // Use prop if provided, otherwise use hook state
  const selectedPhoneNumberId = propPhoneNumberId !== undefined ? propPhoneNumberId : hookPhoneNumberId
  const selectedPhoneNumber = whatsappPhoneNumbers.find(p => p.id === selectedPhoneNumberId) || null
  const selectedWhatsappAccountId = selectedPhoneNumber?.whatsappAccountId || null

  // Form state
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(
    null
  )
  const [variableValues, setVariableValues] = useState<Record<string, string>>(
    {}
  )
  const [recipientMode, setRecipientMode] = useState<RecipientMode>("customers")
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([])
  const [phoneNumbers, setPhoneNumbers] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [messageDelay, setMessageDelay] = useState("1000") // Default 1 second
  // CSV data with variable columns
  const [csvData, setCsvData] = useState<CsvRow[]>([])
  const [csvVariableColumns, setCsvVariableColumns] = useState<string[]>([])

  // Reset template and customers when phone number changes (templates are per-account)
  useEffect(() => {
    setSelectedTemplate(null)
    setVariableValues({})
    setSelectedCustomerIds([])
    setCsvData([])
    setCsvVariableColumns([])
  }, [selectedPhoneNumberId])

  // Handle CSV data change from uploader
  const handleCsvDataChange = (data: CsvRow[], variableColumns: string[]) => {
    setCsvData(data)
    setCsvVariableColumns(variableColumns)
  }

  // Reset variables when template changes
  const handleTemplateSelect = (template: Template | null) => {
    setSelectedTemplate(template)
    // Keep CSV variable columns but clear manual values
    // This allows CSV data to persist when changing templates
    setVariableValues({})
  }

  // Validation
  const isValid = useMemo(() => {
    if (!selectedTemplate) return false

    // Check variables are filled (skip CSV-provided variables)
    if (!validateVariables(selectedTemplate, variableValues, csvVariableColumns)) return false

    // Check recipients
    if (recipientMode === "customers" && selectedCustomerIds.length === 0)
      return false
    if (recipientMode === "csv" && phoneNumbers.length === 0) return false

    return true
  }, [
    selectedTemplate,
    variableValues,
    recipientMode,
    selectedCustomerIds,
    phoneNumbers,
    csvVariableColumns,
  ])

  // Get recipient count
  const recipientCount =
    recipientMode === "customers"
      ? selectedCustomerIds.length
      : phoneNumbers.length

  const handleSubmit = async () => {
    if (!selectedTemplate || !isValid) {
      toast({
        title: t("form.validationError"),
        variant: "destructive",
      })
      return
    }

    setIsSubmitting(true)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

      // Use templateName from API response (backend uses templateName)
      const templateName = selectedTemplate.templateName
      
      // For CSV mode with variable columns, merge CSV data with manual variable values
      let finalPayload: Record<string, unknown>
      
      if (recipientMode === "csv" && csvVariableColumns.length > 0) {
        // Merge CSV data per-row with manual variable values
        // CSV columns override manual values for those specific variables
        const mergedCsvData = csvData.map(row => {
          const merged: Record<string, string> = { phoneNumber: row.phoneNumber }
          // First, add manual variable values
          for (const [key, value] of Object.entries(variableValues)) {
            merged[key] = value
          }
          // Then, override with CSV values (CSV takes precedence)
          for (const col of csvVariableColumns) {
            if (row[col]) {
              merged[col] = row[col]
            }
          }
          return merged
        })
        
        finalPayload = {
          templateName,
          languageCode: selectedTemplate.language,
          csvData: mergedCsvData,
          recipientSource: recipientMode,
          messageDelayMs: parseInt(messageDelay, 10),
          ...(selectedPhoneNumber ? { phoneNumberId: selectedPhoneNumber.phoneNumberId } : {}),
        }
      } else {
        // Original behavior for customers mode or CSV without variable columns
        finalPayload = {
          templateName,
          languageCode: selectedTemplate.language,
          variableValues,
          recipientSource: recipientMode,
          messageDelayMs: parseInt(messageDelay, 10),
          ...(selectedPhoneNumber ? { phoneNumberId: selectedPhoneNumber.phoneNumberId } : {}),
          ...(recipientMode === "customers"
            ? { customerIds: selectedCustomerIds }
            : { phoneNumbers }),
        }
      }

      const response = await fetch(`${apiUrl}/api/v1/broadcast/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(finalPayload),
      })

      const result = await response.json()

      if (process.env.NODE_ENV === "development") {
        console.log('Broadcast response:', { status: response.status, result })
      }

      if (response.ok && result.success) {
        toast({
          title: t("form.success"),
        })

        // Reset form
        setSelectedTemplate(null)
        setVariableValues({})
        setSelectedCustomerIds([])
        setPhoneNumbers([])

        // Redirect to active jobs tab
        const params = new URLSearchParams(searchParams.toString())
        params.set("tab", "active")
        router.push(`${pathname}?${params.toString()}`)

        onSuccess?.()
      } else {
        console.error("Broadcast error:", result.error)
        toast({
          title: result.error?.message || t("form.error"),
          description: result.error?.code ? `Error code: ${result.error.code}` : undefined,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Broadcast submit error:", error)
      toast({
        title: t("form.error"),
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Left Column - Form */}
      <div className="space-y-6">
        {/* Pricing Info Alert */}
        <Alert>
          <IconInfoCircle className="h-4 w-4" />
          <AlertTitle>{t("pricingInfo.title")}</AlertTitle>
          <AlertDescription className="mt-2">
            <p className="mb-3">{t("pricingInfo.description")}</p>
            <div className="flex flex-wrap gap-3">
              <a
                href="https://business.whatsapp.com/products/platform-pricing?country=Indonesia&currency=Indonesian%20Rupiah%20(IDR)&category=Marketing"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t("pricingInfo.pricingLink")}
                <IconExternalLink className="h-3 w-3" />
              </a>
              <a
                href="https://business.facebook.com/billing_hub/payment_methods"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                {t("pricingInfo.paymentLink")}
                <IconExternalLink className="h-3 w-3" />
              </a>
            </div>
          </AlertDescription>
        </Alert>

        {/* Phone Number Selection - show if no prop provided and multiple numbers */}
        {propPhoneNumberId === undefined && whatsappPhoneNumbers.length > 1 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Pilih Nomor Pengirim</CardTitle>
            </CardHeader>
            <CardContent>
              <WhatsAppPhoneSelector
                phoneNumbers={whatsappPhoneNumbers}
                selectedId={selectedPhoneNumberId}
                onSelect={setSelectedPhoneNumberId}
                showAllOption={false}
                className="h-9 w-full text-sm"
              />
            </CardContent>
          </Card>
        )}

        {/* Step 1: Template Selection */}
        <TemplateSelector
          selected={selectedTemplate}
          onSelect={handleTemplateSelect}
          showPreview={false}
          whatsappAccountId={selectedWhatsappAccountId}
        />

        {/* Step 2: Variable Input (if template has variables) */}
        {selectedTemplate && (
          <VariableInput
            template={selectedTemplate}
            values={variableValues}
            onChange={setVariableValues}
            recipientMode={recipientMode}
            csvVariableColumns={csvVariableColumns}
          />
        )}

        {/* Step 3: Recipient Selection */}
        {selectedTemplate && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {t("recipientSelector.title")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Tabs
                value={recipientMode}
                onValueChange={(v) => setRecipientMode(v as RecipientMode)}
              >
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger value="customers" className="gap-2">
                    <IconUsers className="h-4 w-4" />
                    {t("recipientSelector.fromCustomers")}
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="gap-2">
                    <IconFileTypeCsv className="h-4 w-4" />
                    {t("recipientSelector.fromCsv")}
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="customers">
                  <CustomerSelector
                    selectedIds={selectedCustomerIds}
                    onSelectionChange={setSelectedCustomerIds}
                    whatsappPhoneNumberId={selectedPhoneNumberId}
                    templateCategory={selectedTemplate?.category ?? null}
                  />
                </TabsContent>

                <TabsContent value="csv">
                  <CsvUploader
                    phoneNumbers={phoneNumbers}
                    onPhoneNumbersChange={setPhoneNumbers}
                    onCsvDataChange={handleCsvDataChange}
                  />
                </TabsContent>
              </Tabs>

              {/* Delay Setting */}
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 mb-2">
                  <IconClock className="h-4 w-4 text-muted-foreground" />
                  <Label className="text-sm font-medium">
                    {t("form.delayLabel")}
                  </Label>
                </div>
                <Select value={messageDelay} onValueChange={setMessageDelay}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DELAY_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {t("form.delayDescription")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Submit Button */}
        {selectedTemplate && (
          <div className="flex items-center justify-between border-t pt-4">
            <div className="text-muted-foreground text-sm">
              {recipientCount > 0 &&
                t("recipientSelector.selectedCount", { count: recipientCount })}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={!isValid || isSubmitting}
              className="gap-2"
            >
              {isSubmitting ? (
                <>
                  <IconLoader2 className="h-4 w-4 animate-spin" />
                  {t("form.sending")}
                </>
              ) : (
                <>
                  <IconSend className="h-4 w-4" />
                  {t("form.send")}
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Right Column - Live Preview */}
      <div className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <IconEye className="h-5 w-5" />
              <CardTitle className="text-base">
                {t("preview.title")}
              </CardTitle>
            </div>
            <CardDescription>{t("preview.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            {selectedTemplate ? (
              <TemplatePreviewLive
                template={selectedTemplate}
                variableValues={variableValues}
              />
            ) : (
              <div className="flex min-h-[300px] flex-col items-center justify-center rounded-lg border-2 border-dashed p-8 text-center">
                <IconEye className="text-muted-foreground mb-3 h-10 w-10" />
                <p className="text-muted-foreground text-sm">
                  {t("preview.placeholder")}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default BroadcastForm
