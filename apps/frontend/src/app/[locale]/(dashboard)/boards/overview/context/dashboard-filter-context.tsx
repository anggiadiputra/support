"use client"

import { createContext, useContext, useState, type ReactNode } from "react"
import { subDays } from "date-fns"

export interface DateRange {
  from: Date
  to: Date
}

interface DashboardFilterContextType {
  whatsappPhoneNumberId?: string
  dateRange: DateRange
  setDateRange: (range: DateRange) => void
  days: number
}

// Create default date range with proper start/end of day
const createDefaultDateRange = (): DateRange => {
  const now = new Date()
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
  const fromDate = subDays(now, 29) // 30 days including today
  const from = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate(), 0, 0, 0, 0)
  return { from, to }
}

const defaultDateRange: DateRange = createDefaultDateRange()

const DashboardFilterContext = createContext<DashboardFilterContextType>({
  dateRange: defaultDateRange,
  setDateRange: () => {},
  days: 30,
})

export function DashboardFilterProvider({
  whatsappPhoneNumberId,
  children,
}: {
  whatsappPhoneNumberId?: string
  children: ReactNode
}) {
  const [dateRange, setDateRange] = useState<DateRange>(defaultDateRange)

  // Calculate days from date range
  const days = Math.ceil(
    (dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1

  return (
    <DashboardFilterContext.Provider
      value={{ whatsappPhoneNumberId, dateRange, setDateRange, days }}
    >
      {children}
    </DashboardFilterContext.Provider>
  )
}

export function useDashboardFilter() {
  return useContext(DashboardFilterContext)
}
