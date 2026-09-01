"use client"

import { Calendar } from "lucide-react"
import { useDashboardFilter } from "../context/dashboard-filter-context"
import { subDays } from "date-fns"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const presets = [
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
]

export function DashboardDateRangePicker() {
  const { days, setDateRange } = useDashboardFilter()

  const handleSelect = (value: string) => {
    const selectedDays = parseInt(value, 10)
    const now = new Date()
    
    // Set 'to' to end of today (23:59:59.999)
    const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    
    // Set 'from' to start of day (00:00:00)
    const fromDate = subDays(now, selectedDays - 1)
    const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0)
    
    setDateRange({ from, to })
  }

  const currentLabel = presets.find((p) => p.days === days)?.label || "Last 30 days"

  return (
    <Select value={days.toString()} onValueChange={handleSelect}>
      <SelectTrigger className="h-8 w-[140px] text-xs">
        <Calendar className="mr-2 h-3.5 w-3.5" />
        <SelectValue>{currentLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {presets.map((preset) => (
          <SelectItem key={preset.days} value={preset.days.toString()}>
            {preset.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
