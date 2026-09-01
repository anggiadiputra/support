"use client"

import { useState, useEffect } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Plus, Trash2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface CustomField {
  id: string
  name: string
  key: string
  type: string
  required: boolean
  options?: string[]
}

const FIELD_TYPES = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DATE", label: "Date" },
  { value: "BOOLEAN", label: "Yes/No" },
  { value: "SELECT", label: "Select" },
  { value: "MULTI_SELECT", label: "Multi Select" },
]

export function CustomFieldsSettings() {
  const t = useTranslations('common')
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [formData, setFormData] = useState<Partial<CustomField>>({
    name: "",
    key: "",
    type: "TEXT",
    required: false,
    options: []
  })
  const [optionsInput, setOptionsInput] = useState("")

  useEffect(() => {
    fetchFields()
  }, [])

  const fetchFields = async () => {
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/custom-fields`, {
        credentials: 'include'
      })
      const data = await res.json()
      if (data.success) {
        setFields(data.data)
      }
    } catch (error) {
      console.error("Failed to fetch custom fields", error)
      toast({ title: "Failed to fetch fields", variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleOpenDialog = (field?: CustomField) => {
    if (field) {
      setEditingField(field)
      setFormData({
        name: field.name,
        key: field.key,
        type: field.type,
        required: field.required,
        options: field.options || []
      })
      setOptionsInput((field.options || []).join(", "))
    } else {
      setEditingField(null)
      setFormData({
        name: "",
        key: "",
        type: "TEXT",
        required: false,
        options: []
      })
      setOptionsInput("")
    }
    setIsDialogOpen(true)
  }

  const handleSubmit = async () => {
    try {
      const url = editingField
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/custom-fields/${editingField.id}`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/custom-fields`

      const method = editingField ? 'PATCH' : 'POST'

      // Process options if select type
      let finalOptions = formData.options
      if (formData.type === 'SELECT' || formData.type === 'MULTI_SELECT') {
        finalOptions = optionsInput.split(',').map(s => s.trim()).filter(Boolean)
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          ...formData,
          options: finalOptions
        })
      })

      const data = await res.json()
      if (data.success) {
        toast({ title: `Field ${editingField ? 'updated' : 'created'}` })
        setIsDialogOpen(false)
        fetchFields()
      } else {
        toast({ title: data.error || "Operation failed", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error saving field", variant: "destructive" })
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure? This will delete data for this field from all customers.")) return

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/custom-fields/${id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (res.ok) {
        toast({ title: "Field deleted" })
        fetchFields()
      } else {
        toast({ title: "Failed to delete", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error deleting field", variant: "destructive" })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h4 className="text-sm font-medium">Custom Fields</h4>
        <Button onClick={() => handleOpenDialog()} size="sm">
          <Plus className="mr-2 h-4 w-4" /> New Field
        </Button>
      </div>

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Key</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="w-[100px]">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fields.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center h-24 text-muted-foreground">
                  No custom fields defined.
                </TableCell>
              </TableRow>
            ) : (
              fields.map((field) => (
                <TableRow key={field.id}>
                  <TableCell className="font-medium">{field.name}</TableCell>
                  <TableCell className="font-mono text-xs">{field.key}</TableCell>
                  <TableCell>{field.type}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="icon" onClick={() => handleOpenDialog(field)}>
                        <span className="sr-only">Edit</span>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="lucide lucide-pencil"
                        >
                          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                          <path d="m15 5 4 4" />
                        </svg>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(field.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog for Create/Edit */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background p-6 rounded-lg w-full max-w-md space-y-4 border shadow-lg">
            <h3 className="text-lg font-semibold">{editingField ? 'Edit Field' : 'New Custom Field'}</h3>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value
                    // Auto-generate key from name if creating new
                    const key = !editingField ? name.toLowerCase().replace(/[^a-z0-9]/g, '_') : formData.key
                    setFormData({ ...formData, name, key })
                  }}
                  placeholder="e.g. Customer Type"
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Key (API Identifier)</label>
                <Input
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  placeholder="e.g. customer_type"
                  disabled={!!editingField} // Key should typically be immutable after creation
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">Type</label>
                <Select
                  value={formData.type}
                  onValueChange={(val) => setFormData({ ...formData, type: val })}
                  disabled={!!editingField} // Changing type is risky for existing data
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(formData.type === 'SELECT' || formData.type === 'MULTI_SELECT') && (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Options (comma separated)</label>
                  <Input
                    value={optionsInput}
                    onChange={(e) => setOptionsInput(e.target.value)}
                    placeholder="Option 1, Option 2, Option 3"
                  />
                </div>
              )}

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="required"
                  checked={formData.required}
                  onChange={(e) => setFormData({ ...formData, required: e.target.checked })}
                  className="h-4 w-4 rounded border-gray-300"
                />
                <label htmlFor="required" className="text-sm">Required field</label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" size="sm" onClick={() => setIsDialogOpen(false)}>{t('cancel')}</Button>
              <Button size="sm" onClick={handleSubmit}>{t('save')}</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
