"use client"

import { useTranslations } from "next-intl"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  IconPhoto,
  IconVideo,
  IconFile,
  IconLetterCase,
  IconLink,
  IconPhone,
  IconMessage,
  IconVariable,
} from "@tabler/icons-react"
import { Template, countTemplateVariables, hasDynamicUrl } from "../data/schema"

interface TemplateDetailDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  template: Template | null
}

const headerTypeIcons: Record<string, React.ElementType> = {
  TEXT: IconLetterCase,
  IMAGE: IconPhoto,
  VIDEO: IconVideo,
  DOCUMENT: IconFile,
}

/**
 * Highlight variables in text by wrapping them in styled spans
 */
function highlightVariables(text: string): React.ReactNode {
  const parts = text.split(/(\{\{\d+\}\})/g)
  return parts.map((part, index) => {
    if (/\{\{\d+\}\}/.test(part)) {
      return (
        <span
          key={index}
          className="bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200 px-1 rounded font-mono text-sm"
        >
          {part}
        </span>
      )
    }
    return part
  })
}

export function TemplateDetailDialog({
  open,
  onOpenChange,
  template,
}: TemplateDetailDialogProps) {
  const t = useTranslations("templates.templateDetail")
  const tList = useTranslations("templates.templateList")

  if (!template) return null

  const variableCount = countTemplateVariables(template)
  const isDynamicUrl = hasDynamicUrl(template)
  const HeaderIcon = template.headerType ? headerTypeIcons[template.headerType] : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {template.templateName}
            <div className="flex items-center gap-1">
              {variableCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <IconVariable className="h-3 w-3" />
                  {tList("variableCount", { count: variableCount })}
                </Badge>
              )}
              {isDynamicUrl && (
                <Badge
                  variant="outline"
                  className="gap-1 text-xs text-purple-600 border-purple-300"
                >
                  <IconLink className="h-3 w-3" />
                  {tList("dynamicUrl")}
                </Badge>
              )}
            </div>
          </DialogTitle>
          <DialogDescription>
            {template.category} • {template.language} • {template.status}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Template Structure */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{t("structure")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* Header */}
              {template.headerType && (
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    {HeaderIcon && <HeaderIcon className="h-4 w-4" />}
                    {t("header")}
                    {["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType) && (
                      <Badge variant="secondary" className="text-xs">
                        {template.headerType}
                      </Badge>
                    )}
                  </div>
                  {template.headerType === "TEXT" && template.headerContent && (
                    <div className="bg-muted rounded-md p-2 text-sm">
                      {highlightVariables(template.headerContent)}
                    </div>
                  )}
                  {["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType) && (
                    <div className="bg-muted rounded-md p-2 text-sm text-muted-foreground italic">
                      Media variable (upload required)
                    </div>
                  )}
                </div>
              )}

              {/* Body */}
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconMessage className="h-4 w-4" />
                  {t("body")}
                </div>
                <div className="bg-muted rounded-md p-2 text-sm whitespace-pre-wrap">
                  {highlightVariables(template.content)}
                </div>
              </div>

              {/* Footer */}
              {template.footerText && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    {t("footer")}
                  </div>
                  <div className="bg-muted rounded-md p-2 text-sm text-muted-foreground">
                    {template.footerText}
                  </div>
                </div>
              )}

              {/* Buttons */}
              {template.components?.some((c) => c.type === "BUTTONS") && (
                <div className="space-y-1">
                  <div className="text-sm font-medium text-muted-foreground">
                    {t("buttons")}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {template.components
                      .filter((c) => c.type === "BUTTONS")
                      .flatMap((c) => c.buttons || [])
                      .map((button, index) => (
                        <Badge
                          key={index}
                          variant="outline"
                          className="gap-1"
                        >
                          {button.type === "URL" && <IconLink className="h-3 w-3" />}
                          {button.type === "PHONE_NUMBER" && <IconPhone className="h-3 w-3" />}
                          {button.type === "QUICK_REPLY" && <IconMessage className="h-3 w-3" />}
                          {button.text}
                          {button.type === "URL" && button.example && button.example.length > 0 && (
                            <span className="text-purple-600 text-xs">(dynamic)</span>
                          )}
                        </Badge>
                      ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  )
}
