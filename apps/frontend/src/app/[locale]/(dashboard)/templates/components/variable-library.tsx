"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  IconSearch,
  IconVariable,
  IconLink,
  IconCurrencyDollar,
  IconCalendar,
  IconPhoto,
  IconVideo,
  IconFile,
  IconLetterCase,
  IconChevronLeft,
  IconChevronRight,
  IconFilter,
  IconPlus,
  IconTrash,
} from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { VariableFormDialog } from "./variable-form-dialog"
import { ConfirmDialog } from "@/components/confirm-dialog"

const ITEMS_PER_PAGE = 10

export interface TemplateVariable {
  id: string
  userId: string
  name: string
  type: "TEXT" | "URL" | "CURRENCY" | "DATE" | "IMAGE" | "VIDEO" | "DOCUMENT"
  description: string | null
  exampleValue: string | null
  usageCount: number
  createdAt: string
  updatedAt: string
}

const typeIcons: Record<TemplateVariable["type"], React.ElementType> = {
  TEXT: IconLetterCase,
  URL: IconLink,
  CURRENCY: IconCurrencyDollar,
  DATE: IconCalendar,
  IMAGE: IconPhoto,
  VIDEO: IconVideo,
  DOCUMENT: IconFile,
}

const typeColors: Record<TemplateVariable["type"], string> = {
  TEXT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
  URL: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
  CURRENCY: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
  DATE: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
  IMAGE: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-300",
  VIDEO: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
  DOCUMENT: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300",
}

const VARIABLE_TYPES = ["TEXT", "URL", "CURRENCY", "DATE", "IMAGE", "VIDEO", "DOCUMENT"] as const
type VariableTypeFilter = typeof VARIABLE_TYPES[number] | "ALL"

