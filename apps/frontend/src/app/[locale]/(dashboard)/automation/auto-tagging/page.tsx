"use client"

import { useState } from "react"
import { RoleGuard } from "@/components/auth/role-guard"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Plus, Info } from "lucide-react"
import { IconTag } from "@tabler/icons-react"
import { Skeleton } from "@/components/ui/skeleton"
import { useAutoTagRules } from "@/hooks/use-auto-tagging"
import { RulesTable } from "./components/rules-table"
import { RuleFormDialog } from "./components/rule-form-dialog"

export default function AutoTaggingPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const { data: rules = [], isLoading, error } = useAutoTagRules()

  if (isLoading) {
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
        <div className="flex justify-between items-center">
          <div>
            <div className="flex items-center gap-2">
              <IconTag className="h-6 w-6" />
              <h2 className="text-2xl font-bold tracking-tight">Auto Tagging</h2>
            </div>
            <p className="text-muted-foreground">
              Automatically tag customers and move them to pipeline stages based on message keywords
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4" />
            New Rule
          </Button>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Auto-tagging rules check inbound messages from WhatsApp, Instagram, and Facebook Messenger. 
            When a message contains any of the keywords, the customer is automatically tagged 
            and optionally moved to a pipeline stage.
          </AlertDescription>
        </Alert>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>
              Failed to load auto-tagging rules. Please try again later.
            </AlertDescription>
          </Alert>
        ) : (
          <RulesTable rules={rules} />
        )}

        <RuleFormDialog
          open={createDialogOpen}
          onOpenChange={setCreateDialogOpen}
          mode="create"
        />
      </div>
    </RoleGuard>
  )
}
