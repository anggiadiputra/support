import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { RefreshCw, User } from "lucide-react"
import { Customer } from "../hooks/use-chat"

interface MessagesSidebarProps {
    customers: Customer[]
    selectedCustomer: Customer | null
    onSelectCustomer: (customer: Customer) => void
    loading: boolean
    onRefresh: () => void
    messages: any[]
    className?: string
}

export function MessagesSidebar({
    customers,
    selectedCustomer,
    onSelectCustomer,
    loading,
    onRefresh,
    messages,
    className
}: MessagesSidebarProps) {
    const getInitials = (name?: string, phone?: string) => {
        if (name) return name.substring(0, 2).toUpperCase()
        if (phone) return phone.substring(phone.length - 2)
        return "U"
    }

    return (
        <div className={`w-full md:w-[320px] border-r flex flex-col ${className}`}>
            {/* Sidebar Header */}
            <div className="p-4 border-b">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-lg font-semibold">Active Conversations</h3>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={onRefresh}
                        disabled={loading}
                        className="h-8 w-8 p-0"
                    >
                        <RefreshCw
                            className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                        />
                    </Button>
                </div>
                {customers.length > 0 && (
                    <div className="flex items-center justify-center bg-primary/10 text-primary rounded-full h-6 w-6 text-xs font-bold">
                        {customers.length}
                    </div>
                )}
            </div>

            {/* Search Bar */}
            <div className="p-3 border-b">
                <div className="relative">
                    <Input placeholder="Search..." className="pl-9" />
                    <svg
                        className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                        />
                    </svg>
                </div>
            </div>

            {/* Conversations List */}
            <ScrollArea className="flex-1">
                {customers.length === 0 ? (
                    <div className="p-12 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-muted mb-4">
                            <User className="h-8 w-8 text-muted-foreground" />
                        </div>
                        <p className="text-sm font-medium mb-1">No conversations yet</p>
                        <p className="text-xs text-muted-foreground">
                            Send a message to start chatting
                        </p>
                    </div>
                ) : (
                    customers.map((customer) => {
                        const lastMessage = messages
                            .filter((m) => m.customer?.id === customer.id)
                            .sort(
                                (a, b) =>
                                    new Date(b.timestamp).getTime() -
                                    new Date(a.timestamp).getTime()
                            )[0]

                        const isSelected = selectedCustomer?.id === customer.id
                        const hasUnread = false // TODO: Add unread count logic

                        return (
                            <button
                                key={customer.id}
                                onClick={() => onSelectCustomer(customer)}
                                className={`w-full p-4 flex items-start gap-3 transition-all duration-150 border-b ${isSelected
                                    ? "bg-accent border-l-4 border-l-primary"
                                    : "hover:bg-accent/50 border-l-4 border-l-transparent"
                                    }`}
                            >
                                <div className="relative">
                                    <Avatar className="h-12 w-12">
                                        <AvatarFallback>
                                            {getInitials(customer.name, customer.phoneNumber)}
                                        </AvatarFallback>
                                    </Avatar>
                                    {/* Online status indicator */}
                                    <div className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full"></div>
                                </div>

                                <div className="flex-1 min-w-0 text-left">
                                    <div className="flex items-center justify-between mb-1">
                                        <p
                                            className={`font-semibold truncate ${isSelected ? "text-primary" : "text-foreground"
                                                }`}
                                        >
                                            {customer.name || customer.phoneNumber}
                                        </p>
                                        {lastMessage && (
                                            <span
                                                className={`text-xs ${isSelected
                                                    ? "text-primary/80"
                                                    : "text-muted-foreground"
                                                    }`}
                                            >
                                                {new Date(lastMessage.timestamp).toLocaleTimeString(
                                                    [],
                                                    {
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    }
                                                )}
                                            </span>
                                        )}
                                    </div>

                                    <p className="text-xs text-muted-foreground mb-1">
                                        {customer.phoneNumber}
                                    </p>

                                    {lastMessage && (
                                        <div className="flex items-center justify-between">
                                            <p
                                                className={`text-sm truncate ${hasUnread
                                                    ? "font-medium text-foreground"
                                                    : "text-muted-foreground"
                                                    }`}
                                            >
                                                {lastMessage.direction === "OUTBOUND" && (
                                                    <span className="text-primary mr-1">✓</span>
                                                )}
                                                {lastMessage.content}
                                            </p>
                                            {hasUnread && (
                                                <span className="flex-shrink-0 ml-2 bg-primary text-primary-foreground text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                                                    3
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </button>
                        )
                    })
                )}
            </ScrollArea>
        </div>
    )
}
