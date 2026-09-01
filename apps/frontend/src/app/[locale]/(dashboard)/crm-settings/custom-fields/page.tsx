"use client"

import { useState, useEffect } from "react"
import { IconForms } from "@tabler/icons-react"
import { Info, Plus, Pencil, Trash2, MoreHorizontal } from "lucide-react"
import { useTranslations } from "next-intl"
import { RoleGuard } from "@/components/auth/role-guard"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Checkbox } from "@/components/ui/checkbox"
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { Label } from "@/components/ui/label"

interface CustomField {
  id: string
  name: string
  key: string
  type: string
  required: boolean
  options?: string[]
}

const FIELD_TYPE_KEYS = ["TEXT", "NUMBER", "DATE", "BOOLEAN", "SELECT", "MULTI_SELECT"] as const

export default function CustomFieldsSettingsPage() {
  const t = useTranslations("crmSettings.customFields")
  const tCommon = useTranslations("crmSettings.common")
  const [fields, setFields] = useState<CustomField[]>([])
  const [loading, setLoading] = useState(true)
  const { toast } = useToast()

  const getTypeLabel = (type: string) => {
    return t(`types.${type}`)
  }

  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingField, setEditingField] = useState<CustomField | null>(null)
  const [deletingField, setDeletingField] = useState<CustomField | null>(null)
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

  const handleDelete = async () => {
    if (!deletingField) return

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/crm/custom-fields/${deletingField.id}`, {
        method: 'DELETE',
        credentials: 'include'
      })

      if (res.ok) {
        toast({ title: "Field deleted" })
        setDeletingField(null)
        fetchFields()
      } else {
        toast({ title: "Failed to delete", variant: "destructive" })
      }
    } catch (error) {
      toast({ title: "Error deleting field", variant: "destructive" })
    }
  }

  if (loading) {
    return (
      <RoleGuard>
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-96" />
            </div>
            <Skeleton className="h-10 w-28" />
          </div>
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </RoleGuard>
    )
  }

  return (
    <RoleGuard>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <IconForms className="h-6 w-6" />
              <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
            </div>
            <p className="text-muted-foreground">
              {t("description")}
            </p>
          </div>
          <Button size="sm" onClick={() => handleOpenDialog()}>
            <Plus className="h-4 w-4" />
            {t("newField")}
          </Button>
        </div>

        {/* Info Alert */}
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t("info")}
          </AlertDescription>
        </Alert>

        {/* Empty State */}
        {fields.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-muted-foreground mb-4">
              <p className="text-lg font-medium">{t("empty.title")}</p>
              <p className="text-sm">
                {t("empty.description")}
              </p>
            </div>
          </div>
        ) : (
          /* Fields Table */
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("table.name")}</TableHead>
                  <TableHead>{t("table.key")}</TableHead>
                  <TableHead>{t("table.type")}</TableHead>
                  <TableHead className="text-center">{t("table.required")}</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {fields.map((field) => (
                  <TableRow key={field.id}>
                    <TableCell className="font-medium">{field.name}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-mono text-xs">
                        {field.key}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{getTypeLabel(field.type)}</Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      {field.required ? (
                        <Badge variant="default" className="text-xs">{tCommon("yes")}</Badge>
                      ) : (
                        <span className="text-muted-foreground text-sm">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenDialog(field)}>
                            <Pencil className="mr-2 h-4 w-4" />
                            {tCommon("edit")}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => setDeletingField(field)}
                            className="text-destructive"
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {tCommon("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {/* Create/Edit Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingField ? t("dialog.editTitle") : t("dialog.createTitle")}</DialogTitle>
              <DialogDescription>
                {editingField 
                  ? t("dialog.editDescription")
                  : t("dialog.createDescription")
                }
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t("dialog.fieldName")}</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => {
                    const name = e.target.value
                    const key = !editingField ? name.toLowerCase().replace(/[^a-z0-9]/g, '_') : formData.key
                    setFormData({ ...formData, name, key })
                  }}
                  placeholder={t("dialog.fieldNamePlaceholder")}
                />
              </div>

              <div className="space-y-2">
                <Label>{t("dialog.fieldKey")}</Label>
                <Input
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  placeholder={t("dialog.fieldKeyPlaceholder")}
                  disabled={!!editingField}
                />
                <p className="text-xs text-muted-foreground">
                  {t("dialog.fieldKeyHelp")}
                </p>
              </div>

              <div className="space-y-2">
                <Label>{t("dialog.fieldType")}</Label>
                <Select
                  value={formData.type}
                  onValueChange={(val) => setFormData({ ...formData, type: val })}
                  disabled={!!editingField}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FIELD_TYPE_KEYS.map(typeKey => (
                      <SelectItem key={typeKey} value={typeKey}>{t(`types.${typeKey}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {(formData.type === 'SELECT' || formData.type === 'MULTI_SELECT') && (
                <div className="space-y-2">
                  <Label>{t("dialog.options")}</Label>
                  <Input
                    value={optionsInput}
                    onChange={(e) => setOptionsInput(e.target.value)}
                    placeholder={t("dialog.optionsPlaceholder")}
                  />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="required"
                  checked={formData.required}
                  onCheckedChange={(checked) => setFormData({ ...formData, required: checked as boolean })}
                />
                <Label htmlFor="required" className="text-sm font-normal">
                  {t("dialog.requiredField")}
                </Label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>{tCommon("cancel")}</Button>
              <Button onClick={handleSubmit}>
                {editingField ? t("dialog.saveButton") : t("dialog.createButton")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deletingField} onOpenChange={() => setDeletingField(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("dialog.editTitle")}</AlertDialogTitle>
              <AlertDialogDescription>
                {t("deleteConfirm", { name: deletingField?.name || "" })}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{tCommon("cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {tCommon("delete")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </RoleGuard>
  )
}
