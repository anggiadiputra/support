"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { MessengerMessageList } from "./messenger-message-list"
import { MessengerMessageInput } from "./messenger-message-input"
import type { MessengerConversation, MessengerMessage } from "@/lib/api/messenger"

interface Props {
    conversation: MessengerConversation
    messages: MessengerMessage[]
    onSendMessage: (data: { type: "text" | "image" | "video" | "audio" | "file"; text?: string; mediaUrl?: string }) => Promise<boolean>
    sending: boolean
    loadingMessages: boolean
    onBack: () => void
}

export function MessengerChatArea({
    conversation,
    messages,
    onSendMessage,
    sending,
    loadingMessages,
    onBack,
}: Props) {
    return (
        <div className="flex flex-col h-full min-h-0">
            {/* Window Status Banner */}
            {!conversation.isWindowActive && (
                <div className="flex-shrink-0 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-2">
                    <p className="text-sm text-amber-800 dark:text-amber-200">
                        <span className="font-medium">⚠️ Messaging window closed.</span>{" "}
                        You can only reply within 24 hours of receiving a message from this user.
                    </p>
                </div>
            )}

            {/* Header */}
            <div className="flex-shrink-0 border-b p-4 flex items-center gap-3 bg-background">
                <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden"
                    onClick={onBack}
                >
                    <ChevronLeft className="h-5 w-5" />
                </Button>

                <Avatar className="h-10 w-10">
                    <AvatarImage src={conversation.participantProfilePic || ""} />
                    <AvatarFallback>{conversation.participantName?.charAt(0) || "M"}</AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-sm truncate">
                        {conversation.participantName || "Messenger User"}
                    </h3>
                    <p className="text-xs text-muted-foreground truncate">
                        {conversation.participantPsid}
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <MessengerMessageList messages={messages} loading={loadingMessages} />
            </div>

            {/* Input - Dedicated Messenger input component */}
            <div className="flex-shrink-0 border-t bg-background">
                <MessengerMessageInput
                    onSendMessage={onSendMessage}
                    sending={sending}
                    disabled={!conversation.isWindowActive}
                    conversationId={conversation.id}
                />
            </div>
        </div>
    )
}
