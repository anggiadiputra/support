"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { IconEye, IconEyeOff } from "@tabler/icons-react"

export interface SensitiveInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Whether the value is currently masked (from API response) */
  isMasked?: boolean
}

/**
 * SensitiveInput component for displaying and editing sensitive values
 * like API keys, secrets, and passwords.
 * 
 * Features:
 * - Toggle button to reveal/hide value
 * - Support for password type switching
 * - Masked value display (e.g., "••••••••abc1")
 * 
 * Requirements: 1.3, 2.3
 */
const SensitiveInput = React.forwardRef<HTMLInputElement, SensitiveInputProps>(
  ({ className, isMasked, disabled, ...props }, ref) => {
    const [showValue, setShowValue] = React.useState(false)

    const toggleVisibility = () => {
      setShowValue((prev) => !prev)
    }

    return (
      <div className="relative">
        <input
          type={showValue ? "text" : "password"}
          className={cn(
            "border-input file:text-foreground placeholder:text-muted-foreground focus-visible:ring-ring flex h-9 w-full rounded-md border bg-transparent px-3 py-1 pr-10 text-base shadow-xs transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:ring-1 focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
            isMasked && "font-mono",
            className
          )}
          ref={ref}
          disabled={disabled}
          {...props}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
          onClick={toggleVisibility}
          disabled={disabled}
          tabIndex={-1}
        >
          {showValue ? (
            <IconEyeOff className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          ) : (
            <IconEye className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className="sr-only">
            {showValue ? "Hide value" : "Show value"}
          </span>
        </Button>
      </div>
    )
  }
)
SensitiveInput.displayName = "SensitiveInput"

export { SensitiveInput }
