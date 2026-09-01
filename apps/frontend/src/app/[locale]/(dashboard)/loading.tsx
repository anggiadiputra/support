import { RefreshCw } from "lucide-react"

export default function DashboardLoading() {
  return (
    <div className="flex h-full min-h-[400px] w-full items-center justify-center">
      <div className="text-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}
