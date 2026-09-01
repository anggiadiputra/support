"use client"

import { useState, useEffect, useRef } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  IconMail,
  IconDeviceFloppy,
  IconRefresh,
  IconAlertCircle,
  IconCircleCheck,
  IconEye,
  IconArrowLeft,
  IconSeeding,
  IconCode,
  IconVariable,
} from "@tabler/icons-react"
import {
  useAdminEmailTemplates,
  type EmailTemplateData,
  type EmailTemplateListItem,
} from "../hooks/use-admin-email-templates"

export default function EmailTemplatesPage() {
  const {
    templates,
    isLoading,
    error,
    getTemplate,
    updateTemplate,
    resetTemplate,
    previewTemplate,
    seedTemplates,
  } = useAdminEmailTemplates()

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null)
  const [templateData, setTemplateData] = useState<EmailTemplateData | null>(null)
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [isSeeding, setIsSeeding] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [previewHtml, setPreviewHtml] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)

  // Form state
  const [formSubject, setFormSubject] = useState("")
  const [formHtmlBody, setFormHtmlBody] = useState("")
  const [formTextBody, setFormTextBody] = useState("")
  const [formIsActive, setFormIsActive] = useState(false)

  const htmlTextareaRef = useRef<HTMLTextAreaElement>(null)
  const textTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Load template detail when selected
  useEffect(() => {
    if (!selectedSlug) {
      setTemplateData(null)
      return
    }

    const loadTemplate = async () => {
      setIsLoadingTemplate(true)
      setSaveResult(null)
      const data = await getTemplate(selectedSlug)
      if (data) {
        setTemplateData(data)
        setFormSubject(data.subject)
        setFormHtmlBody(data.htmlBody)
        setFormTextBody(data.textBody)
        setFormIsActive(data.isActive)
      }
      setIsLoadingTemplate(false)
    }

    loadTemplate()
  }, [selectedSlug, getTemplate])

  const handleSave = async () => {
    if (!selectedSlug) return
    setIsSaving(true)
    setSaveResult(null)

    const result = await updateTemplate(selectedSlug, {
      subject: formSubject,
      htmlBody: formHtmlBody,
      textBody: formTextBody,
      isActive: formIsActive,
    })

    setSaveResult(result)
    setIsSaving(false)

    // Refresh template data
    if (result.success) {
      const data = await getTemplate(selectedSlug)
      if (data) setTemplateData(data)
    }
  }

  const handleReset = async () => {
    if (!selectedSlug) return
    setIsResetting(true)
    setSaveResult(null)

    const result = await resetTemplate(selectedSlug)
    setSaveResult(result)
    setIsResetting(false)

    // Refresh template data
    const data = await getTemplate(selectedSlug)
    if (data) {
      setTemplateData(data)
      setFormSubject(data.subject)
      setFormHtmlBody(data.htmlBody)
      setFormTextBody(data.textBody)
      setFormIsActive(data.isActive)
    }
  }

  const handlePreview = async () => {
    if (!selectedSlug) return

    const result = await previewTemplate(selectedSlug, {
      subject: formSubject,
      htmlBody: formHtmlBody,
      textBody: formTextBody,
    })

    if (result) {
      setPreviewHtml(result.html)
      setShowPreview(true)
    }
  }

  const handleSeed = async () => {
    setIsSeeding(true)
    const result = await seedTemplates()
    setSaveResult(result)
    setIsSeeding(false)
  }

  const insertVariable = (variable: string, target: "subject" | "html" | "text") => {
    const varStr = `{{${variable}}}`
    if (target === "subject") {
      setFormSubject((prev) => prev + varStr)
    } else if (target === "html") {
      const textarea = htmlTextareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = formHtmlBody.substring(0, start) + varStr + formHtmlBody.substring(end)
        setFormHtmlBody(newValue)
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + varStr.length
          textarea.focus()
        }, 0)
      } else {
        setFormHtmlBody((prev) => prev + varStr)
      }
    } else {
      const textarea = textTextareaRef.current
      if (textarea) {
        const start = textarea.selectionStart
        const end = textarea.selectionEnd
        const newValue = formTextBody.substring(0, start) + varStr + formTextBody.substring(end)
        setFormTextBody(newValue)
        setTimeout(() => {
          textarea.selectionStart = textarea.selectionEnd = start + varStr.length
          textarea.focus()
        }, 0)
      } else {
        setFormTextBody((prev) => prev + varStr)
      }
    }
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground">Manage email templates sent by the system</p>
        </div>
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </div>
    )
  }

  // Template editor view
  if (selectedSlug && templateData) {
    return (
      <div className="flex flex-col gap-6 p-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => setSelectedSlug(null)}>
            <IconArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold tracking-tight">{templateData.name}</h1>
            <p className="text-sm text-muted-foreground">{templateData.description}</p>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="active-toggle" className="text-sm">
              {formIsActive ? "Active (DB override)" : "Inactive (code default)"}
            </Label>
            <Switch
              id="active-toggle"
              checked={formIsActive}
              onCheckedChange={setFormIsActive}
            />
          </div>
        </div>

        {/* Result alert */}
        {saveResult && (
          <Alert variant={saveResult.success ? "default" : "destructive"}>
            {saveResult.success ? (
              <IconCircleCheck className="h-4 w-4" />
            ) : (
              <IconAlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{saveResult.message}</AlertDescription>
          </Alert>
        )}

        {/* Variables helper */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <IconVariable className="h-4 w-4" />
              Available Variables
            </CardTitle>
            <CardDescription className="text-xs">
              Click a variable to insert it at cursor position in the HTML/Text body
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {templateData.variables.map((v) => (
                <Badge
                  key={v}
                  variant="secondary"
                  className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors"
                  onClick={() => insertVariable(v, "html")}
                >
                  {`{{${v}}}`}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Subject */}
        <div className="grid gap-2">
          <Label htmlFor="subject">Subject</Label>
          <Input
            id="subject"
            value={formSubject}
            onChange={(e) => {
              setFormSubject(e.target.value)
              setSaveResult(null)
            }}
            placeholder="Email subject..."
          />
          <p className="text-xs text-muted-foreground">
            Supports {"{{variables}}"} for dynamic content
          </p>
        </div>

        {/* HTML Body */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="htmlBody" className="flex items-center gap-1">
              <IconCode className="h-4 w-4" />
              HTML Body
            </Label>
            <div className="flex gap-1">
              {templateData.variables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                  onClick={() => insertVariable(v, "html")}
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
          <Textarea
            ref={htmlTextareaRef}
            id="htmlBody"
            value={formHtmlBody}
            onChange={(e) => {
              setFormHtmlBody(e.target.value)
              setSaveResult(null)
            }}
            className="min-h-[400px] font-mono text-sm"
            placeholder="<!DOCTYPE html>..."
          />
        </div>

        {/* Text Body */}
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="textBody">Plain Text Body</Label>
            <div className="flex gap-1">
              {templateData.variables.map((v) => (
                <Badge
                  key={v}
                  variant="outline"
                  className="cursor-pointer text-xs hover:bg-primary hover:text-primary-foreground"
                  onClick={() => insertVariable(v, "text")}
                >
                  {v}
                </Badge>
              ))}
            </div>
          </div>
          <Textarea
            ref={textTextareaRef}
            id="textBody"
            value={formTextBody}
            onChange={(e) => {
              setFormTextBody(e.target.value)
              setSaveResult(null)
            }}
            className="min-h-[200px] font-mono text-sm"
            placeholder="Plain text email content..."
          />
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="outline" onClick={handlePreview}>
            <IconEye className="mr-2 h-4 w-4" />
            Preview
          </Button>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={isResetting || isSaving}
            >
              <IconRefresh className="mr-2 h-4 w-4" />
              {isResetting ? "Resetting..." : "Reset to Default"}
            </Button>
            <Button onClick={handleSave} disabled={isSaving || isResetting}>
              <IconDeviceFloppy className="mr-2 h-4 w-4" />
              {isSaving ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>

        {/* Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl max-h-[80vh]">
            <DialogHeader>
              <DialogTitle>Email Preview</DialogTitle>
            </DialogHeader>
            <div className="overflow-auto max-h-[65vh] border rounded-lg">
              {previewHtml && (
                <iframe
                  srcDoc={previewHtml}
                  className="w-full min-h-[500px] border-0"
                  title="Email Preview"
                  sandbox=""
                />
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // Template list view
  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Email Templates</h1>
          <p className="text-muted-foreground">
            Manage email templates sent by the system. Activate a template to use your custom version instead of the code default.
          </p>
        </div>
        <Button variant="outline" onClick={handleSeed} disabled={isSeeding}>
          <IconSeeding className="mr-2 h-4 w-4" />
          {isSeeding ? "Seeding..." : "Seed Defaults"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <IconAlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {saveResult && (
        <Alert variant={saveResult.success ? "default" : "destructive"}>
          {saveResult.success ? (
            <IconCircleCheck className="h-4 w-4" />
          ) : (
            <IconAlertCircle className="h-4 w-4" />
          )}
          <AlertDescription>{saveResult.message}</AlertDescription>
        </Alert>
      )}

      {templates.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 gap-4">
            <IconMail className="h-12 w-12 text-muted-foreground" />
            <div className="text-center">
              <h3 className="text-lg font-semibold">No templates found</h3>
              <p className="text-sm text-muted-foreground">
                Click &quot;Seed Defaults&quot; to populate templates from code defaults
              </p>
            </div>
            <Button onClick={handleSeed} disabled={isSeeding}>
              <IconSeeding className="mr-2 h-4 w-4" />
              {isSeeding ? "Seeding..." : "Seed Default Templates"}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {templates.map((template) => (
            <TemplateCard
              key={template.slug}
              template={template}
              onClick={() => setSelectedSlug(template.slug)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TemplateCard({
  template,
  onClick,
}: {
  template: EmailTemplateListItem
  onClick: () => void
}) {
  return (
    <Card
      className="cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={onClick}
    >
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <IconMail className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-medium">{template.name}</h3>
              {template.isActive ? (
                <Badge variant="default" className="text-xs">Active</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">Default</Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{template.description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <code className="bg-muted px-2 py-1 rounded">{template.slug}</code>
        </div>
      </CardContent>
    </Card>
  )
}
