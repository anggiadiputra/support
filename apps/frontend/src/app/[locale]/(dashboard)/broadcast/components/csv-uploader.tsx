"use client"

import { useState, useCallback, useRef } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Checkbox } from "@/components/ui/checkbox"
import {
  IconUpload,
  IconFileTypeCsv,
  IconDownload,
  IconX,
  IconCheck,
  IconAlertTriangle,
} from "@tabler/icons-react"
import { cn } from "@/lib/utils"

/** Satu baris data CSV dengan phoneNumber dan variable columns */
export interface CsvRow {
  phoneNumber: string
  [variableName: string]: string
}

interface CsvUploaderProps {
  phoneNumbers: string[]
  onPhoneNumbersChange: (phones: string[]) => void
  /** Callback untuk mengirim full CSV data (phone + variables) */
  onCsvDataChange?: (data: CsvRow[], variableColumns: string[]) => void
}

interface ParseResult {
  valid: CsvRow[]
  invalid: string[]
  variableColumns: string[]
}

// BSUID format (docs/bsuid.md): <ISO country code>.<alphanumeric up to 128 chars>
// Supports regular BSUID (US.13491...) and parent BSUID (US.ENT.11815...).
const BSUID_REGEX = /^[A-Z]{2}\.(ENT\.)?[a-zA-Z0-9]{1,128}$/

const isValidBsuidFormat = (value: string): boolean => {
  return BSUID_REGEX.test(value)
}

// E.164 phone number validation (basic)
const isValidPhoneNumber = (phone: string): boolean => {
  // Skip BSUID strings — they are recipients but not phone numbers
  if (isValidBsuidFormat(phone)) return false
  // Remove all non-digit characters except leading +
  const cleaned = phone.replace(/[^\d+]/g, "")
  // Must have 10-15 digits (with or without +)
  return /^\+?\d{10,15}$/.test(cleaned)
}

const normalizePhoneNumber = (phone: string): string => {
  // Preserve BSUID format unchanged
  if (isValidBsuidFormat(phone)) return phone
  // Remove all non-digit characters except leading +
  let cleaned = phone.replace(/[^\d+]/g, "")
  // Add + if not present and starts with country code
  if (!cleaned.startsWith("+") && cleaned.length >= 10) {
    cleaned = "+" + cleaned
  }
  return cleaned
}

const parseCSV = (content: string): ParseResult => {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) return { valid: [], invalid: [], variableColumns: [] }

  // Parse headers - keep original case for variable columns
  const rawHeaders = lines[0].split(",").map((h) => h.trim())
  const headers = rawHeaders.map((h) => h.toLowerCase())

  // Find phoneNumber column
  const phoneIndex = headers.findIndex(
    (h) => h === "phonenumber" || h === "phone_number" || h === "phone" || h === "nomor" || h === "no_telepon"
  )

  // Find BSUID column (optional, for BSUID-only customers)
  const bsuidIndex = headers.findIndex(
    (h) => h === "bsuid" || h === "whatsapp_bsuid" || h === "whatsappbsuid"
  )

  // Identify variable columns (all columns except phone/bsuid)
  // Variable columns should be named as "1", "2", "3" etc. to match template variables
  const variableColumns: string[] = []
  rawHeaders.forEach((header, idx) => {
    if (idx !== phoneIndex && idx !== bsuidIndex && header) {
      variableColumns.push(header)
    }
  })

  const valid: CsvRow[] = []
  const invalid: string[] = []
  const seen = new Set<string>()

  // If no header found, assume first column is phone number
  const phoneCol = phoneIndex >= 0 ? phoneIndex : 0
  const startRow = phoneIndex >= 0 || bsuidIndex >= 0 ? 1 : 0

  for (let i = startRow; i < lines.length; i++) {
    // Parse CSV line properly (handle quoted values)
    const cols = parseCSVLine(lines[i])
    const rawPhone = cols[phoneCol]?.trim() || ""
    const rawBsuid = bsuidIndex >= 0 ? (cols[bsuidIndex]?.trim() || "") : ""

    // Priority: explicit BSUID column wins over phone (BSUID is unambiguous)
    const rawInput = rawBsuid || rawPhone
    if (!rawInput) continue

    const normalized = normalizePhoneNumber(rawInput)
    if (seen.has(normalized)) continue
    seen.add(normalized)

    const isBsuid = isValidBsuidFormat(normalized)

    if (isBsuid || isValidPhoneNumber(normalized)) {
      // Build row with phoneNumber slot (holds BSUID for BSUID rows — matches
      // backend contract) and all variable values.
      const row: CsvRow = { phoneNumber: normalized }
      if (isBsuid) {
        // Signal to backend that this row should route via `recipient` (BSUID)
        // instead of `to` (phone).
        ;(row as any).bsuid = normalized
      }
      rawHeaders.forEach((header, idx) => {
        if (idx !== phoneIndex && idx !== bsuidIndex && header) {
          row[header] = cols[idx]?.trim() || ""
        }
      })
      valid.push(row)
    } else {
      invalid.push(rawInput)
    }
  }

  return { valid, invalid, variableColumns }
}

