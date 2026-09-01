"use client"

import { useState, useEffect, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { format } from "date-fns"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  IconLink,
  IconCurrencyDollar,
  IconCalendar,
  IconPhoto,
  IconVideo,
  IconFile,
  IconLetterCase,
  IconLoader2,
  IconCheck,
  IconX,
  IconInfoCircle,
} from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { cn } from "@/lib/utils"

interface VariableFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

const VARIABLE_TYPES = [
  { value: "TEXT", icon: IconLetterCase },
  { value: "URL", icon: IconLink },
  { value: "CURRENCY", icon: IconCurrencyDollar },
  { value: "DATE", icon: IconCalendar },
  { value: "IMAGE", icon: IconPhoto },
  { value: "VIDEO", icon: IconVideo },
  { value: "DOCUMENT", icon: IconFile },
] as const

type VariableType = (typeof VARIABLE_TYPES)[number]["value"]

interface FormData {
  name: string
  type: VariableType
  description: string
  exampleValue: string
}

interface FormErrors {
  name?: string
  type?: string
  exampleValue?: string
}


// Type-specific placeholders
const TYPE_PLACEHOLDERS: Record<VariableType, string> = {
  TEXT: "John Doe",
  URL: "https://example.com/track/123",
  CURRENCY: "IDR 100,000",
  DATE: "2025-12-25",
  IMAGE: "https://example.com/image.jpg",
  VIDEO: "https://example.com/video.mp4",
  DOCUMENT: "https://example.com/document.pdf",
}

// Type-specific hints
const TYPE_HINTS: Record<VariableType, string> = {
  TEXT: "Any text value up to 1024 characters",
  URL: "Must start with http:// or https://",
  CURRENCY: "Format: IDR 100,000 or just 100000",
  DATE: "Format: YYYY-MM-DD or DD/MM/YYYY",
  IMAGE: "HTTPS URL or WhatsApp media ID (max 5MB, JPEG/PNG)",
  VIDEO: "HTTPS URL or WhatsApp media ID (max 16MB, MP4/3GPP)",
  DOCUMENT: "HTTPS URL or WhatsApp media ID (max 100MB, PDF/DOC/XLS/PPT)",
}

// Validation functions
const validateUrl = (url: string): boolean => {
  if (!url) return true
  try {
    const parsed = new URL(url)
    return parsed.protocol === "http:" || parsed.protocol === "https:"
  } catch {
    return false
  }
}

const validateCurrency = (value: string): boolean => {
  if (!value) return true
  const numberOnlyPattern = /^[\d,]+(?:\.\d{1,2})?$/
  const currencyWithCodePattern = /^[A-Z]{3}\s+[\d,]+(?:\.\d{1,2})?$/
  return numberOnlyPattern.test(value.trim()) || currencyWithCodePattern.test(value.trim())
}

const validateDate = (value: string): boolean => {
  if (!value) return true
  const isoPattern = /^\d{4}-\d{2}-\d{2}$/
  const ddmmyyyyPattern = /^\d{2}[/-]\d{2}[/-]\d{4}$/
  
  if (!isoPattern.test(value) && !ddmmyyyyPattern.test(value)) {
    return false
  }
  
  const date = new Date(value)
  return !isNaN(date.getTime())
}

const validateMediaUrl = (value: string): boolean => {
  if (!value) return true
  if (value.startsWith("http://") || value.startsWith("https://")) {
    if (value.startsWith("http://")) return false
    return validateUrl(value)
  }
  return /^[\w-]+$/.test(value)
}

