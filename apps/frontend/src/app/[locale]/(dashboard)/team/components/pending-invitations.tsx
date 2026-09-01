"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { IconMail, IconRefresh, IconX } from "@tabler/icons-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { useCancelInvitation, useResendInvitation } from "@/hooks/use-team"
import type { Invitation } from "@/lib/api/team-api"

interface PendingInvitationsProps {
  invitations: Invitation[]
}

export function PendingInvitations({ invitations }: PendingInvitationsProps) {
  const t = useTranslations("team")
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false)
  const [selectedInvitation, setSelectedInvitation] = useState<Invitation | null>(null)

  const cancelInvitation = useCancelInvitation()
  const resendInvitation = useResendInvitation()

  const handleCancelClick = (invitation: Invitation) => {
    setSelectedInvitation(invitation)
    setCancelDialogOpen(true)
  }

  const handleConfirmCancel = () => {
    if (!selectedInvitation) return
    
    cancelInvitation.mutate(selectedInvitation.id, {
      onSuccess: () => {
        toast({ title: t("invitations.cancelSuccess") })
        setCancelDialogOpen(false)
        setSelectedInvitation(null)
      },
      onError: () => {
        toast({ title: t("invitations.cancelError"), variant: "destructive" })
      },
    })
  }

  const handleResend = (invitation: Invitation) => {
    resendInvitation.mutate(invitation.id, {
      onSuccess: () => {
        toast({ title: t("invitations.resendSuccess") })
      },
      onError: () => {
        toast({ title: t("invitations.resendError"), variant: "destructive" })
      },
    })
  }

  if (invitations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8">
        <IconMail className="text-muted-foreground mb-4 h-10 w-10" />
        <p className="text-muted-foreground text-sm">{t("invitations.empty")}</p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("invitations.email")}</TableHead>
            <TableHead>{t("invitations.sentAt")}</TableHead>
            <TableHead>{t("invitations.expiresAt")}</TableHead>
            <TableHead className="text-right">{t("invitations.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {invitations.map((invitation) => (
            <TableRow key={invitation.id}>
              <TableCell className="font-medium">{invitation.email}</TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(invitation.createdAt), { addSuffix: true })}
              </TableCell>
              <TableCell>
                {formatDistanceToNow(new Date(invitation.expiresAt), { addSuffix: true })}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleResend(invitation)}
                    disabled={resendInvitation.isPending}
                  >
                    <IconRefresh className={`h-4 w-4 ${resendInvitation.isPending ? 'animate-spin' : ''}`} />
                    <span className="ml-1 hidden sm:inline">{t("invitations.resend")}</span>
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCancelClick(invitation)}
                    className="text-destructive hover:text-destructive"
                  >
                    <IconX className="h-4 w-4" />
                    <span className="ml-1 hidden sm:inline">{t("invitations.cancel")}</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title={t("invitations.cancelConfirmTitle")}
        desc={t("invitations.cancelConfirmDescription", { 
          email: selectedInvitation?.email || "" 
        })}
        destructive
        handleConfirm={handleConfirmCancel}
        isLoading={cancelInvitation.isPending}
      />
    </>
  )
}
