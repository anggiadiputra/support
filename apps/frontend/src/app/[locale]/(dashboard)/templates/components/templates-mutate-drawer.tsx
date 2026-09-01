"use client"

import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { useState, useEffect, useRef, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { useToast } from "@/hooks/use-toast"
import { useCreateTemplate, type CreateTemplateInput } from "@/hooks/use-templates"
import { Template } from "../data/schema"
import { categories, languages } from "../data/data"
import type { TemplateVariable } from "./variable-library"
import {
  IconVariable,
  IconLoader2,
  IconLink,
  IconCurrencyDollar,
  IconCalendar,
  IconPhoto,
  IconVideo,
  IconFile,
  IconLetterCase,
  IconPlus,
  IconEye,
  IconAlertTriangle,
  IconAlertCircle,
  IconShieldLock,
  IconClock,
  IconCopy,
} from "@tabler/icons-react"
import { Alert, AlertDescription } from "@/components/ui/alert"
import type { WhatsAppPhoneNumberOption } from "@/hooks/use-whatsapp-phone-numbers"
import {
  validateTemplateContent,
  renderContentWithHighlights,
  type ValidationIssue,
} from "@/lib/validations/template-rules"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  currentRow?: Template
  phoneNumbers?: WhatsAppPhoneNumberOption[]
  defaultWhatsappAccountId?: string
}

const formSchema = z.object({
  name: z
    .string()
    .min(1, "Template name is required")
    .max(512, "Name is too long")
    .regex(/^[a-z0-9_]+$/, "Only lowercase letters, numbers, and underscores"),
  category: z.enum(["MARKETING", "UTILITY", "AUTHENTICATION"]),
  language: z.string().min(1, "Please select a language"),
  // For MARKETING/UTILITY templates
  content: z
    .string()
    .max(1024, "Content is too long")
    .optional(),
  headerType: z
    .enum(["TEXT", "IMAGE", "VIDEO", "DOCUMENT"])
    .optional()
    .nullable(),
  headerContent: z.string().optional(),
  footerText: z.string().max(60, "Footer is too long").optional(),
  // For AUTHENTICATION templates
  addSecurityRecommendation: z.boolean().optional(),
  codeExpirationMinutes: z.number().min(1).max(90).optional().nullable(),
  otpType: z.enum(["COPY_CODE"]).optional(),
  copyCodeButtonText: z.string().max(25).optional(),
}).refine((data) => {
  // For non-AUTHENTICATION, content is required
  if (data.category !== "AUTHENTICATION") {
    return data.content && data.content.length > 0
  }
  return true
}, {
  message: "Message content is required",
  path: ["content"]
})

type TemplateForm = z.infer<typeof formSchema>

const typeIcons: Record<string, React.ElementType> = {
  TEXT: IconLetterCase,
  URL: IconLink,
  CURRENCY: IconCurrencyDollar,
  DATE: IconCalendar,
  IMAGE: IconPhoto,
  VIDEO: IconVideo,
  DOCUMENT: IconFile,
}

const typeColors: Record<string, string> = {
  TEXT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  URL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  CURRENCY: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  DATE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  IMAGE: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  VIDEO: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  DOCUMENT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
}

// Extract variable count from content
function getVariableCount(content: string): number {
  const matches = content.match(/\{\{(\d+)\}\}/g)
  return matches ? matches.length : 0
}

// Get next variable number
function getNextVariableNumber(content: string): number {
  const matches = content.match(/\{\{(\d+)\}\}/g)
  if (!matches) return 1
  const numbers = matches.map((m) => parseInt(m.replace(/[{}]/g, "")))
  return Math.max(...numbers) + 1
}

// Extract all unique variable numbers from content, sorted
function extractVariableNumbers(content: string): number[] {
  const matches = content.match(/\{\{(\d+)\}\}/g)
  if (!matches) return []
  const numbers = [...new Set(matches.map((m) => parseInt(m.replace(/[{}]/g, ""))))]
  return numbers.sort((a, b) => a - b)
}

