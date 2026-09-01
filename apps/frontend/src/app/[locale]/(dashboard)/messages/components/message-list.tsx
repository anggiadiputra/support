import { RefObject, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Check, CheckCheck, AlertCircle, Clock, Bot, Smartphone, RotateCcw, Info, Lightbulb } from "lucide-react"
import { MediaPreview, MediaType } from "./media-preview"
import { cn } from "@/lib/utils"
import type { Message, MessageSource } from "@/lib/api/messages-api"
import { WABAErrorDialog } from "@/components/waba/waba-error-dialog"
import { getErrorInfo, type WhatsAppErrorInfo } from "../../broadcast/utils/error-categorizer"
import { MessageHoverActions } from "./message-hover-actions"

interface MessageListProps {
    messages: any[]
    currentUserId: string
    scrollRef: RefObject<HTMLDivElement>
    containerRef: RefObject<HTMLDivElement>
    onScroll: () => void
    onRetry?: (message: Message) => void
    /** Send reaction to a message (messageId, emoji) */
    onReact?: (messageId: string, emoji: string) => Promise<any>
    /** Start replying to a specific message */
    onReply?: (message: Message) => void
}

// Helper to extract media URL from message - handles both stored URLs and media IDs
function getMediaUrl(msg: any, messageType: string): string | null {
    // First check if mediaUrl is stored in the message (from webhook download)
    if (msg.mediaUrl) {
        return msg.mediaUrl
    }

    // Fallback to type-specific fields
    switch (messageType) {
        case "image":
            return msg.image?.link || msg.image?.id || null
        case "video":
            return msg.video?.link || msg.video?.id || null
        case "audio":
            return msg.audio?.link || msg.audio?.id || null
        case "document":
            return msg.document?.link || msg.document?.id || null
        case "sticker":
            return msg.sticker?.id || msg.sticker?.png_url || null
        default:
            return null
    }
}

// Helper to get caption from message
function getCaption(msg: any, messageType: string): string | undefined {
    switch (messageType) {
        case "image":
            return msg.image?.caption || msg.content
        case "video":
            return msg.video?.caption || msg.content
        case "audio":
            return msg.audio?.caption || msg.content
        case "document":
            return msg.document?.caption || msg.content
        default:
            return undefined
    }
}

// Helper to get filename for documents
function getFilename(msg: any): string | undefined {
    return msg.document?.filename
}

// Helper to find the message that was reacted to
// Reaction messages store the original message's wamId in mediaUrl field
function findReactedMessage(reactionMsg: any, allMessages: any[]): any | null {
    const reactedWamId = reactionMsg.mediaUrl
    if (!reactedWamId) return null

    return allMessages.find(m => m.wamId === reactedWamId) || null
}

// Helper to get preview text from any message type
function getMessagePreview(msg: any): string {
    const messageType = msg.messageType?.toLowerCase() || msg.type?.toLowerCase()
    const content = msg.content

    switch (messageType) {
        case "text":
            return content || "Text message"
        case "image":
            return content || "📷 Image"
        case "video":
            return content || "🎥 Video"
        case "audio":
            return "🎵 Audio"
        case "document":
            return content || "📄 Document"
        case "template":
            return content || "Template message"
        case "interactive":
            return content || "Interactive message"
        case "sticker":
            return "🎨 Sticker"
        case "location":
            return content || "📍 Location"
        case "contacts":
            return "👤 Contact"
        case "reaction":
            return msg.content ? `${msg.content} reaction` : "Reaction"
        default:
            return content || "Message"
    }
}

// Truncate text to max length
function truncateText(text: string, maxLength: number = 50): string {
    if (!text || text.length <= maxLength) return text
    return text.substring(0, maxLength) + "..."
}

