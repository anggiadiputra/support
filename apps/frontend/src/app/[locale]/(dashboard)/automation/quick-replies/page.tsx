"use client"

import { useState, useMemo } from "react"
import { IconMessage, IconSearch } from "@tabler/icons-react"
import { Info, Plus } from "lucide-react"
import {
  useQuickReplies,
  useQuickReplyCategories,
  useCreateQuickReply,
  useUpdateQuickReply,
  useDeleteQuickReply,
  useCreateQuickReplyCategory,
  useUpdateQuickReplyCategory,
  useDeleteQuickReplyCategory,
  type QuickReply,
  type QuickReplyCategory,
  type CreateQuickReplyInput,
  type UpdateQuickReplyInput,
  type CreateQuickReplyCategoryInput,
  type UpdateQuickReplyCategoryInput,
} from "@/hooks/use-quick-replies"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

import { CategoryDialog } from "../components/category-dialog"
import { QuickReplyDialog } from "../components/quick-reply-dialog"
import { QuickReplyList } from "../components/quick-reply-list"

export default function QuickRepliesPage() {
  const { toast } = useToast()

  // Data fetching
  const {
    data: quickReplies,
    isLoading: isLoadingReplies,
    isError: isErrorReplies,
  } = useQuickReplies()
  const {
    data: categories,
    isLoading: isLoadingCategories,
    isError: isErrorCategories,
  } = useQuickReplyCategories()

  // Mutations
  const createReply = useCreateQuickReply()
  const updateReply = useUpdateQuickReply()
  const deleteReply = useDeleteQuickReply()
  const createCategory = useCreateQuickReplyCategory()
  const updateCategory = useUpdateQuickReplyCategory()
  const deleteCategory = useDeleteQuickReplyCategory()

  // UI State
  const [searchQuery, setSearchQuery] = useState("")
  const [replyDialogOpen, setReplyDialogOpen] = useState(false)
  const [categoryDialogOpen, setCategoryDialogOpen] = useState(false)
  const [editingReply, setEditingReply] = useState<QuickReply | undefined>()
  const [editingCategory, setEditingCategory] = useState<
    QuickReplyCategory | undefined
  >()

  // Filter quick replies by search
  const filteredReplies = useMemo(() => {
    if (!quickReplies) return []
    if (!searchQuery.trim()) return quickReplies

    const query = searchQuery.toLowerCase()
    return quickReplies.filter(
      (reply) =>
        reply.shortcut.toLowerCase().includes(query) ||
        reply.title.toLowerCase().includes(query) ||
        reply.content.toLowerCase().includes(query)
    )
  }, [quickReplies, searchQuery])

  const isLoading = isLoadingReplies || isLoadingCategories
  const isError = isErrorReplies || isErrorCategories
  const hasData = quickReplies && quickReplies.length > 0

  // Handlers
  const handleCreateReply = () => {
    setEditingReply(undefined)
    setReplyDialogOpen(true)
  }

  const handleEditReply = (reply: QuickReply) => {
    setEditingReply(reply)
    setReplyDialogOpen(true)
  }

  const handleReplySubmit = async (
    data: CreateQuickReplyInput | UpdateQuickReplyInput
  ) => {
    try {
      if (editingReply) {
        await updateReply.mutateAsync({
          id: editingReply.id,
          data: data as UpdateQuickReplyInput,
        })
        toast({ title: "Quick reply updated" })
      } else {
        await createReply.mutateAsync(data as CreateQuickReplyInput)
        toast({ title: "Quick reply created" })
      }
      setReplyDialogOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    }
  }

  const handleDeleteReply = async (reply: QuickReply) => {
    try {
      await deleteReply.mutateAsync(reply.id)
      toast({ title: "Quick reply deleted" })
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete",
        variant: "destructive",
      })
    }
  }

  const handleCreateCategory = () => {
    setEditingCategory(undefined)
    setCategoryDialogOpen(true)
  }

  const handleEditCategory = (category: QuickReplyCategory) => {
    setEditingCategory(category)
    setCategoryDialogOpen(true)
  }

  const handleCategorySubmit = async (
    data: CreateQuickReplyCategoryInput | UpdateQuickReplyCategoryInput
  ) => {
    try {
      if (editingCategory) {
        await updateCategory.mutateAsync({
          id: editingCategory.id,
          data: data as UpdateQuickReplyCategoryInput,
        })
        toast({ title: "Category updated" })
      } else {
        await createCategory.mutateAsync(data as CreateQuickReplyCategoryInput)
        toast({ title: "Category created" })
      }
      setCategoryDialogOpen(false)
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      })
    }
  }

  const handleDeleteCategory = async (category: QuickReplyCategory) => {
    try {
      await deleteCategory.mutateAsync(category.id)
      toast({ title: "Category deleted" })
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error ? error.message : "Failed to delete",
        variant: "destructive",
      })
    }
  }

  if (isLoading) {
    return (
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
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div>
          <div className="flex items-center gap-2">
            <IconMessage className="h-5 w-5 sm:h-6 sm:w-6" />
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Quick Replies</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            Create shortcuts for frequently used messages
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleCreateCategory} className="flex-1 sm:flex-none">
            <Plus className="h-4 w-4" />
            Category
          </Button>
          <Button size="sm" onClick={handleCreateReply} className="flex-1 sm:flex-none">
            <Plus className="h-4 w-4" />
            Reply
          </Button>
        </div>
      </div>

      {/* Info Alert - Hidden on mobile */}
      <Alert className="hidden sm:flex">
        <Info className="h-4 w-4" />
        <AlertDescription>
          Type{" "}
          <code className="bg-muted rounded px-1.5 py-0.5 font-mono text-xs">
            /shortcut
          </code>{" "}
          in the message input to quickly insert a reply.
        </AlertDescription>
      </Alert>

      {/* Content */}
      <div>
        {/* Error State */}
        {isError && (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load quick replies. Please try again later.
            </AlertDescription>
          </Alert>
        )}

        {/* Empty State */}
        {!isError && !hasData && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="text-muted-foreground mb-4">
              <p className="text-lg font-medium">No quick replies yet</p>
              <p className="text-sm">
                Create your first quick reply to speed up customer conversations
              </p>
            </div>
          </div>
        )}

        {/* Content */}
        {!isError && hasData && (
          <div className="space-y-4">
            {/* Search */}
            <div className="relative max-w-sm">
              <IconSearch className="text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                placeholder="Search quick replies..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* List */}
            {filteredReplies.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="text-muted-foreground">
                  <p className="text-sm">No quick replies match your search</p>
                </div>
              </div>
            ) : (
              <QuickReplyList
                quickReplies={filteredReplies}
                categories={categories || []}
                onEdit={handleEditReply}
                onDelete={handleDeleteReply}
                onEditCategory={handleEditCategory}
                onDeleteCategory={handleDeleteCategory}
              />
            )}
          </div>
        )}
      </div>

      {/* Quick Reply Dialog */}
      <QuickReplyDialog
        open={replyDialogOpen}
        onOpenChange={setReplyDialogOpen}
        quickReply={editingReply}
        categories={categories || []}
        onSubmit={handleReplySubmit}
        isLoading={createReply.isPending || updateReply.isPending}
      />

      {/* Category Dialog */}
      <CategoryDialog
        open={categoryDialogOpen}
        onOpenChange={setCategoryDialogOpen}
        category={editingCategory}
        onSubmit={handleCategorySubmit}
        isLoading={createCategory.isPending || updateCategory.isPending}
      />
    </div>
  )
}
