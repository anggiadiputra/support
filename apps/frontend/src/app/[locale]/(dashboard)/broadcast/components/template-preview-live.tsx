"use client"

import { useMemo } from "react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import {
  IconPhoto,
  IconVideo,
  IconFile,
  IconExternalLink,
  IconPhone,
  IconChecks,
  IconCopy,
} from "@tabler/icons-react"
import type { Template } from "../../templates/data/schema"

interface TemplatePreviewLiveProps {
  template: Template
  variableValues: Record<string, string>
  className?: string
}

/**
 * Replace variable placeholders {{1}}, {{2}}, etc. with actual values
 * Highlights unfilled variables with a different style
 */
function renderTextWithVariables(
  text: string,
  values: Record<string, string>
): React.ReactNode {
  if (!text) return null

  const parts: React.ReactNode[] = []
  const regex = /\{\{(\d+)\}\}/g
  let lastIndex = 0
  let match

  while ((match = regex.exec(text)) !== null) {
    // Add text before the variable
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }

    const varKey = match[1]
    const value = values[varKey]

    if (value && value.trim()) {
      // Variable has value - show it normally
      parts.push(
        <span key={match.index} className="font-medium">
          {value}
        </span>
      )
    } else {
      // Variable not filled - show placeholder with highlight
      parts.push(
        <span
          key={match.index}
          className="rounded bg-amber-200 px-1 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300"
        >
          {`{{${varKey}}}`}
        </span>
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }

  return parts.length > 0 ? parts : text
}

/**
 * Live Template Preview Component
 *
 * Shows WhatsApp-style preview with real-time variable substitution.
 * Unfilled variables are highlighted in amber/yellow.
 */
export function TemplatePreviewLive({
  template,
  variableValues,
  className,
}: TemplatePreviewLiveProps) {
  // Process header content
  const headerContent = useMemo(() => {
    if (template.headerType === "TEXT" && template.headerContent) {
      return {
        type: "text" as const,
        content: template.headerContent,
        mediaUrl: undefined,
      }
    }
    if (
      template.headerType &&
      ["IMAGE", "VIDEO", "DOCUMENT"].includes(template.headerType)
    ) {
      const headerType = template.headerType.toLowerCase() as "image" | "video" | "document"
      // Check for media URL in variableValues
      const mediaUrl = variableValues[`header_${headerType}`] || variableValues["header"]
      return {
        type: headerType,
        content: "",
        mediaUrl,
      }
    }
    return null
  }, [template, variableValues])

  // Extract buttons from template
  const buttons = useMemo(() => {
    const buttonComponent = template.components?.find((c) => c.type === "BUTTONS")
    if (buttonComponent?.buttons) {
      return buttonComponent.buttons.map((btn) => ({
        type: btn.type.toLowerCase() as "url" | "phone_number" | "quick_reply" | "copy_code" | "otp",
        text: btn.text,
        url: btn.url || undefined,
      }))
    }
    // Fallback to template.buttons if components not available
    if (template.buttons) {
      return template.buttons.map((btn) => ({
        type: btn.type.toLowerCase() as "url" | "phone_number" | "quick_reply" | "copy_code" | "otp",
        text: btn.text,
        url: btn.url || undefined,
      }))
    }
    return []
  }, [template])

  return (
    <div
      className={cn(
        "min-h-[300px] rounded-lg bg-[#e5ddd5] p-4 dark:bg-gray-800",
        className
      )}
    >
      <div className="mx-auto max-w-[320px]">
        {/* Message bubble */}
        <div className="relative overflow-hidden rounded-lg bg-[#dcf8c6] shadow-sm dark:bg-green-900">
          {/* Header */}
          {headerContent && (
            <div className={cn(headerContent.type !== "text" && "mb-0")}>
              {headerContent.type === "text" && (
                <div className="p-3 pb-0">
                  <p className="whitespace-pre-wrap break-words text-sm font-semibold">
                    {renderTextWithVariables(headerContent.content, variableValues)}
                  </p>
                </div>
              )}
              {headerContent.type === "image" && (
                <div className="flex h-40 items-center justify-center bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  {headerContent.mediaUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={headerContent.mediaUrl}
                      alt="Header"
                      className="h-full w-full object-cover"
                      onError={(e) => {
                        // Fallback to placeholder on error
                        e.currentTarget.style.display = "none"
                        e.currentTarget.nextElementSibling?.classList.remove("hidden")
                      }}
                    />
                  ) : null}
                  <div className={cn("flex flex-col items-center gap-2", headerContent.mediaUrl && "hidden")}>
                    <IconPhoto className="h-10 w-10 text-gray-400" />
                    <span className="text-xs text-gray-500">Image</span>
                  </div>
                </div>
              )}
              {headerContent.type === "video" && (
                <div className="flex h-40 flex-col items-center justify-center gap-2 bg-gray-200 dark:bg-gray-700">
                  <IconVideo className="h-10 w-10 text-gray-400" />
                  <span className="text-xs text-gray-500">Video</span>
                </div>
              )}
              {headerContent.type === "document" && (
                <div className="flex items-center gap-3 border-b border-gray-200 bg-gray-100 p-3 dark:border-gray-600 dark:bg-gray-700">
                  <div className="rounded bg-red-100 p-2 dark:bg-red-900/30">
                    <IconFile className="h-6 w-6 text-red-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">Document</p>
                    <p className="text-xs text-gray-500">PDF</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Body */}
          <div className="p-3">
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
              {renderTextWithVariables(template.content || "", variableValues)}
            </p>

            {/* Footer */}
            {template.footerText && (
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                {template.footerText}
              </p>
            )}

            {/* Timestamp */}
            <div className="mt-1 flex items-center justify-end gap-1">
              <span className="text-[10px] text-gray-500 dark:text-gray-400">
                {format(new Date(), "HH:mm")}
              </span>
              <IconChecks className="h-3 w-3 text-blue-500" />
            </div>
          </div>
        </div>

        {/* Buttons */}
        {buttons.length > 0 && (
          <div className="mt-1 space-y-1">
            {buttons.map((button, index) => (
              <button
                key={index}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-white px-3 py-2.5 text-sm text-blue-500 shadow-sm transition-colors hover:bg-gray-50 dark:bg-gray-700 dark:text-blue-400 dark:hover:bg-gray-600"
                onClick={(e) => e.preventDefault()}
              >
                {button.type === "url" && <IconExternalLink className="h-4 w-4" />}
                {button.type === "phone_number" && <IconPhone className="h-4 w-4" />}
                {(button.type === "copy_code" || button.type === "otp") && <IconCopy className="h-4 w-4" />}
                <span className="truncate">{button.text}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default TemplatePreviewLive
