"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type {
  QuickReplyCategory,
  CreateQuickReplyCategoryInput,
  UpdateQuickReplyCategoryInput,
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

interface CategoryDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: QuickReplyCategory
  onSubmit: (
    data: CreateQuickReplyCategoryInput | UpdateQuickReplyCategoryInput
  ) => void
  isLoading?: boolean
}

export function CategoryDialog({
  open,
  onOpenChange,
  category,
  onSubmit,
  isLoading,
}: CategoryDialogProps) {
  const isEditMode = !!category

  const [name, setName] = useState("")
  const [error, setError] = useState<string | undefined>()

  // Reset form when dialog opens/closes or category changes
  useEffect(() => {
    if (open) {
      setName(category?.name || "")
      setError(undefined)
    }
  }, [open, category])

  const validateName = (value: string): string | undefined => {
    if (!value.trim()) {
      return "Name is required"
    }
    if (value.trim().length > 50) {
      return "Name must be 50 characters or less"
    }
    return undefined
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    const nameError = validateName(name)
    if (nameError) {
      setError(nameError)
      return
    }

    onSubmit({ name: name.trim() })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEditMode ? "Edit Category" : "Create Category"}
            </DialogTitle>
            <DialogDescription>
              {isEditMode
                ? "Update the category name."
                : "Create a new category to organize your quick replies."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (error) {
                    setError(validateName(e.target.value))
                  }
                }}
                placeholder="Greetings"
                className={cn(error && "border-destructive")}
                maxLength={50}
                autoFocus
              />
              {error && <p className="text-destructive text-sm">{error}</p>}
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
                  : "Create Category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
