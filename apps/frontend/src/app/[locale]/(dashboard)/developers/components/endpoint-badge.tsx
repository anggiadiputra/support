import { cn } from "@/lib/utils"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

interface EndpointBadgeProps {
  method: HttpMethod
  path: string
  className?: string
}

const methodColors: Record<HttpMethod, string> = {
  GET: "bg-blue-500/10 text-blue-600 border-blue-500/20",
  POST: "bg-green-500/10 text-green-600 border-green-500/20",
  PUT: "bg-amber-500/10 text-amber-600 border-amber-500/20",
  PATCH: "bg-orange-500/10 text-orange-600 border-orange-500/20",
  DELETE: "bg-red-500/10 text-red-600 border-red-500/20",
}

export function EndpointBadge({ method, path, className }: EndpointBadgeProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-mono text-sm",
        "bg-muted/50",
        className
      )}
    >
      <span
        className={cn(
          "rounded px-2 py-0.5 text-xs font-bold uppercase",
          methodColors[method]
        )}
      >
        {method}
      </span>
      <span className="text-foreground">{path}</span>
    </div>
  )
}

export type { HttpMethod }
