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
import { Badge } from "@/components/ui/badge"
import { ConfirmDialog } from "@/components/confirm-dialog"
import { IconUsersGroup, IconTrash } from "@tabler/icons-react"
import { formatDistanceToNow } from "date-fns"
import { toast } from "@/hooks/use-toast"
import { useRemoveTeamMember } from "@/hooks/use-team"
import type { TeamMember } from "@/lib/api/team-api"

interface TeamMembersListProps {
  members: TeamMember[]
}

export function TeamMembersList({ members }: TeamMembersListProps) {
  const t = useTranslations("team")
  const [removeDialogOpen, setRemoveDialogOpen] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null)

  const removeMember = useRemoveTeamMember()

  const handleRemoveClick = (member: TeamMember) => {
    setSelectedMember(member)
    setRemoveDialogOpen(true)
  }

  const handleConfirmRemove = () => {
    if (!selectedMember) return
    
    removeMember.mutate(selectedMember.id, {
      onSuccess: () => {
        toast({ title: t("members.removeSuccess") })
        setRemoveDialogOpen(false)
        setSelectedMember(null)
      },
      onError: () => {
        toast({ title: t("members.removeError"), variant: "destructive" })
      },
    })
  }

  if (members.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <IconUsersGroup className="text-muted-foreground mb-4 h-12 w-12" />
        <h3 className="mb-2 text-lg font-semibold">{t("members.empty")}</h3>
        <p className="text-muted-foreground text-center text-sm">
          {t("members.emptyDescription")}
        </p>
      </div>
    )
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("members.name")}</TableHead>
            <TableHead>{t("members.email")}</TableHead>
            <TableHead>{t("members.status")}</TableHead>
            <TableHead>{t("members.joinedAt")}</TableHead>
            <TableHead className="text-right">{t("members.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">
                {member.agent?.name || "-"}
              </TableCell>
              <TableCell>{member.agent?.email || "-"}</TableCell>
              <TableCell>
                <Badge variant={member.status === "ACTIVE" ? "default" : "secondary"}>
                  {t(`status.${member.status}`)}
                </Badge>
              </TableCell>
              <TableCell>
                {member.joinedAt
                  ? formatDistanceToNow(new Date(member.joinedAt), { addSuffix: true })
                  : "-"}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveClick(member)}
                  className="text-destructive hover:text-destructive"
                >
                  <IconTrash className="h-4 w-4" />
                  <span className="sr-only">{t("members.remove")}</span>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <ConfirmDialog
        open={removeDialogOpen}
        onOpenChange={setRemoveDialogOpen}
        title={t("members.removeConfirmTitle")}
        desc={t("members.removeConfirmDescription", { 
          name: selectedMember?.agent?.name || "this agent" 
        })}
        destructive
        handleConfirm={handleConfirmRemove}
        isLoading={removeMember.isPending}
      />
    </>
  )
}
