"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { Check, CheckCheck, AlertCircle, Clock, RotateCcw, Info } from "lucide-react"
import type { MessengerMessage } from "@/lib/api/messenger"
import { format } from "date-fns"
import { MediaPreview, MediaType } from "@/app/[locale]/(dashboard)/messages/components/media-preview"
import { WABAErrorDialog } from "@/components/waba/waba-error-dialog"

interface Props {
    message: MessengerMessage
    onRetry?: (message: MessengerMessage) => void
}

function getMediaType(messageType: string): MediaType | null {
    switch (messageType) {
        case "IMAGE":
            return "image"
        case "VIDEO":
            return "video"
        case "AUDIO":
            return "audio"
        case "FILE":
            return "document"
        default:
            return null
    }
}

export function MessengerMessageBubble({ message, onRetry }: Props) {
    const [showErrorDialog, setShowErrorDialog] = useState(false)
    const isOutbound = message.direction === "OUTBOUND"
    const isMedia = ["IMAGE", "VIDEO", "AUDIO", "FILE"].includes(message.messageType)
    const isSticker = message.messageType === "STICKER"
    const isPending = message.status === "PENDING"
    const isFailed = message.status === "FAILED"

    // Extract error code from errorMessage if present (e.g., "(#131031)")
    const extractErrorCode = (errorMsg: string | null | undefined): number | null => {
        if (!errorMsg) return null
        const match = errorMsg.match(/\(#(\d+)\)/)
        return match ? parseInt(match[1], 10) : null
    }
    const errorCode = extractErrorCode(message.errorMessage)

    const renderStatus = () => {
        if (!isOutbound) return null

        switch (message.status) {
            case "PENDING":
                return (
                    <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3 text-muted-foreground animate-pulse" />
                    </span>
                )
            case "SENT":
                return <Check className="h-3 w-3 text-muted-foreground" />
            case "DELIVERED":
                return <CheckCheck className="h-3 w-3 text-muted-foreground" />
            case "READ":
                return <CheckCheck className="h-3 w-3 text-blue-500" />
            case "FAILED":
                return (
                    <span className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 text-red-500" />
                    </span>
                )
            default:
                return null
        }
    }

    const renderContent = () => {
        if (isSticker && message.stickerUrl) {
            return (
                <div className="max-w-[120px]">
                    <img src={message.stickerUrl} alt="Sticker" className="w-full h-auto" />
                </div>
            )
        }

        if (isMedia && message.mediaUrl) {
            const mediaType = getMediaType(message.messageType)
            if (mediaType) {
                return (
                    <MediaPreview
                        mediaUrl={message.mediaUrl}
                        mediaType={mediaType}
                        caption={message.text || undefined}
                        isOutbound={isOutbound}
                    />
                )
            }
        }

        return <p className="whitespace-pre-wrap break-words break-all">{message.text}</p>
    }

    return (
        <div
            className={cn(
                "flex mb-3 group",
                isOutbound ? "justify-end" : "justify-start"
            )}
        >
            <div className="flex items-end gap-1 max-w-[75%]">
                <div
                    className={cn(
                        "px-4 py-2 rounded-2xl transition-opacity",
                        isOutbound
                            ? "bg-primary text-primary-foreground rounded-br-md"
                            : "bg-muted rounded-bl-md",
                        isSticker && "bg-transparent px-2 py-1",
                        isPending && "opacity-70",
                        isFailed && "bg-red-500/20 border border-red-500/50"
                    )}
                >
                    {renderContent()}

                    <div
                        className={cn(
                            "flex items-center gap-1 mt-1",
                            isOutbound ? "justify-end" : "justify-start"
                        )}
                    >
                        <span
                            className={cn(
                                "text-[10px]",
                                isOutbound ? "opacity-70" : "text-muted-foreground"
                            )}
                        >
                            {format(new Date(message.timestamp), "HH:mm")}
                        </span>
                        {renderStatus()}
                    </div>

                    {isFailed && (
                        <div className="mt-1 space-y-1">
                            {message.errorMessage && (
                                <p className="text-[10px] text-red-300">{message.errorMessage}</p>
                            )}
                            <div className="flex items-center gap-2">
                                <button
                                    onClick={() => setShowErrorDialog(true)}
                                    className="flex items-center gap-1 text-[10px] text-red-300 hover:text-red-200 transition-colors"
                                >
                                    <Info className="h-3 w-3" />
                                    Lihat Detail
                                </button>
                                {onRetry && (
                                    <button
                                        onClick={() => onRetry(message)}
                                        className="flex items-center gap-1 text-[10px] text-red-300 hover:text-red-200 transition-colors"
                                    >
                                        <RotateCcw className="h-3 w-3" />
                                        Coba Lagi
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <WABAErrorDialog
                open={showErrorDialog}
                onOpenChange={setShowErrorDialog}
                errorCode={errorCode}
                errorMessage={message.errorMessage}
            />
        </div>
    )
}
