"use client"

import { useMemo, useState } from "react"
import { useTranslations } from "next-intl"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { IconVariable, IconAlertCircle, IconPhoto, IconVideo, IconFile, IconCopy, IconUser, IconChevronDown, IconFileTypeCsv } from "@tabler/icons-react"
import type { Template } from "../../templates/data/schema"

interface VariableInputProps {
  template: Template
  values: Record<string, string>
  onChange: (values: Record<string, string>) => void
  /** Mode penerima - jika 'customers', tampilkan opsi placeholder customer */
  recipientMode?: "customers" | "csv"
  /** Variable columns from CSV file - these will be disabled for manual input */
  csvVariableColumns?: string[]
}

/**
 * Customer field placeholders yang bisa digunakan
 * Placeholder ini akan di-resolve di backend berdasarkan data customer
 */
const CUSTOMER_FIELD_PLACEHOLDERS = [
  { key: "{customer_name}", label: "Nama Customer", description: "Nama dari database customer" },
  { key: "{customer_email}", label: "Email Customer", description: "Email dari database customer" },
  { key: "{customer_phone}", label: "Nomor Telepon", description: "Nomor telepon customer" },
  { key: "{customer_tags}", label: "Tags", description: "Tags customer (dipisah koma)" },
  { key: "{customer_lead_score}", label: "Lead Score", description: "Skor lead customer" },
  { key: "{customer_instagram}", label: "Instagram", description: "Username Instagram customer" },
] as const

interface VariableInfo {
  key: string
  label: string
  source: "header" | "body" | "button" | "header_media" | "copy_code"
  placeholder: string
  inputType?: "text" | "url"
  icon?: React.ReactNode
}

/**
 * Extract variables from template
 * Variables are in format {{1}}, {{2}}, etc.
 */
function extractVariables(template: Template): VariableInfo[] {
  const variables: VariableInfo[] = []
  const variableRegex = /\{\{(\d+)\}\}/g

  // Extract media header (IMAGE, VIDEO, DOCUMENT) - shown first
  if (template.headerType && ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType)) {
    const headerType = template.headerType.toLowerCase()
    const key = `header_${headerType}`
    const icons: Record<string, React.ReactNode> = {
      image: <IconPhoto className="h-4 w-4" />,
      video: <IconVideo className="h-4 w-4" />,
      document: <IconFile className="h-4 w-4" />,
    }
    const labels: Record<string, string> = {
      image: "Header Image URL",
      video: "Header Video URL",
      document: "Header Document URL",
    }
    variables.push({
      key,
      label: labels[headerType] || `Header ${template.headerType}`,
      source: "header_media",
      placeholder: `https://example.com/${headerType}.${headerType === "image" ? "jpg" : headerType === "video" ? "mp4" : "pdf"}`,
      inputType: "url",
      icon: icons[headerType],
    })
  }

  // Extract from header (if text type)
  if (template.headerType === "TEXT" && template.headerContent) {
    const matches = template.headerContent.matchAll(variableRegex)
    for (const match of matches) {
      const key = match[1]
      if (!variables.find((v) => v.key === key)) {
        variables.push({
          key,
          label: `Header Variable ${key}`,
          source: "header",
          placeholder: `Value for header {{${key}}}`,
        })
      }
    }
  }

  // Extract from body content
  if (template.content) {
    const matches = template.content.matchAll(variableRegex)
    for (const match of matches) {
      const key = match[1]
      if (!variables.find((v) => v.key === key)) {
        variables.push({
          key,
          label: `Body Variable ${key}`,
          source: "body",
          placeholder: `Value for body {{${key}}}`,
        })
      }
    }
  }

  // Extract from button URLs (dynamic URL suffix) and Copy Code buttons
  if (template.components) {
    let urlButtonIndex = 0
    for (const component of template.components) {
      if (component.type === "BUTTONS" && component.buttons) {
        for (let btnIndex = 0; btnIndex < component.buttons.length; btnIndex++) {
          const button = component.buttons[btnIndex]
          
          // Dynamic URL buttons have variables - check both example array and url with {{1}}
          const hasDynamicUrl = button.type === "URL" && (
            (button.example && button.example.length > 0) ||
            (button.url && button.url.includes("{{1}}"))
          )
          if (hasDynamicUrl) {
            // Use button_X format to match backend expectation
            const key = `button_${urlButtonIndex}`
            if (!variables.find((v) => v.key === key)) {
              variables.push({
                key,
                label: `Button URL Suffix`,
                source: "button",
                placeholder: `URL suffix for "${button.text}" button`,
              })
            }
            urlButtonIndex++
          }
          
          // Copy Code / OTP buttons
          if (button.type === "COPY_CODE" || button.type === "OTP") {
            const key = `button_${btnIndex}_copy_code`
            if (!variables.find((v) => v.key === key)) {
              variables.push({
                key,
                label: "Copy Code",
                source: "copy_code",
                placeholder: "Enter code (e.g., 123456)",
                icon: <IconCopy className="h-4 w-4" />,
              })
            }
          }
        }
      }
    }
  }
  
  // Also check template.buttons directly (fallback for non-components structure)
  if (template.buttons) {
    let urlButtonIndex = 0
    for (let btnIndex = 0; btnIndex < template.buttons.length; btnIndex++) {
      const button = template.buttons[btnIndex]
      
      // Dynamic URL buttons
      const hasDynamicUrl = button.type === "URL" && (
        (button.example && button.example.length > 0) ||
        (button.url && button.url.includes("{{1}}"))
      )
      if (hasDynamicUrl) {
        const key = `button_${urlButtonIndex}`
        if (!variables.find((v) => v.key === key)) {
          variables.push({
            key,
            label: `Button URL Suffix`,
            source: "button",
            placeholder: `URL suffix for "${button.text}" button`,
          })
        }
        urlButtonIndex++
      }
      
      // Copy Code / OTP buttons
      if (button.type === "COPY_CODE" || button.type === "OTP") {
        const key = `button_${btnIndex}_copy_code`
        if (!variables.find((v) => v.key === key)) {
          variables.push({
            key,
            label: "Copy Code",
            source: "copy_code",
            placeholder: "Enter code (e.g., 123456)",
            icon: <IconCopy className="h-4 w-4" />,
          })
        }
      }
    }
  }

  // Sort: header_media first, then body variables by number, then buttons
  return variables.sort((a, b) => {
    // header_media always first
    if (a.source === "header_media" && b.source !== "header_media") return -1
    if (b.source === "header_media" && a.source !== "header_media") return 1
    
    // then header text variables
    if (a.source === "header" && b.source !== "header" && b.source !== "header_media") return -1
    if (b.source === "header" && a.source !== "header" && a.source !== "header_media") return 1
    
    // then body variables sorted by number
    if (a.source === "body" && b.source === "body") {
      return parseInt(a.key, 10) - parseInt(b.key, 10)
    }
    
    // body before buttons
    if (a.source === "body" && (b.source === "button" || b.source === "copy_code")) return -1
    if (b.source === "body" && (a.source === "button" || a.source === "copy_code")) return 1
    
    // buttons and copy_code last
    return 0
  })
}