export function VariableFormDialog({
  open,
  onOpenChange,
  onSuccess,
}: VariableFormDialogProps) {
  const t = useTranslations("templates.variables")
  const tCommon = useTranslations("common")
  const { toast } = useToast()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState<FormData>({
    name: "",
    type: "TEXT",
    description: "",
    exampleValue: "",
  })
  const [errors, setErrors] = useState<FormErrors>({})
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Reset form when dialog opens/closes
  useEffect(() => {
    if (open) {
      setFormData({
        name: "",
        type: "TEXT",
        description: "",
        exampleValue: "",
      })
      setErrors({})
    }
  }, [open])

  // Validate example value based on type
  const validateExampleValue = useCallback(
    (value: string, type: VariableType): string | undefined => {
      if (!value) return undefined

      switch (type) {
        case "URL":
          if (!validateUrl(value)) {
            return t("form.validation.invalidUrl")
          }
          break
        case "CURRENCY":
          if (!validateCurrency(value)) {
            return t("form.validation.invalidCurrency")
          }
          break
        case "DATE":
          if (!validateDate(value)) {
            return t("form.validation.invalidDate")
          }
          break
        case "IMAGE":
        case "VIDEO":
        case "DOCUMENT":
          if (!validateMediaUrl(value)) {
            return t("form.validation.invalidMediaUrl")
          }
          break
      }
      return undefined
    },
    [t]
  )

  // Real-time validation status for example value
  const exampleValueValidation = useMemo(() => {
    if (!formData.exampleValue) return null
    const error = validateExampleValue(formData.exampleValue, formData.type)
    return { valid: !error, error }
  }, [formData.exampleValue, formData.type, validateExampleValue])

  // Full form validation
  const validate = useCallback((): boolean => {
    const newErrors: FormErrors = {}

    if (!formData.name.trim()) {
      newErrors.name = t("form.nameRequired")
    } else if (formData.name.length > 100) {
      newErrors.name = t("form.validation.nameTooLong")
    }

    if (!formData.type) {
      newErrors.type = t("form.typeRequired")
    }

    if (formData.exampleValue) {
      const exampleError = validateExampleValue(formData.exampleValue, formData.type)
      if (exampleError) {
        newErrors.exampleValue = exampleError
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [formData, t, validateExampleValue])

  // Handle type change - clear example value if type changes
  const handleTypeChange = (newType: VariableType) => {
    setFormData((prev) => ({
      ...prev,
      type: newType,
      exampleValue: "",
    }))
    setErrors((prev) => ({ ...prev, exampleValue: undefined }))
  }

  // Handle date selection from calendar
  const handleDateSelect = (date: Date | undefined) => {
    if (date) {
      const formattedDate = format(date, "yyyy-MM-dd")
      setFormData((prev) => ({ ...prev, exampleValue: formattedDate }))
    }
    setDatePickerOpen(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validate()) return

    setLoading(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

      const response = await fetch(`${apiUrl}/api/v1/template-variables`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          name: formData.name.trim(),
          type: formData.type,
          description: formData.description.trim() || null,
          exampleValue: formData.exampleValue.trim() || null,
        }),
      })

      if (response.ok) {
        toast({
          title: t("toast.created"),
        })
        onSuccess()
      } else {
        const result = await response.json()
        let errorMessage = result.error?.message || t("toast.saveFailed")
        if (result.error?.code === "Conflict") {
          errorMessage = t("toast.nameExists")
        }
        toast({
          title: t("toast.error"),
          description: errorMessage,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error saving variable:", error)
      toast({
        title: t("toast.error"),
        description: t("toast.networkError"),
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }


  // Render type-specific example value input
  const renderExampleValueInput = () => {
    const baseInputProps = {
      id: "exampleValue",
      value: formData.exampleValue,
      placeholder: TYPE_PLACEHOLDERS[formData.type],
      className: cn(
        errors.exampleValue ? "border-destructive" : "",
        exampleValueValidation?.valid === true && formData.exampleValue
          ? "border-green-500 focus-visible:ring-green-500"
          : ""
      ),
    }

    switch (formData.type) {
      case "DATE":
        return (
          <div className="flex gap-2">
            <Input
              {...baseInputProps}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, exampleValue: e.target.value }))
              }
              className={cn(baseInputProps.className, "flex-1")}
            />
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="shrink-0"
                >
                  <IconCalendar className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={
                    formData.exampleValue
                      ? new Date(formData.exampleValue)
                      : undefined
                  }
                  onSelect={handleDateSelect}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        )

      case "CURRENCY":
        return (
          <div className="relative">
            <Input
              {...baseInputProps}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, exampleValue: e.target.value }))
              }
              className={cn(baseInputProps.className, "pl-10")}
            />
            <IconCurrencyDollar className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
          </div>
        )

      case "URL":
      case "IMAGE":
      case "VIDEO":
      case "DOCUMENT":
        return (
          <div className="relative">
            <Input
              {...baseInputProps}
              type="url"
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, exampleValue: e.target.value }))
              }
              className={cn(baseInputProps.className, "pl-10 pr-10")}
            />
            <IconLink className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            {formData.exampleValue && exampleValueValidation && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {exampleValueValidation.valid ? (
                  <IconCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <IconX className="h-4 w-4 text-destructive" />
                )}
              </div>
            )}
          </div>
        )

      default:
        return (
          <div className="relative">
            <Input
              {...baseInputProps}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, exampleValue: e.target.value }))
              }
              className={cn(baseInputProps.className, "pr-10")}
            />
            {formData.exampleValue && exampleValueValidation && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2">
                {exampleValueValidation.valid ? (
                  <IconCheck className="h-4 w-4 text-green-500" />
                ) : (
                  <IconX className="h-4 w-4 text-destructive" />
                )}
              </div>
            )}
          </div>
        )
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{t("createVariable")}</DialogTitle>
          <DialogDescription>{t("form.createDescription")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Variable Name */}
          <div className="space-y-2">
            <Label htmlFor="name">{t("name")} *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder={t("form.namePlaceholder")}
              className={errors.name ? "border-destructive" : ""}
              maxLength={100}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name}</p>
            )}
          </div>

          {/* Variable Type */}
          <div className="space-y-2">
            <Label htmlFor="type">{t("type")} *</Label>
            <Select value={formData.type} onValueChange={handleTypeChange}>
              <SelectTrigger
                className={errors.type ? "border-destructive" : ""}
              >
                <SelectValue placeholder={t("form.selectType")} />
              </SelectTrigger>
              <SelectContent>
                {VARIABLE_TYPES.map(({ value, icon: Icon }) => (
                  <SelectItem key={value} value={value}>
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      {t(`types.${value}`)}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && (
              <p className="text-destructive text-sm">{errors.type}</p>
            )}
            <p className="text-muted-foreground flex items-center gap-1 text-xs">
              <IconInfoCircle className="h-3 w-3" />
              {TYPE_HINTS[formData.type]}
            </p>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">{t("fieldDescription")}</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, description: e.target.value }))
              }
              placeholder={t("form.descriptionPlaceholder")}
              rows={2}
              maxLength={500}
            />
          </div>

          {/* Example Value */}
          <div className="space-y-2">
            <Label htmlFor="exampleValue">{t("exampleValue")}</Label>
            {renderExampleValueInput()}
            {errors.exampleValue && (
              <p className="text-destructive text-sm">{errors.exampleValue}</p>
            )}
            {!errors.exampleValue &&
              exampleValueValidation?.valid === false &&
              formData.exampleValue && (
                <p className="text-destructive text-sm">
                  {exampleValueValidation.error}
                </p>
              )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              {tCommon("cancel")}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading && <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />}
              {tCommon("create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
