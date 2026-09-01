"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { CodeBlock } from "./code-block"

interface CodeExample {
  language: string
  label: string
  code: string
}

interface CodeTabsProps {
  examples: CodeExample[]
  className?: string
}

export function CodeTabs({ examples, className }: CodeTabsProps) {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className={cn("rounded-lg border overflow-hidden", className)}>
      {/* Tab Headers */}
      <div className="flex border-b bg-muted/50">
        {examples.map((example, index) => (
          <button
            key={index}
            onClick={() => setActiveTab(index)}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors",
              activeTab === index
                ? "bg-background text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {example.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="p-0">
        <CodeBlock
          code={examples[activeTab].code}
          language={examples[activeTab].language}
          className="rounded-none border-0"
        />
      </div>
    </div>
  )
}
