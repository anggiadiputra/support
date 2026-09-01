"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type {
  QuickReply,
  QuickReplyCategory,
  CreateQuickReplyInput,
  UpdateQuickReplyInput,
} from "@/hooks/use-quick-replies"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

interface QuickReplyDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  quickReply?: QuickReply
  categories: QuickReplyCategory[]
  onSubmit: (data: CreateQuickReplyInput | UpdateQuickReplyInput) => void
  isLoading?: boolean
}

const VARIABLE_HINTS = [
  { variable: "{{customer_name}}", label: "Customer Name" },
  { variable: "{{customer_phone}}", label: "Customer Phone" },
  { variable: "{{agent_name}}", label: "Agent Name" },
]

const MAX_CONTENT_LENGTH = 4096
const MAX_TITLE_LENGTH = 100

export function QuickReplyDialog({
  open,
  onOpenChange,
  quickReply,
  categories,
  onSubmit,
  isLoading,
}: QuickReplyDialogProps) {
  const isEditMode = !!quickReply

  const [categoryId, setCategoryId] = useState<string>("")
  const [shortcut, setShortcut] = useState("")
  const [title, setTitle] = useState("")
  const [content, setContent] = useState("")
  const [errors, setErrors] = useState<{
    shortcut?: string
    title?: string
    content?: string
  }>({})

  // Reset form when dialog opens/closes or quickReply changes
  useEffect(() => {
    if (open) {
      setCategoryId(quickReply?.category?.id || "")
      setShortcut(quickReply?.shortcut || "")
      setTitle(quickReply?.title || "")
      setContent(quickReply?.content || "")
      setErrors({})
    }
  }, [open, quickReply])

  const validateShortcut = (value: string): string | undefined => {
    if (!value.trim()) {
      return "Shortcut is required"
    }
    if (!/^[a-z0-9-]+$/.test(value)) {
      return "Only lowercase letters, numbers, and dashes allowed"
    }
    return undefined
  }

  const validateTitle = (value: string): string | undefined => {
    if (!value.trim()) {
      return "Title is required"
    }
    if (value.length > MAX_TITLE_LENGTH) {
      return `Title must be ${MAX_TITLE_LENGTH} characters or less`
    }
    return undefined
  }

  const validateContent = (value: string): string | undefined => {
    if (!value.trim()) {
      return "Content is required"
    }
    if (value.length > MAX_CONTENT_LENGTH) {
      return `Content must be ${MAX_CONTENT_LENGTH} characters or less`
    }
    return undefined
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const shortcutError = validateShortcut(shortcut)
    const titleError = validateTitle(title)
    const contentError = validateContent(content)

    if (shortcutError || titleError || contentError) {
      setErrors({
        shortcut: shortcutError,
        title: titleError,
        content: contentError,
      })
      return
    }

    const data: CreateQuickReplyInput | UpdateQuickReplyInput = {
      shortcut: shortcut.trim(),
      title: title.trim(),
      content: content.trim(),
      categoryId: categoryId || undefined,
    }

    // Handle null categoryId for edit mode (moving to uncategorized)
    if (isEditMode && !categoryId && quickReply?.category?.id) {
      ;(data as UpdateQuickReplyInput).categoryId = null
    }

    onSubmit(data)
  }

  const handleShortcutChange = (value: string) => {
    // Normalize: lowercase, remove invalid chars except dash
    const normalized = value.toLowerCase().replace(/[^a-z0-9-]/g, "")
    setShortcut(normalized)
    if (errors.shortcut) {
      setErrors((prev) => ({ ...prev, shortcut: validateShortcut(normalized) }))
    }
  }

  const insertVariable = (variable: string) => {
    setContent((prev) => prev + variable)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Quick Reply" : "Create Quick Reply"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update your quick reply shortcut and content."
                : "Create a new quick reply that can be triggered with a shortcut."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Category */}
            <div className="grid gap-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={categoryId || "none"}
                onValueChange={(val) => setCategoryId(val === "none" ? "" : val)}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="No Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No Category</SelectItem>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Shortcut */}
            <div className="grid gap-2">
              <Label htmlFor="shortcut">Shortcut</Label>
              <div className="relative">
                <span className="text-muted-foreground absolute top-1/2 left-3 -translate-y-1/2 text-sm">
                  /
                </span>
                <Input
                  id="shortcut"
                  value={shortcut}
                  onChange={(e) => handleShortcutChange(e.target.value)}
                  placeholder="greeting"
                  className={cn(
                    "pl-7",
                    errors.shortcut && "border-destructive"
                  )}
                />
              </div>
              {errors.shortcut && (
                <p className="text-destructive text-sm">{errors.shortcut}</p>
              )}
              <p className="text-muted-foreground text-xs">
                Type /{shortcut || "shortcut"} in the message input to use this
                reply
              </p>
            </div>

            {/* Title */}
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => {
                  setTitle(e.target.value)
                  if (errors.title) {
                    setErrors((prev) => ({
                      ...prev,
                      title: validateTitle(e.target.value),
                    }))
                  }
                }}
                placeholder="Morning Greeting"
                className={cn(errors.title && "border-destructive")}
                maxLength={MAX_TITLE_LENGTH}
              />
              {errors.title && (
                <p className="text-destructive text-sm">{errors.title}</p>
              )}
            </div>

            {/* Content */}
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="content">Content</Label>
                <span
                  className={cn(
                    "text-xs",
                    content.length > MAX_CONTENT_LENGTH
                      ? "text-destructive"
                      : "text-muted-foreground"
                  )}
                >
                  {content.length}/{MAX_CONTENT_LENGTH}
                </span>
              </div>
              <Textarea
                id="content"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  if (errors.content) {
                    setErrors((prev) => ({
                      ...prev,
                      content: validateContent(e.target.value),
                    }))
                  }
                }}
                placeholder="Good morning! How can I help you today?"
                className={cn(
                  "min-h-[120px] resize-y",
                  errors.content && "border-destructive"
                )}
              />
              {errors.content && (
                <p className="text-destructive text-sm">{errors.content}</p>
              )}

              {/* Variable Hints */}
              <div className="flex flex-wrap gap-2">
                <span className="text-muted-foreground text-xs">
                  Variables:
                </span>
                {VARIABLE_HINTS.map((hint) => (
                  <button
                    key={hint.variable}
                    type="button"
                    onClick={() => insertVariable(hint.variable)}
                    className="bg-muted hover:bg-muted/80 rounded px-2 py-0.5 font-mono text-xs transition-colors"
                    title={hint.label}
                  >
                    {hint.variable}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading
                ? "Saving..."
                : isEditMode
                  ? "Save Changes"
                  : "Create Quick Reply"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