export function VariableInput({ template, values, onChange, recipientMode = "customers", csvVariableColumns = [] }: VariableInputProps) {
  const t = useTranslations("broadcast.variableInput")

  const variables = useMemo(() => extractVariables(template), [template])

  const handleChange = (key: string, value: string) => {
    onChange({
      ...values,
      [key]: value,
    })
  }

  // Insert customer field placeholder at cursor position or append to value
  const insertPlaceholder = (variableKey: string, placeholder: string) => {
    const currentValue = values[variableKey] || ""
    const inputElement = document.getElementById(`var-${variableKey}`) as HTMLInputElement
    
    if (inputElement) {
      const start = inputElement.selectionStart || currentValue.length
      const end = inputElement.selectionEnd || currentValue.length
      const newValue = currentValue.slice(0, start) + placeholder + currentValue.slice(end)
      handleChange(variableKey, newValue)
      
      // Restore cursor position after the inserted placeholder
      setTimeout(() => {
        inputElement.focus()
        inputElement.setSelectionRange(start + placeholder.length, start + placeholder.length)
      }, 0)
    } else {
      handleChange(variableKey, currentValue + placeholder)
    }
  }

  // Check if all required variables are filled (skip CSV-provided variables)
  const missingVariables = useMemo(() => {
    return variables.filter((v) => {
      // Skip variables that come from CSV
      if (csvVariableColumns.includes(v.key)) return false
      return !values[v.key]?.trim()
    })
  }, [variables, values, csvVariableColumns])

  // Check if a variable contains customer placeholder
  const hasCustomerPlaceholder = (value: string) => {
    return CUSTOMER_FIELD_PLACEHOLDERS.some(p => value.includes(p.key))
  }

  if (variables.length === 0) {
    return null
  }

  // Only show customer field picker for body variables when using customer source
  const showCustomerFieldPicker = recipientMode === "customers"

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <IconVariable className="h-5 w-5" />
          <CardTitle className="text-base">{t("title")}</CardTitle>
        </div>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Info about customer placeholders */}
        {showCustomerFieldPicker && (
          <div className="flex items-start gap-2 text-blue-600 text-sm bg-blue-50 dark:bg-blue-950/20 p-3 rounded-md">
            <IconUser className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {t("customerPlaceholderHint") || "Gunakan tombol 'Sisipkan Field' untuk menambahkan data customer seperti nama, email, dll. Data akan otomatis diisi dari database."}
            </span>
          </div>
        )}

        {variables.map((variable) => {
          const isBodyVariable = variable.source === "body" || variable.source === "header"
          const canUseCustomerField = showCustomerFieldPicker && isBodyVariable
          const currentValue = values[variable.key] || ""
          const hasPlaceholder = hasCustomerPlaceholder(currentValue)
          // Check if this variable is provided from CSV
          const isFromCsv = csvVariableColumns.includes(variable.key)

          return (
            <div key={variable.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {variable.icon && <span className="text-muted-foreground">{variable.icon}</span>}
                  <Label htmlFor={`var-${variable.key}`} className="text-sm">
                    {variable.source === "header_media" || variable.source === "copy_code"
                      ? variable.label
                      : `{{${variable.key}}}`}
                  </Label>
                  <Badge variant="outline" className="text-xs">
                    {variable.source === "header_media" ? "header" : variable.source === "copy_code" ? "button" : variable.source}
                  </Badge>
                  {isFromCsv && (
                    <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">
                      <IconFileTypeCsv className="h-3 w-3 mr-1" />
                      Dari CSV
                    </Badge>
                  )}
                  {hasPlaceholder && !isFromCsv && (
                    <Badge variant="secondary" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                      <IconUser className="h-3 w-3 mr-1" />
                      Personalisasi
                    </Badge>
                  )}
                </div>
                
                {/* Customer Field Picker Dropdown - hide if from CSV */}
                {canUseCustomerField && !isFromCsv && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
                        <IconUser className="h-3 w-3" />
                        Sisipkan Field
                        <IconChevronDown className="h-3 w-3" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Data Customer</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      {CUSTOMER_FIELD_PLACEHOLDERS.map((field) => (
                        <DropdownMenuItem
                          key={field.key}
                          onClick={() => insertPlaceholder(variable.key, field.key)}
                          className="flex flex-col items-start py-2"
                        >
                          <span className="font-medium">{field.label}</span>
                          <span className="text-xs text-muted-foreground">{field.description}</span>
                          <code className="text-xs mt-1 px-1 py-0.5 bg-muted rounded">{field.key}</code>
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
              
              {isFromCsv ? (
                // Show disabled input with CSV indicator
                <div className="relative">
                  <Input
                    id={`var-${variable.key}`}
                    type="text"
                    value={`Nilai dari kolom CSV "${variable.key}"`}
                    disabled
                    className="bg-green-50 dark:bg-green-950/20 border-green-300 text-green-700 dark:text-green-300"
                  />
                </div>
              ) : (
                <Input
                  id={`var-${variable.key}`}
                  type={variable.inputType === "url" ? "url" : "text"}
                  value={currentValue}
                  onChange={(e) => handleChange(variable.key, e.target.value)}
                  placeholder={canUseCustomerField 
                    ? `Contoh: Halo {customer_name}, ...` 
                    : variable.placeholder}
                  className={!currentValue.trim() ? "border-amber-300" : hasPlaceholder ? "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20" : ""}
                />
              )}
              
              {variable.source === "header_media" && !isFromCsv && (
                <p className="text-xs text-muted-foreground">
                  Enter a publicly accessible URL for the {variable.key.replace("header_", "")}
                </p>
              )}
              {variable.source === "copy_code" && !isFromCsv && (
                <p className="text-xs text-muted-foreground">
                  This code will be copied when user taps the button
                </p>
              )}
              {isFromCsv && (
                <p className="text-xs text-green-600 dark:text-green-400">
                  Nilai akan diambil dari kolom &quot;{variable.key}&quot; di file CSV untuk setiap penerima
                </p>
              )}
              {canUseCustomerField && currentValue && hasPlaceholder && !isFromCsv && (
                <p className="text-xs text-blue-600 dark:text-blue-400">
                  Placeholder akan diganti dengan data customer saat broadcast
                </p>
              )}
            </div>
          )
        })}

        {/* Validation warning */}
        {missingVariables.length > 0 && (
          <div className="flex items-start gap-2 text-amber-600 text-sm bg-amber-50 dark:bg-amber-950/20 p-3 rounded-md">
            <IconAlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>
              {t("required")}: {missingVariables.map((v) => `{{${v.key}}}`).join(", ")}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Check if all variables in a template are filled
 * @param csvVariableColumns - Variable columns from CSV that don't need manual input
 */
export function validateVariables(
  template: Template, 
  values: Record<string, string>, 
  csvVariableColumns: string[] = []
): boolean {
  const variables = extractVariables(template)
  return variables.every((v) => {
    // Skip validation for CSV-provided variables
    if (csvVariableColumns.includes(v.key)) return true
    return values[v.key]?.trim()
  })
}

export default VariableInput
