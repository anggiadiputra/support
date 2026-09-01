import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ArrowLeft } from "lucide-react"
import { Customer } from "../hooks/use-chat"

interface ChatHeaderProps {
    customer: Customer
    onBack: () => void
}

export function ChatHeader({ customer, onBack }: ChatHeaderProps) {
    const getInitials = (name?: string, phone?: string) => {
        if (name) return name.substring(0, 2).toUpperCase()
        if (phone) return phone.substring(phone.length - 2)
        return "U"
    }

    return (
        <div className="p-4 border-b flex items-center gap-3 bg-background">
            {/* Back button for mobile */}
            <Button
                variant="ghost"
                size="icon"
                className="md:hidden -ml-2"
                onClick={onBack}
            >
                <ArrowLeft className="h-5 w-5" />
            </Button>

            <Avatar className="h-10 w-10">
                <AvatarFallback>
                    {getInitials(customer.name, customer.phoneNumber)}
                </AvatarFallback>
            </Avatar>

            <div className="flex-1 min-w-0">
                <h3 className="font-semibold truncate">
                    {customer.name || customer.phoneNumber}
                </h3>
                <p className="text-xs text-muted-foreground">
                    {customer.phoneNumber}
                </p>
            </div>
        </div>
    )
}
