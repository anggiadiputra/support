"use client"

import { useState } from "react"
import { DotsHorizontalIcon } from "@radix-ui/react-icons"
import { Row } from "@tanstack/react-table"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Template } from "../data/schema"
import { IconTrash, IconEye, IconSend } from "@tabler/icons-react"
import { useToast } from "@/hooks/use-toast"
import { TemplateDetailDialog } from "./template-detail-dialog"
import { useSubmitTemplate, useDeleteTemplate } from "@/hooks/use-templates"

interface Props {
  row: Row<Template>
}

export function DataTableRowActions({ row }: Props) {
  const template = row.original
  const { toast } = useToast()
  const [showDetail, setShowDetail] = useState(false)
  
  // Use mutation hooks with cache invalidation
  // Requirements: 3.2, 8.1
  const submitMutation = useSubmitTemplate()
  const deleteMutation = useDeleteTemplate()

  const handleSubmit = async () => {
    try {
      await submitMutation.mutateAsync(template.id)
      toast({
        title: "Template Submitted",
        description: "The template has been submitted to Meta for review.",
      })
    } catch (error: any) {
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit template to Meta.",
        variant: "destructive",
      })
    }
  }

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this template? This action cannot be undone.")) {
      return
    }

    try {
      await deleteMutation.mutateAsync(template.id)
      toast({
        title: "Template Deleted",
        description: "The template has been deleted successfully.",
      })
    } catch (error: any) {
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete template.",
        variant: "destructive",
      })
    }
  }

  const isSubmitting = submitMutation.isPending
  const isDeleting = deleteMutation.isPending

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="data-[state=open]:bg-muted flex h-8 w-8 p-0"
          >
            <DotsHorizontalIcon className="h-4 w-4" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[160px]">
          <DropdownMenuItem onClick={() => setShowDetail(true)}>
            <IconEye className="mr-2 h-4 w-4" />
            View Details
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {template.status === "PENDING" && template.metaTemplateId ? (
            <DropdownMenuItem disabled className="text-muted-foreground">
              <IconSend className="mr-2 h-4 w-4" />
              Pending Review
            </DropdownMenuItem>
          ) : template.status !== "APPROVED" ? (
            <DropdownMenuItem onClick={handleSubmit} disabled={isSubmitting}>
              <IconSend className="mr-2 h-4 w-4" />
              {isSubmitting ? "Submitting..." : "Submit to Meta"}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 focus:text-red-600"
          >
            <IconTrash className="mr-2 h-4 w-4" />
            {isDeleting ? "Deleting..." : "Delete"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <TemplateDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        template={template}
      />
    </>
  )
}
