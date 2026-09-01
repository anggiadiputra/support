"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { IconAlertTriangle, IconArrowUp } from "@tabler/icons-react"
import { toast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"
import { useInviteAgent } from "@/hooks/use-team"
import type { AgentLimit } from "@/lib/api/team-api"

interface InviteAgentDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  agentLimit: AgentLimit | null
}

export function InviteAgentDialog({
  open,
  onOpenChange,
  agentLimit,
}: InviteAgentDialogProps) {
  const t = useTranslations("team")
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)

  const inviteAgent = useInviteAgent()

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!email.trim()) {
      return
    }

    inviteAgent.mutate(
      { email: email.trim() },
      {
        onSuccess: () => {
          toast({ title: t("invite.success") })
          setEmail("")
          onOpenChange(false)
        },
        onError: (err) => {
          if (err.message === "AGENT_LIMIT_REACHED") {
            setError(t("invite.limitReachedDescription", {
              limit: agentLimit?.limit || 0,
              tier: agentLimit?.tier || "FREE",
            }))
          } else {
            setError(err.message || t("invite.error"))
          }
        },
      }
    )
  }

  const handleUpgrade = () => {
    onOpenChange(false)
    router.push("/subscription")
  }

  const canInvite = agentLimit?.canInvite ?? true
  const isLimitReached = !canInvite

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("invite.title")}</DialogTitle>
          <DialogDescription>{t("invite.description")}</DialogDescription>
        </DialogHeader>

        {isLimitReached ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <IconAlertTriangle className="h-4 w-4" />
              <AlertTitle>{t("invite.limitReached")}</AlertTitle>
              <AlertDescription>
                {t("invite.limitReachedDescription", {
                  limit: agentLimit?.limit || 0,
                  tier: agentLimit?.tier || "FREE",
                })}
              </AlertDescription>
            </Alert>
            <Button size="sm" onClick={handleUpgrade} className="w-full">
              <IconArrowUp className="h-4 w-4" />
              {t("invite.upgradePrompt")}
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="space-y-4">
              {agentLimit && (
                <p className="text-muted-foreground text-sm">
                  {t("invite.currentCount", {
                    current: agentLimit.currentCount,
                    limit: agentLimit.limit,
                  })}
                </p>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">{t("invite.emailLabel")}</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder={t("invite.emailPlaceholder")}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={inviteAgent.isPending}
                />
              </div>

              {error && (
                <Alert variant="destructive">
                  <IconAlertTriangle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
            </div>

            <DialogFooter className="mt-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onOpenChange(false)}
                disabled={inviteAgent.isPending}
              >
                {t("invite.cancel") || "Cancel"}
              </Button>
              <Button type="submit" size="sm" disabled={inviteAgent.isPending || !email.trim()}>
                {inviteAgent.isPending ? t("invite.sending") : t("invite.submit")}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
