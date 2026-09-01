"use client"

import { useRouter, useSearchParams } from "next/navigation"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Download } from "lucide-react"

export function AnalyticsFilter() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const currentTimeRange = searchParams.get("timeRange") || "7d"

    const handleValueChange = (value: string) => {
        const params = new URLSearchParams(searchParams)
        params.set("timeRange", value)
        router.push(`?${params.toString()}`)
    }

    return (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <Select value={currentTimeRange} onValueChange={handleValueChange}>
                <SelectTrigger className="w-[180px]">
                    <SelectValue />
                </SelectTrigger>
                <SelectContent>
                    <SelectItem value="24h">Last 24 Hours</SelectItem>
                    <SelectItem value="7d">Last 7 Days</SelectItem>
                    <SelectItem value="30d">Last 30 Days</SelectItem>
                    <SelectItem value="90d">Last 90 Days</SelectItem>
                </SelectContent>
            </Select>
            <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
            </Button>
        </div>
    )
}
