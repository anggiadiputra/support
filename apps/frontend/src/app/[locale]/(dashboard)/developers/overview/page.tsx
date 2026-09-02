"use client"

import { Link } from "@/i18n/routing"
import { nofitySubmittedValues } from "@/lib/notify-submitted-values"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DateRangePicker } from "@/components/date-range-picker"
import { ApiRequestsChart } from "./components/api-requests-chart"
import { ApiResponseTimeChart } from "./components/api-response-time-chart"
import RecentActivity from "./components/recent-activity"
import { TotalVisitorsChart } from "./components/total-visitors-chart"

export default function OverviewPage() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex w-full flex-col gap-3">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link href="/dashboard" className="text-gray-500 hover:text-gray-900">Dashboard</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="text-gray-500">Developers</BreadcrumbPage>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="font-semibold text-gray-900">Overview</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl md:text-2xl font-bold text-gray-900 tracking-tight">
              Developer Overview
            </h2>
            <p className="text-sm text-gray-500">
              Build, manage, and optimize your developer integrations seamlessly.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Select defaultValue="production">
              <SelectTrigger className="w-fit gap-2 text-sm bg-white border-gray-200 rounded-lg">
                <SelectValue placeholder="Server" />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Server</SelectLabel>
                  <SelectItem value="production">Production</SelectItem>
                  <SelectItem value="development">Development</SelectItem>
                </SelectGroup>
              </SelectContent>
            </Select>
            <DateRangePicker
              onUpdate={(values) => nofitySubmittedValues(values)}
              initialDateFrom="2024-01-01"
              initialDateTo="2024-12-31"
              align="end"
              locale="en-GB"
              showCompare={false}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex basis-2/3 flex-col gap-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ApiRequestsChart />
            <ApiResponseTimeChart />
          </div>
          <TotalVisitorsChart />
        </div>
        <div className="flex flex-1 flex-col">
          <RecentActivity />
        </div>
      </div>
    </div>
  )
}
