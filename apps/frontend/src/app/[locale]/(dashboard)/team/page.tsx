"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { Header } from "@/components/layout/header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { IconUsersGroup } from "@tabler/icons-react"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { useTeamMembers, useTeamInvitations, useAgentLimit } from "@/hooks/use-team"
import { TeamMembersList } from "./components/team-members-list"
import { PendingInvitations } from "./components/pending-invitations"
import { InviteAgentDialog } from "./components/invite-agent-dialog"
import { Button } from "@/components/ui/button"
import { Plus } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { RoleGuard } from "@/components/auth/role-guard"
import { useSession } from "@/lib/auth-client"
import { UpgradePrompt } from "@/components/subscription/upgrade-prompt"

export default function TeamPage() {
  const t = useTranslations("team")
  const { data: session, isPending: isSessionLoading } = useSession()
  const { userId, userRole, isLoading: isLoadingAccount } = useBusinessAccount()
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false)

  // Get subscription tier
  const user = session?.user as any
  const tier = user?.subscriptionTier || user?.subscription?.tier || 'FREE'
  const isFreeUser = tier === 'FREE'

  // Only fetch data if user is a business owner and not on free tier
  const shouldFetchData = !isFreeUser && !isLoadingAccount && !!userId && userRole === "BUSINESS_OWNER"

  // TanStack Query hooks
  const { data: teamMembers = [], isLoading: isLoadingMembers } = useTeamMembers(shouldFetchData)
  const { data: invitations = [], isLoading: isLoadingInvitations } = useTeamInvitations(shouldFetchData)
  const { data: agentLimit = null, isLoading: isLoadingLimit } = useAgentLimit(shouldFetchData)

  const loading = isLoadingMembers || isLoadingInvitations || isLoadingLimit

  // Show loading state while session or account is loading
  if (loading || isSessionLoading || isLoadingAccount) {
    return (
      <>
        <Header />
        <div className="space-y-6 p-4">
          {/* Header skeleton */}
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
            <div>
              <Skeleton className="h-8 w-32 mb-2" />
              <Skeleton className="h-4 w-64" />
            </div>
            <Skeleton className="h-10 w-36" />
          </div>

          {/* Team Members Card skeleton */}
          <div className="border rounded-lg">
            <div className="p-6 space-y-2">
              <div className="flex items-center gap-2">
                <Skeleton className="h-5 w-5" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-24" />
            </div>
            <div className="px-6 pb-6">
              <div className="border rounded-lg">
                <div className="border-b p-4">
                  <div className="flex gap-4">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="border-b last:border-b-0 p-4">
                    <div className="flex gap-4 items-center">
                      <Skeleton className="h-8 w-8 rounded-full" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Pending Invitations Card skeleton */}
          <div className="border rounded-lg">
            <div className="p-6">
              <Skeleton className="h-5 w-40" />
            </div>
            <div className="px-6 pb-6">
              <div className="border rounded-lg">
                <div className="border-b p-4">
                  <div className="flex gap-4">
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 flex-1" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="border-b last:border-b-0 p-4">
                    <div className="flex gap-4 items-center">
                      <Skeleton className="h-4 flex-1" />
                      <Skeleton className="h-4 flex-1" />
                      <div className="flex gap-2">
                        <Skeleton className="h-8 w-16" />
                        <Skeleton className="h-8 w-16" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    )
  }

  // Show upgrade prompt for FREE users
  if (isFreeUser) {
    return (
      <RoleGuard>
        <Header />
        <div className="p-4 sm:p-6 lg:p-8 space-y-6">
          <div className="flex flex-col gap-2">
            <h2 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <IconUsersGroup className="h-7 w-7" />
              {t("title")}
            </h2>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
          <div className="max-w-md">
            <UpgradePrompt
              feature="teamManagement"
              currentTier={tier}
              requiredTier="BASIC"
            />
          </div>
        </div>
      </RoleGuard>
    )
  }

  // Filter active members only
  const activeMembers = teamMembers.filter(m => m.status === "ACTIVE")

  return (
    <RoleGuard>
      <Header />
      <div className="space-y-6 p-4">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{t("title")}</h2>
            <p className="text-muted-foreground">{t("description")}</p>
          </div>
          <Button size="sm" onClick={() => setInviteDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            {t("invite.button")}
          </Button>
        </div>

        {/* Team Members Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUsersGroup className="h-5 w-5" />
              {t("members.title")}
            </CardTitle>
            {agentLimit && (
              <CardDescription>
                {t("invite.currentCount", {
                  current: agentLimit.currentCount,
                  limit: agentLimit.limit
                })}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <TeamMembersList members={activeMembers} />
          </CardContent>
        </Card>

        {/* Pending Invitations Section */}
        <Card>
          <CardHeader>
            <CardTitle>{t("invitations.title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <PendingInvitations invitations={invitations} />
          </CardContent>
        </Card>
      </div>

      {/* Invite Agent Dialog */}
      <InviteAgentDialog
        open={inviteDialogOpen}
        onOpenChange={setInviteDialogOpen}
        agentLimit={agentLimit}
      />
    </RoleGuard>
  )
}
