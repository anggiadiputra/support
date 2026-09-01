"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Loader2, Phone, Mail, User, Pencil, Check, X, MessageCircle } from "lucide-react"
import type { CRMCustomerDetail } from "../../types/unified-inbox"

interface ContactSectionProps {
  customer: CRMCustomerDetail
  onUpdate: (updates: { name?: string; email?: string; customFields?: Record<string, string> }) => Promise<boolean>
  loading?: boolean
}

interface EditableFieldProps {
  label: string
  value: string
  icon: React.ReactNode
  onSave: (value: string) => Promise<boolean>
  validate?: (value: string) => string | null
  disabled?: boolean
}

function EditableField({ label, value, icon, onSave, validate, disabled }: EditableFieldProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(value)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleEdit = () => {
    setEditValue(value)
    setError(null)
    setIsEditing(true)
  }

  const handleCancel = () => {
    setEditValue(value)
    setError(null)
    setIsEditing(false)
  }

  const handleSave = async () => {
    if (validate) {
      const validationError = validate(editValue)
      if (validationError) {
        setError(validationError)
        return
      }
    }

    setIsSaving(true)
    const success = await onSave(editValue)
    setIsSaving(false)

    if (success) {
      setIsEditing(false)
      setError(null)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave()
    } else if (e.key === "Escape") {
      handleCancel()
    }
  }

  if (isEditing) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <div className="text-muted-foreground shrink-0">{icon}</div>
          <Input
            value={editValue}
            onChange={(e) => {
              setEditValue(e.target.value)
              setError(null)
            }}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="h-8 text-sm"
            autoFocus
          />
          <Button
            size="icon"
            variant="ghost"
            onClick={handleSave}
            disabled={isSaving}
            className="h-8 w-8 shrink-0"
          >
            {isSaving ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Check className="h-3 w-3" />
            )}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={handleCancel}
            disabled={isSaving}
            className="h-8 w-8 shrink-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
        {error && <p className="text-xs text-destructive pl-6">{error}</p>}
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2 group">
      <div className="text-muted-foreground shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm truncate">{value || "-"}</p>
      </div>
      {!disabled && (
        <Button
          size="icon"
          variant="ghost"
          onClick={handleEdit}
          className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Pencil className="h-3 w-3" />
        </Button>
      )}
    </div>
  )
}

const validateEmail = (email: string): string | null => {
  if (!email) return null // Allow empty email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return "Invalid email format"
  }
  return null
}

export function ContactSection({ customer, onUpdate, loading = false }: ContactSectionProps) {
  const handleNameSave = async (name: string) => {
    return onUpdate({ name })
  }

  const handleEmailSave = async (email: string) => {
    return onUpdate({ email })
  }

  return (
    <div className="p-4 border-b">
      <h4 className="text-sm font-medium flex items-center gap-2 mb-3">
        <Phone className="h-4 w-4 text-muted-foreground" />
        Contact Information
      </h4>

      <div className="space-y-3">
        <EditableField
          label="Name"
          value={customer.name || ""}
          icon={<User className="h-4 w-4" />}
          onSave={handleNameSave}
          disabled={loading}
        />

        <div className="flex items-center gap-2">
          <div className="text-muted-foreground shrink-0">
            <Phone className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">Phone</p>
            <p className="text-sm truncate">{customer.phoneNumber}</p>
          </div>
        </div>

        <EditableField
          label="Email"
          value={customer.email || ""}
          icon={<Mail className="h-4 w-4" />}
          onSave={handleEmailSave}
          validate={validateEmail}
          disabled={loading}
        />

        {/* WhatsApp Identifier (BSUID) */}
        {customer.whatsappBsuid && (
          <div className="flex items-center gap-2">
            <div className="text-muted-foreground shrink-0">
              <MessageCircle className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">WhatsApp ID</p>
              {customer.whatsappUsername ? (
                <p className="text-sm truncate">{customer.whatsappUsername}</p>
              ) : (
                <p className="text-sm font-mono truncate">{customer.whatsappBsuid}</p>
              )}
            </div>
          </div>
        )}

        {/* Custom fields */}
        {Object.keys(customer.customFields || {}).length > 0 && (
          <div className="pt-2 border-t">
            <p className="text-xs text-muted-foreground mb-2">Custom Fields</p>
            <div className="space-y-2">
              {Object.entries(customer.customFields).map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground capitalize">
                      {key.replace(/_/g, " ")}
                    </p>
                    <p className="text-sm truncate">{value || "-"}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
