"use client"

import { Button } from "@/components/ui/button"
import { IconPlus } from "@tabler/icons-react"
import { useState } from "react"
import { CustomersMutateDrawer } from "./customers-mutate-drawer"

export function CustomersPrimaryActions() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size="sm" onClick={() => setIsCreateOpen(true)}>
        <IconPlus className="h-4 w-4" />
        Add Customer
      </Button>

      <CustomersMutateDrawer
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
      />
    </div>
  )
}
