import * as React from "react"
import { IconEye, IconEyeOff } from "@tabler/icons-react"
import { cn } from "@/lib/utils"
import { Button } from "./ui/button"
import { Input } from "./ui/input"

type PasswordInputProps = Omit<
  React.ComponentProps<"input">,
  "type"
>

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, disabled, ...props }, ref) => {
    const [showPassword, setShowPassword] = React.useState(false)
    return (
      <div className="relative w-full">
        <Input
          type={showPassword ? "text" : "password"}
          className={cn("pr-10", className)}
          ref={ref}
          disabled={disabled}
          {...props}
        />
        <Button
          type="button"
          size="icon"
          variant="ghost"
          disabled={disabled}
          tabIndex={-1}
          className="text-muted-foreground absolute top-1/2 right-1 h-7 w-7 -translate-y-1/2 rounded-md hover:bg-transparent"
          onClick={() => setShowPassword((prev) => !prev)}
        >
          {showPassword ? <IconEye size={18} /> : <IconEyeOff size={18} />}
        </Button>
      </div>
    )
  }
)
PasswordInput.displayName = "PasswordInput"

export { PasswordInput }