export function VariableLibrary() {
  const t = useTranslations("templates.variables")
  const { toast } = useToast()
  const [variables, setVariables] = useState<TemplateVariable[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [typeFilter, setTypeFilter] = useState<VariableTypeFilter>("ALL")
  const [currentPage, setCurrentPage] = useState(1)
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [deleteVariable, setDeleteVariable] = useState<TemplateVariable | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const loadVariables = useCallback(async () => {
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(`${apiUrl}/api/v1/template-variables`, {
        credentials: "include",
      })

      if (response.ok) {
        const result = await response.json()
        setVariables(result.data || [])
      } else {
        console.error("Failed to load variables")
      }
    } catch (error) {
      console.error("Error loading variables:", error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadVariables()
  }, [loadVariables])

  const handleCreate = () => {
    setIsFormOpen(true)
  }

  const handleFormSuccess = () => {
    setIsFormOpen(false)
    loadVariables()
  }

  const handleDelete = async () => {
    if (!deleteVariable) return

    setIsDeleting(true)
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/template-variables/${deleteVariable.id}`,
        {
          method: "DELETE",
          credentials: "include",
        }
      )

      if (response.ok) {
        toast({
          title: t("toast.deleted"),
        })
        loadVariables()
      } else {
        const result = await response.json()
        let errorMessage = result.error?.message || t("toast.deleteFailed")
        if (result.error?.code === "NotFound") {
          errorMessage = t("toast.notFound")
        } else if (result.error?.code === "Conflict") {
          errorMessage = t("toast.inUse")
        }
        toast({
          title: t("toast.error"),
          description: errorMessage,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error deleting variable:", error)
      toast({
        title: t("toast.error"),
        description: t("toast.networkError"),
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setDeleteVariable(null)
    }
  }

  // Filter variables by search query and type
  const filteredVariables = useMemo(() => {
    return variables.filter((variable) => {
      const matchesSearch = 
        variable.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        variable.description?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const matchesType = typeFilter === "ALL" || variable.type === typeFilter
      
      return matchesSearch && matchesType
    })
  }, [variables, searchQuery, typeFilter])

  // Pagination calculations
  const totalPages = Math.ceil(filteredVariables.length / ITEMS_PER_PAGE)
  const paginatedVariables = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    return filteredVariables.slice(startIndex, startIndex + ITEMS_PER_PAGE)
  }, [filteredVariables, currentPage])

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [searchQuery, typeFilter])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="bg-muted h-10 w-64 rounded"></div>
          <div className="bg-muted h-64 w-full rounded"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center flex-1">
          <div className="relative flex-1 max-w-sm">
            <IconSearch className="text-muted-foreground absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
            <Input
              placeholder={t("search")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select
            value={typeFilter}
            onValueChange={(value: VariableTypeFilter) => setTypeFilter(value)}
          >
            <SelectTrigger className="w-full sm:w-[160px]">
              <IconFilter className="h-4 w-4 mr-2" />
              <SelectValue placeholder={t("filterByType")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{t("allTypes")}</SelectItem>
              {VARIABLE_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {t(`types.${type}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleCreate}>
          <IconPlus className="h-4 w-4 mr-2" />
          {t("createVariable")}
        </Button>
      </div>

      {filteredVariables.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-16">
            <IconVariable className="text-muted-foreground mb-4 h-12 w-12" />
            <h3 className="mb-2 text-lg font-semibold">
              {searchQuery || typeFilter !== "ALL" ? t("noResults") : t("empty")}
            </h3>
            <p className="text-muted-foreground mb-4 text-center text-sm">
              {searchQuery || typeFilter !== "ALL"
                ? t("noResultsDescription")
                : t("emptyDescription")}
            </p>
            {!searchQuery && typeFilter === "ALL" && (
              <Button onClick={handleCreate}>
                <IconPlus className="h-4 w-4 mr-2" />
                {t("createVariable")}
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("name")}</TableHead>
                  <TableHead>{t("type")}</TableHead>
                  <TableHead className="hidden md:table-cell">{t("exampleValue")}</TableHead>
                  <TableHead className="hidden sm:table-cell">{t("usageCount")}</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedVariables.map((variable) => {
                  const TypeIcon = typeIcons[variable.type]
                  return (
                    <TableRow key={variable.id}>
                      <TableCell>
                        <div className="flex flex-col gap-1">
                          <span className="font-medium">{variable.name}</span>
                          {variable.description && (
                            <span className="text-muted-foreground text-xs line-clamp-1">
                              {variable.description}
                            </span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`gap-1 ${typeColors[variable.type]}`}
                        >
                          <TypeIcon className="h-3 w-3" />
                          {t(`types.${variable.type}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className="text-muted-foreground text-sm truncate max-w-[200px] block">
                          {variable.exampleValue || "-"}
                        </span>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-muted-foreground text-sm">
                          {variable.usageCount}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive"
                          onClick={() => setDeleteVariable(variable)}
                        >
                          <IconTrash className="h-4 w-4" />
                          <span className="sr-only">{t("deleteVariable")}</span>
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-2">
              <p className="text-muted-foreground text-sm">
                {t("pagination.showing", {
                  from: (currentPage - 1) * ITEMS_PER_PAGE + 1,
                  to: Math.min(currentPage * ITEMS_PER_PAGE, filteredVariables.length),
                  total: filteredVariables.length,
                })}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                >
                  <IconChevronLeft className="h-4 w-4" />
                  <span className="sr-only">{t("pagination.previous")}</span>
                </Button>
                <span className="text-sm">
                  {t("pagination.page", { current: currentPage, total: totalPages })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                >
                  <IconChevronRight className="h-4 w-4" />
                  <span className="sr-only">{t("pagination.next")}</span>
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <VariableFormDialog
        open={isFormOpen}
        onOpenChange={setIsFormOpen}
        onSuccess={handleFormSuccess}
      />

      <ConfirmDialog
        open={!!deleteVariable}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteVariable(null)
          }
        }}
        title={t("deleteConfirm.title")}
        desc={t("deleteConfirm.description")}
        confirmText={t("deleteVariable")}
        handleConfirm={handleDelete}
        isLoading={isDeleting}
        destructive
      />
    </div>
  )
}
