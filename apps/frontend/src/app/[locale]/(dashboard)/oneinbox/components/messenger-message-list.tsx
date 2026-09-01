"use client"

import { useRef, useEffect } from "react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { MessengerMessageBubble } from "./messenger-message-bubble"
import { RefreshCw } from "lucide-react"
import type { MessengerMessage } from "@/lib/api/messenger"

interface Props {
    messages: MessengerMessage[]
    loading: boolean
}

export function MessengerMessageList({ messages = [], loading }: Props) {
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const messageList = Array.isArray(messages) ? messages : []

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, [messageList])

    if (loading && messageList.length === 0) {
        return (
            <div className="flex items-center justify-center h-full">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (messageList.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-muted-foreground">
                <p className="text-sm">No messages yet</p>
            </div>
        )
    }

    const sortedMessages = [...messageList].sort(
        (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    )

    const groupedMessages: { [date: string]: MessengerMessage[] } = {}
    sortedMessages.forEach((message) => {
        const date = new Date(message.timestamp).toLocaleDateString()
        if (!groupedMessages[date]) {
            groupedMessages[date] = []
        }
        groupedMessages[date].push(message)
    })

    return (
        <ScrollArea className="h-full px-4 py-2">
            {Object.entries(groupedMessages).map(([date, dateMessages]) => (
                <div key={date}>
                    <div className="flex items-center justify-center my-4">
                        <div className="bg-muted px-3 py-1 rounded-full text-xs text-muted-foreground">
                            {date === new Date().toLocaleDateString() ? "Today" : date}
                        </div>
                    </div>

                    {dateMessages.map((message) => (
                        <MessengerMessageBubble
                            key={message.id}
                            message={message}
                        />
                    ))}
                </div>
            ))}
            <div ref={messagesEndRef} />
        </ScrollArea>
    )
}