export function MessageList({
    messages,
    currentUserId,
    scrollRef,
    containerRef,
    onScroll,
    onRetry,
    onReact,
    onReply
}: MessageListProps) {
    const tErrors = useTranslations("whatsappErrors")
    const [errorDialogOpen, setErrorDialogOpen] = useState(false)
    const [selectedErrorMessage, setSelectedErrorMessage] = useState<any>(null)

    // Extract error code from errorMessage if present (e.g., "(#131031)")
    const extractErrorCode = (errorMsg: string | null | undefined): number | null => {
        if (!errorMsg) return null
        const match = errorMsg.match(/\(#(\d+)\)/)
        return match ? parseInt(match[1], 10) : null
    }

    // Get structured error info for display in chat bubble
    const getStructuredErrorInfo = (errorMessage: string | null | undefined, errorCode?: string | null): WhatsAppErrorInfo => {
        return getErrorInfo(errorMessage || '', errorCode || undefined, tErrors)
    }

    return (
        <div
            className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 bg-slate-50 dark:bg-background/50"
            ref={containerRef}
            onScroll={onScroll}
        >
            {messages.map((msg) => {
                const isOutbound = (msg.direction || msg.messageDirection)?.toUpperCase() === "OUTBOUND"
                const messageType = msg.messageType?.toLowerCase() || msg.type?.toLowerCase()
                const isMediaType = ["image", "video", "audio", "document"].includes(messageType)
                const isSticker = messageType === "sticker"
                const rawStatus = (msg.status || msg.messageStatus || msg.deliveryStatus || msg.waStatus || msg.message_status || "").toString().toUpperCase()
                const status = rawStatus || "SENT"
                const statusLower = status.toLowerCase()
                const isRead = status === "READ" || statusLower === "read"
                const isDelivered = status === "DELIVERED" || statusLower === "delivered"
                const isPending = status === "PENDING"
                const isFailed = status === "FAILED"

                // Message source for outbound messages
                const source = (msg.source as MessageSource) || "API"
                const isFromAI = source === "AI_BOT"
                const isFromWhatsAppApp = source === "WHATSAPP_APP"

                // Determine background color based on source (only for outbound, non-sticker messages)
                const getOutboundBgColor = () => {
                    if (isFailed) return "bg-red-500/80 border-red-500"
                    if (isFromAI) return "bg-violet-500 text-white rounded-tr-none"
                    if (isFromWhatsAppApp) return "bg-teal-500 text-white rounded-tr-none"
                    return "bg-blue-500 text-white rounded-tr-none" // Default: Human from Inbox
                }

                // Handler for reaction
                const handleReact = (emoji: string) => {
                    if (onReact && msg.id) {
                        onReact(msg.id, emoji)
                    }
                }

                // Handler for reply
                const handleReply = () => {
                    if (onReply) {
                        onReply(msg as Message)
                    }
                }

                // Check if message has wamId (can be reacted to / replied to)
                const canInteract = !!msg.wamId && !isFailed && !isPending

                return (
                    <div
                        key={msg.id}
                        className={`flex ${isOutbound ? "justify-end" : "justify-start"}`}
                    >
                        {/* Message wrapper with hover actions */}
                        <div className="relative group max-w-[85%] sm:max-w-[70%]">
                            {/* Hover Actions - only show if reaction/reply is available */}
                            {canInteract && (onReact || onReply) && (
                                <MessageHoverActions
                                    onReact={handleReact}
                                    onReply={handleReply}
                                    isOutbound={isOutbound}
                                    disabled={!canInteract}
                                />
                            )}

                        <div
                            className={cn(
                                "shadow-sm transition-opacity",
                                // Stickers have minimal styling - transparent background, smaller padding
                                isSticker
                                    ? "bg-transparent p-1 max-w-[150px]"
                                    : "px-4 py-3 rounded-2xl",
                                !isSticker && isOutbound
                                    ? getOutboundBgColor()
                                    : "",
                                !isSticker && !isOutbound
                                    ? "bg-white dark:bg-gray-800 border rounded-tl-none text-gray-900 dark:text-gray-100"
                                    : "",
                                isPending && "opacity-70"
                            )}
                        >
                            {/* Text Message */}
                            {messageType === "text" && (
                                <p className="text-sm whitespace-pre-wrap break-words break-all leading-relaxed">
                                    {msg.content || "No content"}
                                </p>
                            )}

                            {/* Template Message */}
                            {messageType === "template" && (
                                <div className="space-y-2">
                                    {/* Template name badge */}
                                    {(msg.template?.name || msg.template?.templateName) && (
                                        <div className={`flex items-center gap-1.5 text-xs font-medium ${isOutbound ? "text-white/70" : "text-gray-500 dark:text-gray-400"
                                            }`}>
                                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                            </svg>
                                            <span className="uppercase tracking-wider">
                                                {msg.template?.name || msg.template?.templateName}
                                            </span>
                                        </div>
                                    )}
                                    {/* Template header (text only for now) */}
                                    {msg.template?.headerContent && msg.template?.headerType === "TEXT" && (
                                        <p className={`text-sm font-semibold ${isOutbound ? "text-white" : "text-gray-900 dark:text-gray-100"}`}>
                                            {msg.template.headerContent}
                                        </p>
                                    )}
                                    {/* Template header (image) */}
                                    {msg.template?.headerContent && msg.template?.headerType === "IMAGE" && (
                                        <div className="rounded-lg overflow-hidden max-w-[200px]">
                                            <img src={msg.template.headerContent} alt="Template header" className="w-full h-auto" />
                                        </div>
                                    )}
                                    {/* Template body */}
                                    <p className="text-sm whitespace-pre-wrap break-words break-all leading-relaxed">
                                        {msg.content || "Template message"}
                                    </p>
                                    {/* Template footer */}
                                    {msg.template?.footerContent && (
                                        <p className={`text-xs ${isOutbound ? "text-white/60" : "text-gray-400 dark:text-gray-500"}`}>
                                            {msg.template.footerContent}
                                        </p>
                                    )}
                                    {/* Template buttons */}
                                    {msg.template?.buttons && Array.isArray(msg.template.buttons) && msg.template.buttons.length > 0 && (
                                        <div className="flex flex-wrap gap-2 pt-1 border-t border-white/20">
                                            {msg.template.buttons.map((btn: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5",
                                                        isOutbound
                                                            ? "bg-white/20 text-white border border-white/30"
                                                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                                                    )}
                                                >
                                                    {btn.type === "URL" && (
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                        </svg>
                                                    )}
                                                    {btn.type === "PHONE_NUMBER" && (
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                                                        </svg>
                                                    )}
                                                    {btn.type === "QUICK_REPLY" && (
                                                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                                                        </svg>
                                                    )}
                                                    {btn.text || btn.title || "Button"}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Media Messages - Image, Video, Audio, Document */}
                            {isMediaType && (
                                <MediaPreview
                                    mediaUrl={getMediaUrl(msg, messageType)}
                                    mediaType={messageType as MediaType}
                                    caption={getCaption(msg, messageType)}
                                    filename={getFilename(msg)}
                                    isOutbound={isOutbound}
                                />
                            )}

                            {/* Sticker Message */}
                            {isSticker && (
                                <div className="flex items-center justify-center">
                                    {msg.mediaUrl ? (
                                        <img
                                            src={msg.mediaUrl}
                                            alt="Sticker"
                                            className="max-w-full h-auto rounded-lg"
                                        />
                                    ) : (
                                        <span className="text-4xl">🎨</span>
                                    )}
                                </div>
                            )}

                            {/* Interactive Message */}
                            {messageType === "interactive" && (
                                <div className="space-y-2">
                                    {/* Interactive header (if present) */}
                                    {msg.interactive?.header?.type === "text" && msg.interactive?.header?.text && (
                                        <p className={`text-sm font-semibold ${isOutbound ? "text-white" : "text-gray-900 dark:text-gray-100"}`}>
                                            {msg.interactive.header.text}
                                        </p>
                                    )}
                                    {msg.interactive?.header?.type === "image" && msg.interactive?.header?.image?.link && (
                                        <div className="rounded-lg overflow-hidden max-w-[200px]">
                                            <img src={msg.interactive.header.image.link} alt="Interactive header" className="w-full h-auto" />
                                        </div>
                                    )}
                                    {/* Interactive body */}
                                    <div className="text-sm whitespace-pre-wrap break-words break-all">
                                        {msg.interactive?.body?.text || msg.content || "Interactive message"}
                                    </div>
                                    {/* Interactive footer */}
                                    {msg.interactive?.footer?.text && (
                                        <p className={`text-xs ${isOutbound ? "text-white/60" : "text-gray-400 dark:text-gray-500"}`}>
                                            {msg.interactive.footer.text}
                                        </p>
                                    )}
                                    {/* CTA URL Button */}
                                    {msg.interactive?.type === "cta_url" && msg.interactive?.action?.parameters && (
                                        <div className="pt-1 border-t border-white/20">
                                            <a
                                                href={msg.interactive.action.parameters.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className={cn(
                                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                                                    isOutbound
                                                        ? "bg-white/20 text-white border border-white/30 hover:bg-white/30"
                                                        : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                                                )}
                                            >
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                </svg>
                                                {msg.interactive.action.parameters.display_text}
                                            </a>
                                        </div>
                                    )}
                                    {/* Reply Buttons */}
                                    {msg.interactive?.type === "button" && msg.interactive?.action?.buttons && (
                                        <div className="flex flex-wrap gap-2 pt-1 border-t border-white/20">
                                            {msg.interactive.action.buttons.map((btn: any, i: number) => (
                                                <div
                                                    key={i}
                                                    className={cn(
                                                        "px-3 py-1.5 rounded-lg text-xs font-medium",
                                                        isOutbound
                                                            ? "bg-white/20 text-white border border-white/30"
                                                            : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                                                    )}
                                                >
                                                    {btn.reply?.title}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                    {/* List Message */}
                                    {msg.interactive?.type === "list" && msg.interactive?.action?.sections && (
                                        <div className="pt-1 border-t border-white/20 space-y-2">
                                            {/* List button */}
                                            <div className={cn(
                                                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                                                isOutbound
                                                    ? "bg-white/20 text-white border border-white/30"
                                                    : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                                            )}>
                                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                                                </svg>
                                                {msg.interactive.action.button || "View Options"}
                                            </div>
                                            {/* List sections preview */}
                                            <div className={`text-xs space-y-1 ${isOutbound ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
                                                {msg.interactive.action.sections.map((section: any, i: number) => (
                                                    <div key={i}>
                                                        {section.title && <span className="font-medium">{section.title}: </span>}
                                                        <span>{section.rows?.map((r: any) => r.title).join(", ")}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {msg.interactive?.type === "carousel" && msg.interactive?.action?.cards && (
                                        <div className="space-y-3 pt-1 border-t border-white/20">
                                            {msg.interactive.action.cards.map((card: any, index: number) => {
                                                const cardMediaUrl = card.header?.type === "image"
                                                    ? card.header?.image?.link || card.header?.image?.id
                                                    : card.header?.video?.link || card.header?.video?.id
                                                const hasUrlAction = card.action?.name === "cta_url" && card.action?.parameters
                                                const quickReplyButtons = Array.isArray(card.action?.buttons) ? card.action.buttons : []

                                                return (
                                                    <div
                                                        key={card.card_index ?? index}
                                                        className={cn(
                                                            "space-y-2 rounded-xl border p-3",
                                                            isOutbound
                                                                ? "border-white/20 bg-white/10"
                                                                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "text-[11px] font-semibold uppercase tracking-wide",
                                                            isOutbound ? "text-white/70" : "text-gray-500 dark:text-gray-400"
                                                        )}>
                                                            Card {(card.card_index ?? index) + 1}
                                                        </div>

                                                        {cardMediaUrl && (
                                                            <MediaPreview
                                                                mediaUrl={cardMediaUrl}
                                                                mediaType={(card.header?.type === "video" ? "video" : "image") as MediaType}
                                                                isOutbound={isOutbound}
                                                            />
                                                        )}

                                                        {card.body?.text && (
                                                            <p className="text-sm whitespace-pre-wrap break-words break-all leading-relaxed">
                                                                {card.body.text}
                                                            </p>
                                                        )}

                                                        {hasUrlAction && (
                                                            <div>
                                                                <a
                                                                    href={card.action.parameters.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className={cn(
                                                                        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium",
                                                                        isOutbound
                                                                            ? "bg-white/20 text-white border border-white/30 hover:bg-white/30"
                                                                            : "bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 hover:bg-blue-100"
                                                                    )}
                                                                >
                                                                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                                                    </svg>
                                                                    {card.action.parameters.display_text}
                                                                </a>
                                                            </div>
                                                        )}

                                                        {quickReplyButtons.length > 0 && (
                                                            <div className="flex flex-wrap gap-2">
                                                                {quickReplyButtons.map((button: any, buttonIndex: number) => (
                                                                    <div
                                                                        key={button.quick_reply?.id || buttonIndex}
                                                                        className={cn(
                                                                            "px-3 py-1.5 rounded-lg text-xs font-medium",
                                                                            isOutbound
                                                                                ? "bg-white/20 text-white border border-white/30"
                                                                                : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 border border-gray-200 dark:border-gray-600"
                                                                        )}
                                                                    >
                                                                        {button.quick_reply?.title}
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Reaction Message */}
                            {messageType === "reaction" && (() => {
                                const reactedMsg = findReactedMessage(msg, messages)
                                const preview = reactedMsg ? getMessagePreview(reactedMsg) : null

                                return (
                                    <div className="space-y-2">
                                        {/* Quoted message preview */}
                                        {reactedMsg && (
                                            <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-sm ${
                                                    isOutbound
                                                        ? "bg-white/10 border-l-2 border-white/30"
                                                        : "bg-gray-100 dark:bg-gray-700 border-l-2 border-gray-300 dark:border-gray-500"
                                                }`}>
                                                {/* Vertical quote line */}
                                                <div className={`flex-1 ${isOutbound ? "text-white/80" : "text-gray-600 dark:text-gray-300"}`}>
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <span className="text-xs font-medium uppercase tracking-wide">
                                                            {reactedMsg.direction === "OUTBOUND" ? "You" : reactedMsg.customer?.name || "Customer"}
                                                        </span>
                                                        <span className="text-xs opacity-60">
                                                            {new Date(reactedMsg.timestamp).toLocaleTimeString([], {
                                                                hour: "2-digit",
                                                                minute: "2-digit"
                                                            })}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs line-clamp-2">
                                                        {truncateText(preview || "Message", 80)}
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {/* Reaction emoji + label */}
                                        <div className="flex items-center gap-2">
                                            <span className="text-2xl">{msg.content || "👍"}</span>
                                            <span className={`text-xs ${isOutbound ? "text-white/70" : "text-gray-500 dark:text-gray-400"}`}>
                                                {reactedMsg ? "reacted to this message" : "Reacted to a message"}
                                            </span>
                                        </div>
                                    </div>
                                )
                            })()}

                            {/* Metadata & Status */}
                            <div
                                className={`flex items-center justify-end gap-1 mt-1.5 ${isOutbound
                                    ? "text-white/70"
                                    : "text-gray-500 dark:text-gray-400"
                                    }`}
                            >
                                {/* Source indicator icon for outbound messages */}
                                {isOutbound && isFromAI && (
                                    <span title="Sent by AI Bot">
                                        <Bot className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    </span>
                                )}
                                {isOutbound && isFromWhatsAppApp && (
                                    <span title="Sent from WhatsApp App">
                                        <Smartphone className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                                    </span>
                                )}
                                <span className="text-[10px] sm:text-xs">
                                    {new Date(msg.timestamp).toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                                {isOutbound && (
                                    <span className="ml-0.5">
                                        {status === "PENDING" ? (
                                            <Clock className="h-3 w-3 sm:h-3.5 sm:w-3.5 animate-pulse" />
                                        ) : status === "FAILED" ? (
                                            <AlertCircle className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-red-200" />
                                        ) : isRead ? (
                                            <CheckCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-green-500" />
                                        ) : isDelivered ? (
                                            <CheckCheck className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/40" />
                                        ) : (
                                            <Check className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-white/40" />
                                        )}
                                    </span>
                                )}
                            </div>

                            {/* Failed message actions - Enhanced Error Display */}
                            {isFailed && (() => {
                                const errorInfo = getStructuredErrorInfo(msg.errorMessage, msg.errorCode)
                                return (
                                    <div className="mt-3 space-y-2 border-t border-red-400/30 pt-2">
                                        {/* Error Code Badge */}
                                        {errorInfo.code && (
                                            <div className="flex items-center gap-2">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-red-700/50 text-red-100 border border-red-400/30">
                                                    Error {errorInfo.code}
                                                </span>
                                            </div>
                                        )}

                                        {/* User-friendly Indonesian error message */}
                                        <p className="text-xs text-red-100 font-medium">
                                            {errorInfo.message}
                                        </p>

                                        {/* Recovery action suggestion */}
                                        <div className="flex items-start gap-1.5 text-[11px] text-red-200/90 bg-red-700/30 rounded px-2 py-1.5">
                                            <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                                            <span><strong>Saran:</strong> {errorInfo.recoveryAction}</span>
                                        </div>

                                        {/* Action buttons */}
                                        <div className="flex items-center gap-2 pt-1">
                                            <button
                                                onClick={() => {
                                                    setSelectedErrorMessage(msg)
                                                    setErrorDialogOpen(true)
                                                }}
                                                className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
                                            >
                                                <Info className="h-3 w-3" />
                                                Lihat Detail
                                            </button>
                                            {onRetry && (
                                                <button
                                                    onClick={() => onRetry(msg)}
                                                    className="flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
                                                >
                                                    <RotateCcw className="h-3 w-3" />
                                                    Coba Lagi
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                )
                            })()}
                        </div>
                        </div>
                    </div>
                )
            })}
            <div ref={scrollRef} />

            {/* Error Dialog */}
            <WABAErrorDialog
                open={errorDialogOpen}
                onOpenChange={setErrorDialogOpen}
                errorCode={extractErrorCode(selectedErrorMessage?.errorMessage)}
                errorMessage={selectedErrorMessage?.errorMessage}
            />
        </div>
    )
}
