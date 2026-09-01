"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { IconCopy, IconCheck } from "@tabler/icons-react"

interface CodeBlockProps {
  code: string
  language?: string
  showLineNumbers?: boolean
  className?: string
}

export function CodeBlock({
  code,
  language = "json",
  showLineNumbers = false,
  className,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className={cn("relative group", className)}>
      <pre
        className={cn(
          "bg-muted overflow-x-auto rounded-lg p-4 text-sm font-mono",
          showLineNumbers && "pl-12"
        )}
      >
        <code className="text-foreground">{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? (
          <IconCheck className="h-4 w-4 text-green-500" />
        ) : (
          <IconCopy className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
