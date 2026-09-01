"use client"

import { useEffect, useState } from "react"
import { useTranslations } from "next-intl"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { IconTemplate, IconAlertCircle } from "@tabler/icons-react"
import { TemplatePreview } from "../../templates/components/template-preview"
import type { Template } from "../../templates/data/schema"

interface TemplateSelectorProps {
  onSelect: (template: Template | null) => void
  selected: Template | null
  showPreview?: boolean
  whatsappAccountId?: string | null
}

export function TemplateSelector({
  onSelect,
  selected,
  showPreview = true,
  whatsappAccountId,
}: TemplateSelectorProps) {
  const t = useTranslations("broadcast.templateSelector")
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadTemplates()
  }, [whatsappAccountId])

  const loadTemplates = async () => {
    try {
      setLoading(true)
      setError(null)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const params = new URLSearchParams()
      params.set("status", "APPROVED")
      if (whatsappAccountId) {
        params.set("whatsappAccountId", whatsappAccountId)
      }
      const response = await fetch(`${apiUrl}/api/v1/templates?${params.toString()}`, {
        credentials: "include",
      })

      if (response.ok) {
        const result = await response.json()
        // Filter out templates with empty or invalid IDs
        const validTemplates = (result.data || []).filter(
          (t: Template) => t.id && t.id.trim() !== ""
        )
        setTemplates(validTemplates)
      } else {
        setError("Failed to load templates")
      }
    } catch (err) {
      console.error("Error loading templates:", err)
      setError("Failed to load templates")
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (templateId: string) => {
    const template = templates.find((t) => t.id === templateId) || null
    onSelect(template)
  }

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-destructive text-sm">
        <IconAlertCircle className="h-4 w-4" />
        <span>{error}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">{t("label")}</label>
        <Select
          value={selected?.id || ""}
          onValueChange={handleSelect}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder={t("placeholder")}>
              {selected && (
                <div className="flex items-center gap-2">
                  <IconTemplate className="h-4 w-4" />
                  <span>{selected.templateName}</span>
                  <Badge variant="outline" className="ml-auto text-xs">
                    {selected.language}
                  </Badge>
                </div>
              )}
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="max-h-[400px]">
            {templates.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                {t("noTemplates")}
              </div>
            ) : (
              templates
                .filter((template) => template.id && template.id.trim() !== "")
                .map((template) => (
                <SelectItem key={template.id} value={template.id} className="py-3">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <IconTemplate className="h-4 w-4 shrink-0" />
                      <span className="font-medium">{template.templateName}</span>
                      <Badge variant="outline" className="ml-2 text-xs">
                        {template.language}
                      </Badge>
                      <Badge variant="secondary" className="text-xs">
                        {template.category}
                      </Badge>
                    </div>
                    {/* Show template body preview */}
                    {template.content && (
                      <p className="text-xs text-muted-foreground line-clamp-2 pl-6 max-w-[400px]">
                        {template.content}
                      </p>
                    )}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Template Preview */}
      {showPreview && selected && (
        <Card>
          <CardContent className="p-4">
            <div className="mb-2 text-sm font-medium">{t("preview")}</div>
            <TemplatePreview
              template={selected}
              showTimestamp={false}
              className="max-h-[400px] overflow-auto"
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

export default TemplateSelector
