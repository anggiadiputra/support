"use client"

import { cn } from "@/lib/utils"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { IconInfoCircle } from "@tabler/icons-react"

interface DocsSectionProps {
  id: string
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}

export function DocsSection({
  id,
  title,
  description,
  children,
  className,
}: DocsSectionProps) {
  return (
    <section
      id={id}
      className={cn("scroll-mt-6 py-8 first:pt-0", className)}
    >
      <div className="mb-6">
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="text-muted-foreground mt-2">{description}</p>
        )}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  )
}

interface DocsTipProps {
  children: React.ReactNode
  variant?: "info" | "warning" | "success"
}

export function DocsTip({ children, variant = "info" }: DocsTipProps) {
  return (
    <Alert
      className={cn(
        variant === "info" && "border-blue-500/20 bg-blue-500/5",
        variant === "warning" && "border-amber-500/20 bg-amber-500/5",
        variant === "success" && "border-green-500/20 bg-green-500/5"
      )}
    >
      <IconInfoCircle className="h-4 w-4" />
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  )
}

interface DocsSubsectionProps {
  title: string
  children: React.ReactNode
}

export function DocsSubsection({ title, children }: DocsSubsectionProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children}
    </div>
  )
}
