import { useState, useCallback } from "react"
import { ChatHeader } from "./chat-header"
import { MessageList } from "./message-list"
import { MessageInput } from "./message-input"
import { Customer } from "../hooks/use-chat"
import { useChatScroll } from "../hooks/use-chat-scroll"
import type { WindowStatus } from "@/lib/window-utils"
import type { Message } from "@/lib/api/messages-api"

interface ChatAreaProps {
    selectedCustomer: Customer
    messages: any[]
    currentUserId: string
    onSendMessage: (text: string, replyToWamId?: string) => Promise<any>
    onSendTemplate: (template: any) => Promise<any>
    onSendCta: (data: any) => Promise<any>
    onSendReplyButtons: (data: any) => Promise<any>
    onSendListMessage: (data: any) => Promise<any>
    onSendCarousel?: (data: any) => Promise<any>
    onSendMedia: (file: File, caption?: string) => Promise<any>
    onSendReaction?: (messageId: string, emoji: string) => Promise<any>
    sending: boolean
    uploading: boolean
    templates: any[]
    onBack: () => void
    windowStatus?: WindowStatus | null
    onRetryMessage?: (message: Message) => void
}

export function ChatArea({
    selectedCustomer,
    messages,
    currentUserId,
    onSendMessage,
    onSendTemplate,
    onSendCta,
    onSendReplyButtons,
    onSendListMessage,
    onSendCarousel,
    onSendMedia,
    onSendReaction,
    sending,
    uploading,
    templates,
    onBack,
    windowStatus,
    onRetryMessage
}: ChatAreaProps) {
    // State for reply-to-message
    const [replyToMessage, setReplyToMessage] = useState<Message | null>(null)

    // Filter messages for selected customer
    const filteredMessages = messages
        .filter((msg) => msg.customer?.id === selectedCustomer.id)
        .sort(
            (a, b) =>
                new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )

    // Use chat scroll hook
    const {
        messageContainerRef,
        handleScroll,
        messagesEndRef
    } = useChatScroll(filteredMessages, selectedCustomer)

    // Handle sending message with optional reply context
    const handleSendMessage = useCallback(async (text: string) => {
        const replyToWamId = replyToMessage?.wamId
        setReplyToMessage(null) // Clear reply state
        return onSendMessage(text, replyToWamId)
    }, [onSendMessage, replyToMessage])

    // Handle reply action from message list
    const handleReply = useCallback((message: Message) => {
        setReplyToMessage(message)
    }, [])

    // Handle cancel reply
    const handleCancelReply = useCallback(() => {
        setReplyToMessage(null)
    }, [])

    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Chat Header */}
            <div className="flex-shrink-0">
                <ChatHeader customer={selectedCustomer} onBack={onBack} />
            </div>

            {/* Messages Area - Takes remaining space */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <MessageList
                    messages={filteredMessages}
                    currentUserId={currentUserId}
                    scrollRef={messagesEndRef as any}
                    containerRef={messageContainerRef as any}
                    onScroll={handleScroll}
                    onRetry={onRetryMessage}
                    onReact={onSendReaction}
                    onReply={handleReply}
                />
            </div>

            {/* Message Input - Fixed at bottom */}
            <div className="flex-shrink-0 border-t bg-background w-full">
                <MessageInput
                    key={selectedCustomer.id}
                    onSendMessage={handleSendMessage}
                    onSendTemplate={onSendTemplate}
                    onSendCta={onSendCta}
                    onSendReplyButtons={onSendReplyButtons}
                    onSendListMessage={onSendListMessage}
                    onSendCarousel={onSendCarousel}
                    onSendMedia={onSendMedia}
                    sending={sending}
                    uploading={uploading}
                    templates={templates}
                    windowStatus={windowStatus}
                    customerId={selectedCustomer.id}
                    customerName={selectedCustomer.name}
                    customerPhone={selectedCustomer.phoneNumber}
                    replyToMessage={replyToMessage}
                    onCancelReply={handleCancelReply}
                />
            </div>
        </div>
    )
}
