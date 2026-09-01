"use client"

import { IGChatHeader } from "./ig-chat-header"
import { IGMessageList } from "./ig-message-list"
import { IGMessageInput } from "./ig-message-input"
import type { IGConversation, IGMessage } from "@/lib/api/instagram"

interface Props {
  conversation: IGConversation
  messages: IGMessage[]
  onSendMessage: (data: { type: "text" | "image" | "video" | "audio" | "sticker"; text?: string; mediaUrl?: string }) => Promise<boolean>
  onSendReaction: (messageId: string) => Promise<void>
  sending: boolean
  loadingMessages: boolean
  onBack: () => void
}

export function IGChatArea({
  conversation,
  messages,
  onSendMessage,
  onSendReaction,
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

      {/* Chat Header */}
      <div className="flex-shrink-0">
        <IGChatHeader conversation={conversation} onBack={onBack} />
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <IGMessageList
          messages={messages}
          loading={loadingMessages}
          onReact={onSendReaction}
        />
      </div>

      {/* Message Input */}
      <div className="flex-shrink-0 border-t bg-background">
        <IGMessageInput
          onSendMessage={onSendMessage}
          sending={sending}
          disabled={!conversation.isWindowActive}
        />
      </div>
    </div>
  )
}