export function TemplatesMutateDrawer({
  open,
  onOpenChange,
  currentRow,
  phoneNumbers,
  defaultWhatsappAccountId,
}: Props) {
  const t = useTranslations("templates")
  const tCommon = useTranslations("common")
  const isUpdate = !!currentRow
  const { userId } = useBusinessAccount()
  const { toast } = useToast()
  const contentRef = useRef<HTMLTextAreaElement>(null)

  // Use mutation hook with cache invalidation
  // Requirements: 3.2, 8.1
  const createMutation = useCreateTemplate()

  // Phone number / account selection for template creation
  const [selectedAccountId, setSelectedAccountId] = useState<string | undefined>(defaultWhatsappAccountId)

  // Variable library state
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [loadingVariables, setLoadingVariables] = useState(false)
  const [variablePopoverOpen, setVariablePopoverOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)

  // Track variable mappings (position -> variable)
  const [variableMappings, setVariableMappings] = useState<
    Map<number, TemplateVariable>
  >(new Map())

  // Track inline example values for variables (position -> example value)
  const [inlineExamples, setInlineExamples] = useState<Map<number, string>>(
    new Map()
  )

  // Validation state
  const [validationIssues, setValidationIssues] = useState<ValidationIssue[]>([])

  const form = useForm<TemplateForm>({
    resolver: zodResolver(formSchema),
    mode: "onChange", // Validate on every change for real-time feedback
    defaultValues: currentRow
      ? {
          name: currentRow.templateName,
          category: currentRow.category,
          language: currentRow.language,
          content: currentRow.content,
          headerType: currentRow.headerType,
          headerContent: currentRow.headerContent || "",
          footerText: currentRow.footerText || "",
        }
      : {
          name: "",
          category: undefined,
          language: "en_US",
          content: "",
          headerType: null,
          headerContent: "",
          footerText: "",
          // Authentication defaults
          addSecurityRecommendation: true,
          codeExpirationMinutes: 5,
          otpType: "COPY_CODE",
          copyCodeButtonText: "",
        },
  })

  const content = form.watch("content")
  const category = form.watch("category")
  const headerType = form.watch("headerType")
  const headerContent = form.watch("headerContent")
  const footerText = form.watch("footerText")

  // Check if this is an authentication template
  const isAuthentication = category === "AUTHENTICATION"

  // Extract detected variable numbers from content
  const detectedVariables = extractVariableNumbers(content || "")

  // Real-time validation effect
  useEffect(() => {
    // For AUTHENTICATION templates, validation is simpler since body is fixed
    if (isAuthentication) {
      setValidationIssues([])
      return
    }

    if (!content) {
      setValidationIssues([])
      return
    }

    const result = validateTemplateContent({
      content,
      category,
      footerContent: footerText,
      headerContent: headerContent,
      headerType: headerType,
    })

    setValidationIssues(result.issues)
  }, [content, category, footerText, headerContent, headerType, isAuthentication])

  // Load variables from library
  const loadVariables = useCallback(async () => {
    setLoadingVariables(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(`${apiUrl}/api/v1/template-variables`, {
        credentials: "include",
      })
      if (response.ok) {
        const result = await response.json()
        setVariables(result.data || [])
      }
    } catch (error) {
      console.error("Error loading variables:", error)
    } finally {
      setLoadingVariables(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadVariables()
      setVariableMappings(new Map())
      setInlineExamples(new Map())
      setShowPreview(false)
      setSelectedAccountId(defaultWhatsappAccountId)
      setValidationIssues([])
    }
  }, [open, loadVariables, defaultWhatsappAccountId])

  // Insert variable placeholder at cursor position
  const insertVariable = (variable: TemplateVariable) => {
    const textarea = contentRef.current
    if (!textarea) return

    const currentContent = form.getValues("content") || ""
    const cursorPos = textarea.selectionStart
    const nextNum = getNextVariableNumber(currentContent)
    const placeholder = `{{${nextNum}}}`

    const newContent =
      currentContent.slice(0, cursorPos) +
      placeholder +
      currentContent.slice(cursorPos)

    form.setValue("content", newContent)

    // Track mapping
    setVariableMappings((prev) => {
      const newMap = new Map(prev)
      newMap.set(nextNum, variable)
      return newMap
    })

    setVariablePopoverOpen(false)

    // Focus back to textarea and set cursor after inserted placeholder
    setTimeout(() => {
      textarea.focus()
      const newPos = cursorPos + placeholder.length
      textarea.setSelectionRange(newPos, newPos)
    }, 0)
  }

  // Render preview with example values
  const renderPreview = () => {
    let previewContent = content || ""

    // Replace variables with example values from mappings first
    variableMappings.forEach((variable, position) => {
      const placeholder = `{{${position}}}`
      const exampleValue = variable.exampleValue || `[${variable.name}]`
      previewContent = previewContent.replace(placeholder, exampleValue)
    })

    // Replace remaining placeholders with inline examples or generic text
    previewContent = previewContent.replace(
      /\{\{(\d+)\}\}/g,
      (_, num) => {
        const inlineExample = inlineExamples.get(parseInt(num))
        if (inlineExample) {
          return inlineExample
        }
        return `[Variable ${num}]`
      }
    )

    return previewContent
  }

  // Render preview content with highlighted errors
  const renderPreviewWithHighlights = () => {
    const currentContent = content || ""
    
    if (validationIssues.length === 0) {
      return <span>{renderPreview()}</span>
    }

    // Get segments with highlights
    const segments = renderContentWithHighlights(currentContent, validationIssues)

    return (
      <>
        {segments.map((segment, index) => {
          if (segment.highlighted) {
            return (
              <mark
                key={index}
                className="bg-destructive/20 text-destructive rounded px-0.5"
                title={segment.issueRule ? t(`form.validation.${
                  segment.issueRule === "VARIABLE_AT_START" ? "variableAtStart" :
                  segment.issueRule === "VARIABLE_AT_END" ? "variableAtEnd" :
                  segment.issueRule === "ADJACENT_VARIABLES" ? "adjacentVariables" :
                  segment.issueRule === "BODY_TOO_LONG" ? "bodyTooLong" : ""
                }`) : undefined}
              >
                {segment.text}
              </mark>
            )
          }
          
          // Apply variable replacement for non-highlighted segments
          let processedText = segment.text
          variableMappings.forEach((variable, position) => {
            const placeholder = `{{${position}}}`
            const exampleValue = variable.exampleValue || `[${variable.name}]`
            processedText = processedText.replace(placeholder, exampleValue)
          })
          processedText = processedText.replace(
            /\{\{(\d+)\}\}/g,
            (_, num) => {
              const inlineExample = inlineExamples.get(parseInt(num))
              return inlineExample || `[Variable ${num}]`
            }
          )
          
          return <span key={index}>{processedText}</span>
        })}
      </>
    )
  }

  const onSubmit = async (data: TemplateForm) => {
    if (!userId) {
      toast({
        title: t("toast.error"),
        description: "User ID not found",
        variant: "destructive",
      })
      return
    }

    setSubmitting(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

      // Build payload based on category
      let payload: CreateTemplateInput

      if (data.category === "AUTHENTICATION") {
        // AUTHENTICATION template has special structure
        payload = {
          userId,
          templateName: data.name,
          category: data.category,
          language: data.language,
          // For AUTH, content is fixed by Meta, we just send a placeholder
          content: "*{{1}}* is your verification code.",
          whatsappAccountId: selectedAccountId,
          // Authentication-specific fields
          addSecurityRecommendation: data.addSecurityRecommendation,
          codeExpirationMinutes: data.codeExpirationMinutes || undefined,
          otpType: data.otpType || "COPY_CODE",
          copyCodeButtonText: data.copyCodeButtonText || undefined,
          // Auth templates have OTP button with all config for submit.ts to read
          buttons: [
            {
              type: "OTP",
              otp_type: data.otpType || "COPY_CODE",
              text: data.copyCodeButtonText || undefined,
              // Store these for submit.ts to read when building Meta API payload
              add_security_recommendation: data.addSecurityRecommendation ?? true,
              code_expiration_minutes: data.codeExpirationMinutes || undefined,
            },
          ],
        }
      } else {
        // MARKETING/UTILITY templates
        // Extract variable example values in order for Meta API
        const variableExamples: string[] = []
        const detectedVars = extractVariableNumbers(data.content || "")
        if (detectedVars.length > 0) {
          for (const num of detectedVars) {
            // First check if there's a variable mapping
            const mappedVariable = variableMappings.get(num)
            if (mappedVariable) {
              variableExamples.push(mappedVariable.exampleValue || `[${mappedVariable.name}]`)
            } else {
              // Otherwise use inline example or fallback
              const inlineExample = inlineExamples.get(num)
              variableExamples.push(inlineExample || `[Variable ${num}]`)
            }
          }
        }

        payload = {
          userId,
          templateName: data.name,
          category: data.category,
          language: data.language,
          content: data.content || "",
          headerType: data.headerType || undefined,
          headerContent: data.headerContent || undefined,
          footerContent: data.footerText || undefined,
          variables: variableExamples.length > 0 ? variableExamples : undefined,
          whatsappAccountId: selectedAccountId,
        }
      }

      if (isUpdate) {
        // For update, use direct fetch (no update hook yet)
        const url = `${apiUrl}/api/v1/templates/${currentRow.id}`
        const response = await fetch(url, {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include",
          body: JSON.stringify(payload),
        })

        if (!response.ok) {
          const result = await response.json()
          throw new Error(result.error?.message || t("toast.saveFailed"))
        }
      } else {
        // Use mutation hook for create with cache invalidation
        await createMutation.mutateAsync(payload)
      }

      // Save variable mappings if any
      if (variableMappings.size > 0) {
        const mappingsPayload = {
          templateName: data.name,
          mappings: Array.from(variableMappings.entries()).map(
            ([position, variable]) => ({
              componentType: "body",
              componentIndex: 0,
              parameterIndex: position,
              variableId: variable.id,
            })
          ),
        }

        await fetch(`${apiUrl}/api/v1/template-variables/mappings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(mappingsPayload),
        })
      }

      toast({
        title: isUpdate ? t("toast.updated") : t("toast.created"),
        description: t("toast.submitToMeta"),
      })
      onOpenChange(false)
      form.reset()
    } catch (error: any) {
      console.error("Error saving template:", error)
      toast({
        title: t("toast.error"),
        description: error.message || t("toast.networkError"),
        variant: "destructive",
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v)
        if (!v) {
          form.reset()
          setVariableMappings(new Map())
          setInlineExamples(new Map())
          setValidationIssues([])
        }
      }}
    >
      <SheetContent className="flex flex-col overflow-y-auto sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>
            {isUpdate ? t("form.updateTitle") : t("form.createTitle")}
          </SheetTitle>
          <SheetDescription>
            {isUpdate ? t("form.updateDescription") : t("form.createDescription")}
          </SheetDescription>
        </SheetHeader>

        <div className="px-6 py-2">
          <Alert className="bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900">
            <IconAlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertDescription className="text-amber-700 dark:text-amber-300 text-xs">
              {t("form.metaWarmupWarning")}
            </AlertDescription>
          </Alert>
        </div>

        <div className="flex-1 space-y-6 py-4">
          <Form {...form}>
            <form
              id="templates-form"
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-5"
            >
              {/* WhatsApp Account Selector - show when multiple accounts exist */}
              {!isUpdate && phoneNumbers && phoneNumbers.length > 1 && (() => {
                // Group phone numbers by account
                const accountMap = new Map<string, { wabaId: string; phones: typeof phoneNumbers }>()
                for (const pn of phoneNumbers) {
                  if (!accountMap.has(pn.whatsappAccountId)) {
                    accountMap.set(pn.whatsappAccountId, { wabaId: pn.wabaId, phones: [] })
                  }
                  accountMap.get(pn.whatsappAccountId)!.phones.push(pn)
                }
                // Only show if more than 1 account
                if (accountMap.size <= 1) return null
                return (
                  <FormItem>
                    <FormLabel>{t("form.whatsappAccount")} *</FormLabel>
                    <Select
                      value={selectedAccountId || ""}
                      onValueChange={(value) => setSelectedAccountId(value)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("form.selectAccount")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Array.from(accountMap.entries()).map(([accountId, { phones }]) => {
                          const display = phones.map(p => p.displayPhoneNumber).join(", ")
                          const name = phones[0]?.verifiedName
                          return (
                            <SelectItem key={accountId} value={accountId}>
                              <div className="flex flex-col">
                                <span>{name || display}</span>
                                {name && <span className="text-xs text-muted-foreground">{display}</span>}
                              </div>
                            </SelectItem>
                          )
                        })}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      {t("form.selectAccountHint")}
                    </FormDescription>
                  </FormItem>
                )
              })()}

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("form.templateName")} *</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="welcome_message"
                        {...field}
                        disabled={isUpdate}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("form.templateNameHint")}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.category")} *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("form.selectCategory")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {categories.map((cat) => (
                            <SelectItem key={cat.value} value={cat.value}>
                              <div className="flex items-center gap-2">
                                {cat.icon && <cat.icon className="h-4 w-4" />}
                                <span>{cat.label}</span>
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="language"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.language")} *</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("form.selectLanguage")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {languages.map((lang) => (
                            <SelectItem key={lang.value} value={lang.value}>
                              {lang.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* AUTHENTICATION Template Special UI */}
              {isAuthentication ? (
                <div className="space-y-4">
                  {/* Info Alert about fixed body text */}
                  <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900">
                    <IconShieldLock className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <AlertDescription className="text-blue-700 dark:text-blue-300 text-sm">
                      {t("form.auth.fixedBodyInfo")}
                    </AlertDescription>
                  </Alert>

                  {/* Preview of fixed body text */}
                  <div className="rounded-lg border p-4 bg-muted/30">
                    <div className="text-sm font-medium mb-2">{t("form.auth.bodyPreview")}</div>
                    <div className="bg-background rounded-lg p-3 text-sm font-mono">
                      <span className="font-bold">*123456*</span> {t("form.auth.verificationCodeText")}
                      {form.watch("addSecurityRecommendation") && (
                        <span className="block mt-1 text-muted-foreground">
                          {t("form.auth.securityRecommendationText")}
                        </span>
                      )}
                    </div>
                    {form.watch("codeExpirationMinutes") && (
                      <div className="text-xs text-muted-foreground mt-2">
                        {t("form.auth.expirationText", { minutes: form.watch("codeExpirationMinutes") ?? 0 })}
                      </div>
                    )}
                  </div>

                  {/* Security Recommendation Checkbox */}
                  <FormField
                    control={form.control}
                    name="addSecurityRecommendation"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                        <FormControl>
                          <input
                            type="checkbox"
                            checked={field.value}
                            onChange={field.onChange}
                            className="h-4 w-4 rounded border-gray-300"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <FormLabel className="flex items-center gap-2">
                            <IconShieldLock className="h-4 w-4" />
                            {t("form.auth.addSecurityRecommendation")}
                          </FormLabel>
                          <FormDescription>
                            {t("form.auth.addSecurityRecommendationHint")}
                          </FormDescription>
                        </div>
                      </FormItem>
                    )}
                  />

                  {/* Code Expiration Minutes */}
                  <FormField
                    control={form.control}
                    name="codeExpirationMinutes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <IconClock className="h-4 w-4" />
                          {t("form.auth.codeExpiration")}
                        </FormLabel>
                        <Select
                          onValueChange={(val) => field.onChange(val === "none" ? null : parseInt(val))}
                          value={field.value?.toString() || "none"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("form.auth.selectExpiration")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">{t("form.auth.noExpiration")}</SelectItem>
                            <SelectItem value="1">1 {t("form.auth.minute")}</SelectItem>
                            <SelectItem value="5">5 {t("form.auth.minutes")}</SelectItem>
                            <SelectItem value="10">10 {t("form.auth.minutes")}</SelectItem>
                            <SelectItem value="15">15 {t("form.auth.minutes")}</SelectItem>
                            <SelectItem value="30">30 {t("form.auth.minutes")}</SelectItem>
                            <SelectItem value="60">60 {t("form.auth.minutes")}</SelectItem>
                            <SelectItem value="90">90 {t("form.auth.minutes")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("form.auth.codeExpirationHint")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* OTP Button Type */}
                  <FormField
                    control={form.control}
                    name="otpType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-2">
                          <IconCopy className="h-4 w-4" />
                          {t("form.auth.otpButtonType")}
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || "COPY_CODE"}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="COPY_CODE">{t("form.auth.copyCode")}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {t("form.auth.otpButtonTypeHint")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Custom Button Text (optional) */}
                  <FormField
                    control={form.control}
                    name="copyCodeButtonText"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.auth.buttonText")}</FormLabel>
                        <FormControl>
                          <Input
                            placeholder={t("form.auth.buttonTextPlaceholder")}
                            maxLength={25}
                            {...field}
                          />
                        </FormControl>
                        <FormDescription>
                          {t("form.auth.buttonTextHint")}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : (
                <>
                  {/* Message Content with Variable Library - for MARKETING/UTILITY */}
                  <FormField
                    control={form.control}
                    name="content"
                    render={({ field }) => (
                      <FormItem>
                        <div className="flex items-center justify-between">
                          <FormLabel>{t("form.messageContent")} *</FormLabel>
                      <div className="flex items-center gap-2">
                        {getVariableCount(content || "") > 0 && (
                          <Badge variant="secondary" className="gap-1">
                            <IconVariable className="h-3 w-3" />
                            {getVariableCount(content || "")} {t("form.variables")}
                          </Badge>
                        )}
                        <Popover
                          open={variablePopoverOpen}
                          onOpenChange={setVariablePopoverOpen}
                        >
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 gap-1"
                            >
                              <IconPlus className="h-3 w-3" />
                              {t("form.insertVariable")}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            className="w-80 p-0"
                            align="end"
                            side="bottom"
                          >
                            <Command>
                              <CommandInput
                                placeholder={t("form.searchVariables")}
                              />
                              <CommandList>
                                <CommandEmpty>
                                  {loadingVariables
                                    ? t("form.loadingVariables")
                                    : t("form.noVariables")}
                                </CommandEmpty>
                                <CommandGroup heading={t("form.variableLibrary")}>
                                  {variables.map((variable) => {
                                    const TypeIcon =
                                      typeIcons[variable.type] || IconVariable
                                    return (
                                      <CommandItem
                                        key={variable.id}
                                        onSelect={() => insertVariable(variable)}
                                        className="flex items-center gap-2 cursor-pointer"
                                      >
                                        <Badge
                                          variant="secondary"
                                          className={`gap-1 shrink-0 ${typeColors[variable.type]}`}
                                        >
                                          <TypeIcon className="h-3 w-3" />
                                        </Badge>
                                        <div className="flex-1 min-w-0">
                                          <div className="font-medium truncate">
                                            {variable.name}
                                          </div>
                                          {variable.exampleValue && (
                                            <div className="text-muted-foreground text-xs truncate">
                                              {t("form.example")}:{" "}
                                              {variable.exampleValue}
                                            </div>
                                          )}
                                        </div>
                                      </CommandItem>
                                    )
                                  })}
                                </CommandGroup>
                              </CommandList>
                            </Command>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>
                    <FormControl>
                      <Textarea
                        placeholder={t("form.messageContentPlaceholder")}
                        rows={6}
                        {...field}
                        ref={(e) => {
                          field.ref(e)
                          // @ts-ignore
                          contentRef.current = e
                        }}
                      />
                    </FormControl>
                    <FormDescription>
                      {t("form.messageContentHint")}
                    </FormDescription>
                    <FormMessage />
                    {/* Real-time validation errors */}
                    {validationIssues.filter(issue => 
                      ["VARIABLE_AT_START", "VARIABLE_AT_END", "ADJACENT_VARIABLES", "TOO_MANY_EMOJIS", "BODY_TOO_LONG", "AUTH_NO_EMOJIS", "AUTH_NO_URLS", "AUTH_NO_MEDIA_HEADER", "AUTH_REQUIRES_OTP_BUTTON"].includes(issue.rule)
                    ).length > 0 && (
                      <div className="mt-2 space-y-1">
                        {validationIssues
                          .filter(issue => 
                            ["VARIABLE_AT_START", "VARIABLE_AT_END", "ADJACENT_VARIABLES", "TOO_MANY_EMOJIS", "BODY_TOO_LONG", "AUTH_NO_EMOJIS", "AUTH_NO_URLS", "AUTH_NO_MEDIA_HEADER", "AUTH_REQUIRES_OTP_BUTTON"].includes(issue.rule)
                          )
                          .map((issue) => (
                            <p
                              key={issue.rule}
                              className="text-sm text-destructive flex items-center gap-1.5"
                            >
                              <IconAlertCircle className="h-4 w-4 shrink-0" />
                              {t(`form.validation.${issue.messageId}`)}
                            </p>
                          ))}
                      </div>
                    )}
                  </FormItem>
                )}
              />

              {/* Inline Variable Examples */}
              {detectedVariables.length > 0 && (
                <div className="rounded-lg border p-4 space-y-3 bg-muted/30">
                  <div className="text-sm font-medium flex items-center gap-2">
                    <IconVariable className="h-4 w-4" />
                    {t("form.variableExamples")}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {t("form.variableExamplesHint")}
                  </p>
                  <div className="grid gap-3">
                    {detectedVariables.map((num) => {
                      const mappedVariable = variableMappings.get(num)
                      return (
                        <div key={num} className="flex items-center gap-3">
                          <Badge variant="secondary" className="shrink-0 font-mono">
                            {`{{${num}}}`}
                          </Badge>
                          {mappedVariable ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <span>→</span>
                              <Badge
                                variant="outline"
                                className={`gap-1 ${typeColors[mappedVariable.type]}`}
                              >
                                {(() => {
                                  const TypeIcon = typeIcons[mappedVariable.type] || IconVariable
                                  return <TypeIcon className="h-3 w-3" />
                                })()}
                                {mappedVariable.name}
                              </Badge>
                              <span className="text-xs">
                                ({mappedVariable.exampleValue || "no example"})
                              </span>
                            </div>
                          ) : (
                            <Input
                              placeholder={t("form.examplePlaceholder", { num })}
                              value={inlineExamples.get(num) || ""}
                              onChange={(e) => {
                                setInlineExamples((prev) => {
                                  const newMap = new Map(prev)
                                  if (e.target.value) {
                                    newMap.set(num, e.target.value)
                                  } else {
                                    newMap.delete(num)
                                  }
                                  return newMap
                                })
                              }}
                              className="h-8 text-sm"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Variable Mappings Display */}
              {variableMappings.size > 0 && (
                <div className="rounded-lg border p-3 space-y-2">
                  <div className="text-sm font-medium">
                    {t("form.variableMappings")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {Array.from(variableMappings.entries()).map(
                      ([position, variable]) => {
                        const TypeIcon =
                          typeIcons[variable.type] || IconVariable
                        return (
                          <Badge
                            key={position}
                            variant="outline"
                            className="gap-1"
                          >
                            <span className="text-muted-foreground">
                              {`{{${position}}}`}
                            </span>
                            <span>→</span>
                            <TypeIcon className="h-3 w-3" />
                            <span>{variable.name}</span>
                          </Badge>
                        )
                      }
                    )}
                  </div>
                </div>
              )}
              </>
              )}

              {isUpdate && !isAuthentication && (
                <>
                  <FormField
                    control={form.control}
                    name="headerType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("form.headerType")}</FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          defaultValue={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("form.none")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="TEXT">
                              {t("form.headerText")}
                            </SelectItem>
                            <SelectItem value="IMAGE">
                              {t("form.headerImage")}
                            </SelectItem>
                            <SelectItem value="VIDEO">
                              {t("form.headerVideo")}
                            </SelectItem>
                            <SelectItem value="DOCUMENT">
                              {t("form.headerDocument")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {headerType === "TEXT" && (
                    <FormField
                      control={form.control}
                      name="headerContent"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("form.headerText")}</FormLabel>
                          <FormControl>
                            <Input placeholder="Special Offer!" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </>
              )}

              {/* Footer - hidden for AUTHENTICATION templates */}
              {!isAuthentication && (
                <FormField
                  control={form.control}
                  name="footerText"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("form.footerText")}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Reply STOP to unsubscribe"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>{t("form.footerTextHint")}</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </form>
          </Form>

          {/* Preview Section - for MARKETING/UTILITY only (AUTH has inline preview) */}
          {showPreview && content && !isAuthentication && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <IconEye className="h-4 w-4" />
                  {t("form.preview")}
                </div>
                <div className="bg-muted rounded-lg p-4">
                  <div className="bg-background max-w-sm rounded-lg p-3 shadow-sm">
                    {headerType === "TEXT" && headerContent && (
                      <div className="mb-2 font-semibold">{headerContent}</div>
                    )}
                    {headerType && headerType !== "TEXT" && (
                      <div className="bg-muted mb-2 flex h-32 items-center justify-center rounded">
                        {headerType === "IMAGE" && (
                          <IconPhoto className="text-muted-foreground h-8 w-8" />
                        )}
                        {headerType === "VIDEO" && (
                          <IconVideo className="text-muted-foreground h-8 w-8" />
                        )}
                        {headerType === "DOCUMENT" && (
                          <IconFile className="text-muted-foreground h-8 w-8" />
                        )}
                      </div>
                    )}
                    <div className="whitespace-pre-wrap text-sm">
                      {renderPreviewWithHighlights()}
                    </div>
                    {footerText && (
                      <div className="text-muted-foreground mt-2 text-xs">
                        {footerText}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <SheetFooter className="flex-col gap-2 sm:flex-row">
          {/* Hide preview button for AUTH templates (they have inline preview) */}
          {!isAuthentication && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowPreview(!showPreview)}
              className="w-full sm:w-auto"
            >
              <IconEye className="mr-2 h-4 w-4" />
              {showPreview ? t("form.hidePreview") : t("form.showPreview")}
            </Button>
          )}
          <div className="flex gap-2 w-full sm:w-auto">
            <SheetClose asChild>
              <Button type="button" variant="outline" className="flex-1 sm:flex-none">
                {tCommon("cancel")}
              </Button>
            </SheetClose>
            <Button
              type="submit"
              form="templates-form"
              size="sm"
              disabled={submitting || validationIssues.length > 0 || !form.formState.isValid}
              className="flex-1 sm:flex-none"
            >
              {submitting && (
                <IconLoader2 className="h-4 w-4 animate-spin" />
              )}
              {isUpdate ? t("form.updateTemplate") : t("form.createTemplate")}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
