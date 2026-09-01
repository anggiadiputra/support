"use client"

import { useState } from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import type { QuickReply, QuickReplyCategory } from "@/hooks/use-quick-replies"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface QuickReplyListProps {
  quickReplies: QuickReply[]
  categories: QuickReplyCategory[]
  onEdit: (quickReply: QuickReply) => void
  onDelete: (quickReply: QuickReply) => void
  onEditCategory: (category: QuickReplyCategory) => void
  onDeleteCategory: (category: QuickReplyCategory) => void
}

export function QuickReplyList({
  quickReplies,
  categories,
  onEdit,
  onDelete,
  onEditCategory,
  onDeleteCategory,
}: QuickReplyListProps) {
  const [deleteReply, setDeleteReply] = useState<QuickReply | null>(null)
  const [deleteCategory, setDeleteCategory] =
    useState<QuickReplyCategory | null>(null)

  const handleDeleteReply = () => {
    if (deleteReply) {
      onDelete(deleteReply)
      setDeleteReply(null)
    }
  }

  const handleDeleteCategory = () => {
    if (deleteCategory) {
      onDeleteCategory(deleteCategory)
      setDeleteCategory(null)
    }
  }

  // Get category name by id
  const getCategoryName = (categoryId?: string) => {
    if (!categoryId) return null
    const category = categories.find((c) => c.id === categoryId)
    return category?.name || null
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Shortcut</TableHead>
              <TableHead>Title</TableHead>
              <TableHead className="max-w-[300px]">Content</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="w-[50px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {quickReplies.map((reply) => (
              <TableRow key={reply.id}>
                <TableCell>
                  <Badge variant="outline" className="font-mono text-xs">
                    /{reply.shortcut}
                  </Badge>
                </TableCell>
                <TableCell className="font-medium">{reply.title}</TableCell>
                <TableCell className="max-w-[300px]">
                  <p className="text-muted-foreground text-sm truncate">
                    {reply.content.length > 80
                      ? reply.content.substring(0, 80) + "..."
                      : reply.content}
                  </p>
                </TableCell>
                <TableCell>
                  {reply.category ? (
                    <Badge variant="secondary" className="text-xs">
                      {reply.category.name}
                    </Badge>
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
                      <DropdownMenuItem onClick={() => onEdit(reply)}>
                        <Pencil className="mr-2 h-4 w-4" />
                        Edit
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteReply(reply)}
                        className="text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Categories Section */}
      {categories.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-medium mb-3">Categories</h3>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Quick Replies</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => {
                  const replyCount = quickReplies.filter(
                    (r) => r.category?.id === category.id
                  ).length
                  return (
                    <TableRow key={category.id}>
                      <TableCell className="font-medium">
                        {category.name}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{replyCount}</Badge>
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => onEditCategory(category)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => setDeleteCategory(category)}
                              className="text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Delete Reply Confirmation */}
      <AlertDialog
        open={!!deleteReply}
        onOpenChange={() => setDeleteReply(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quick Reply</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteReply?.title}&quot;?
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteReply}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Category Confirmation */}
      <AlertDialog
        open={!!deleteCategory}
        onOpenChange={() => setDeleteCategory(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Category</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteCategory?.name}
              &quot;? Quick replies in this category will become uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteCategory}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