/** Parse a single CSV line, handling quoted values with commas */
function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ""
  let inQuotes = false
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ""
    } else {
      current += char
    }
  }
  result.push(current)
  
  return result
}

export function CsvUploader({ phoneNumbers, onPhoneNumbersChange, onCsvDataChange }: CsvUploaderProps) {
  const t = useTranslations("broadcast.csvUploader")
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [invalidNumbers, setInvalidNumbers] = useState<string[]>([])
  const [fileName, setFileName] = useState<string | null>(null)
  // Store all extracted rows (with variable data)
  const [allExtractedRows, setAllExtractedRows] = useState<CsvRow[]>([])
  // Track which phone numbers are selected
  const [selectedPhones, setSelectedPhones] = useState<Set<string>>(new Set())
  // Track variable columns from CSV
  const [variableColumns, setVariableColumns] = useState<string[]>([])

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith(".csv")) {
        return
      }

      const reader = new FileReader()
      reader.onload = (e) => {
        const content = e.target?.result as string
        const result = parseCSV(content)
        // Store all valid rows (with variable data)
        setAllExtractedRows(result.valid)
        // Store variable columns
        setVariableColumns(result.variableColumns)
        // Select all by default (by phone number)
        const phones = result.valid.map(row => row.phoneNumber)
        setSelectedPhones(new Set(phones))
        // Pass selected phone numbers to parent
        onPhoneNumbersChange(phones)
        // Pass full CSV data to parent
        onCsvDataChange?.(result.valid, result.variableColumns)
        setInvalidNumbers(result.invalid)
        setFileName(file.name)
      }
      reader.readAsText(file)
    },
    [onPhoneNumbersChange, onCsvDataChange]
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      const file = e.dataTransfer.files[0]
      if (file) handleFile(file)
    },
    [handleFile]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  const handleClear = () => {
    onPhoneNumbersChange([])
    onCsvDataChange?.([], [])
    setInvalidNumbers([])
    setFileName(null)
    setAllExtractedRows([])
    setSelectedPhones(new Set())
    setVariableColumns([])
    if (fileInputRef.current) {
      fileInputRef.current.value = ""
    }
  }

  const toggleNumber = (phone: string) => {
    const newSelected = new Set(selectedPhones)
    if (newSelected.has(phone)) {
      newSelected.delete(phone)
    } else {
      newSelected.add(phone)
    }
    setSelectedPhones(newSelected)
    // Update phone numbers
    onPhoneNumbersChange(Array.from(newSelected))
    // Update CSV data - filter rows by selected phones
    const selectedRows = allExtractedRows.filter(row => newSelected.has(row.phoneNumber))
    onCsvDataChange?.(selectedRows, variableColumns)
  }

  const selectAll = () => {
    const allPhones = allExtractedRows.map(row => row.phoneNumber)
    const newSelected = new Set(allPhones)
    setSelectedPhones(newSelected)
    onPhoneNumbersChange(allPhones)
    onCsvDataChange?.(allExtractedRows, variableColumns)
  }

  const deselectAll = () => {
    setSelectedPhones(new Set())
    onPhoneNumbersChange([])
    onCsvDataChange?.([], variableColumns)
  }

  const downloadTemplate = () => {
    // Template with example variable columns (1, 2, 3, 4).
    // Row 1: phone-only customer. Row 2: BSUID-only customer (username-only
    // user who never exposed a phone number). Leave phoneNumber empty when
    // using bsuid column. See docs/bsuid.md.
    const csvContent = `phoneNumber,bsuid,1,2,3,4
+6281234567890,,Ahmad,Produk A,100000,Jakarta
,US.13491208655302741918,Pablo,Produk B,50000,Bandung`
    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = "broadcast_template.csv"
    a.click()
    URL.revokeObjectURL(url)
  }

  const hasData = allExtractedRows.length > 0 || invalidNumbers.length > 0

  return (
    <div className="space-y-4">
      {/* Drop zone */}
      <div
        className={cn(
          "relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors",
          isDragging
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          hasData && "border-solid"
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={handleInputChange}
        />

        {hasData ? (
          <div className="space-y-2">
            <IconFileTypeCsv className="text-primary mx-auto h-10 w-10" />
            <p className="font-medium">{fileName}</p>
            <div className="flex items-center justify-center gap-4">
              <Badge variant="default" className="gap-1">
                <IconCheck className="h-3 w-3" />
                {t("validCount", { count: allExtractedRows.length })}
              </Badge>
              {invalidNumbers.length > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <IconAlertTriangle className="h-3 w-3" />
                  {t("invalidCount", { count: invalidNumbers.length })}
                </Badge>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <IconUpload className="text-muted-foreground mx-auto h-10 w-10" />
            <p className="font-medium">{t("dropzone.title")}</p>
            <p className="text-muted-foreground text-sm">{t("dropzone.subtitle")}</p>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between">
        <Button variant="outline" size="sm" onClick={downloadTemplate}>
          <IconDownload className="mr-2 h-4 w-4" />
          {t("downloadTemplate")}
        </Button>
        {hasData && (
          <Button variant="ghost" size="sm" onClick={handleClear}>
            <IconX className="mr-2 h-4 w-4" />
            {t("clear")}
          </Button>
        )}
      </div>

      {/* Extracted phone numbers list with selection */}
      {allExtractedRows.length > 0 && (
        <div className="rounded-md border p-3">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {t("extractedNumbers", { count: allExtractedRows.length })}
              </p>
              {variableColumns.length > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  Kolom variable: {variableColumns.join(", ")}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={selectAll}
                disabled={selectedPhones.size === allExtractedRows.length}
              >
                {t("selectAll")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={deselectAll}
                disabled={selectedPhones.size === 0}
              >
                {t("deselectAll")}
              </Button>
            </div>
          </div>
          <ScrollArea className="h-[200px]">
            <div className="space-y-2">
              {allExtractedRows.map((row, i) => (
                <label
                  key={i}
                  className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted/50"
                >
                  <Checkbox
                    checked={selectedPhones.has(row.phoneNumber)}
                    onCheckedChange={() => toggleNumber(row.phoneNumber)}
                  />
                  <span className="font-mono text-sm">{row.phoneNumber}</span>
                  {/* Show variable values preview */}
                  {variableColumns.length > 0 && (
                    <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                      ({variableColumns.map(col => row[col]).filter(Boolean).join(", ")})
                    </span>
                  )}
                </label>
              ))}
            </div>
          </ScrollArea>
          <div className="text-muted-foreground mt-2 border-t pt-2 text-sm">
            {t("selectedForBroadcast", { selected: selectedPhones.size, total: allExtractedRows.length })}
          </div>
        </div>
      )}

      {/* Invalid numbers list */}
      {invalidNumbers.length > 0 && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
          <p className="text-destructive mb-2 text-sm font-medium">
            {t("invalidNumbers")}
          </p>
          <ScrollArea className="h-[100px]">
            <div className="space-y-1">
              {invalidNumbers.map((num, i) => (
                <div key={i} className="text-muted-foreground text-xs">
                  {num}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}
    </div>
  )
}

export default CsvUploader
