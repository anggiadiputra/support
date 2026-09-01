"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
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
import { Customer } from "../data/schema"
import {
  IconEdit,
  IconTrash,
  IconMessageCircle,
  IconEye,
} from "@tabler/icons-react"
import { useDeleteCustomer } from "@/hooks/use-customers"
import { useToast } from "@/hooks/use-toast"
import { useTranslations, useLocale } from "next-intl"

interface Props {
  row: Row<Customer>
  onView: (customer: Customer) => void
  onEdit: (customer: Customer) => void
}

export function DataTableRowActions({ row, onView, onEdit }: Props) {
  const customer = row.original
  const { toast } = useToast()
  const t = useTranslations("customers")
  const router = useRouter()
  const locale = useLocale()
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  
  const deleteMutation = useDeleteCustomer()
  const isDeleting = deleteMutation.isPending

  const handleView = () => {
    onView(customer)
  }

  const handleEdit = () => {
    onEdit(customer)
  }

  const handleSendMessage = () => {
    // Navigate to OneInbox with phone number to auto-select customer conversation
    const phone = encodeURIComponent(customer.phoneNumber)
    router.push(`/${locale}/oneinbox?phone=${phone}`)
  }

  const handleDelete = () => {
    setShowDeleteDialog(true)
  }

  const confirmDelete = async () => {
    try {
      await deleteMutation.mutateAsync(customer.id)
      toast({
        title: t("deleteSuccess"),
        description: t("deleteSuccessDescription"),
      })
      setShowDeleteDialog(false)
    } catch (error: any) {
      toast({
        title: t("deleteError"),
        description: error.message || t("deleteErrorDescription"),
        variant: "destructive",
      })
    }
  }

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
        <DropdownMenuContent align="end" className="w-[180px]">
          <DropdownMenuItem onClick={handleView}>
            <IconEye className="mr-2 h-4 w-4" />
            {t("viewDetails")}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={handleEdit}>
            <IconEdit className="mr-2 h-4 w-4" />
            {t("editCustomer")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSendMessage}>
            <IconMessageCircle className="mr-2 h-4 w-4" />
            {t("sendMessage")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={handleDelete}
            disabled={isDeleting}
            className="text-red-600 focus:text-red-600"
          >
            <IconTrash className="mr-2 h-4 w-4" />
            {isDeleting ? t("deleting") : t("deleteCustomer")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>{t("deleteConfirmDescription", { name: customer.name || customer.phoneNumber })}</p>
                <div className="rounded-md bg-destructive/10 p-3 text-sm">
                  <p className="font-medium text-destructive">{t("deleteWarningTitle")}</p>
                  <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                    <li>{t("deleteWarningMessages")}</li>
                    <li>{t("deleteWarningConsentLogs")}</li>
                    <li>{t("deleteWarningNotes")}</li>
                    <li>{t("deleteWarningCustomFields")}</li>
                    <li>{t("deleteWarningActivities")}</li>
                  </ul>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>
              {t("cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? t("deleting") : t("deleteCustomer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
