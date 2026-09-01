"use client"

import { IconDownload, IconRefresh } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import DatePicker from "@/components/date-picker"

export default function DashboardActions() {
  const handleRefresh = () => {
    window.location.reload()
  }

  return (
    <div className="flex items-center space-x-2">
      <Button variant="outline" size="sm" onClick={handleRefresh}>
        <IconRefresh size={16} />
        Refresh
      </Button>
      <Button size="sm">
        <IconDownload size={16} />
        Export
      </Button>
      <DatePicker />
    </div>
  )
}
