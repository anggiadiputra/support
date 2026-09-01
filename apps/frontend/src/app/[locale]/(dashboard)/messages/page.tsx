"use client"

import { useCallback } from "react"
import { Header } from "@/components/layout/header"
import { RefreshCw, User } from "lucide-react"
import { useChat } from "./hooks/use-chat"
import { MessagesSidebar } from "./components/messages-sidebar"
import { ChatArea } from "./components/chat-area"
import { EmptyState } from "./components/empty-state"

export default function MessagesPage() {
    const {
        messages,
        customers,
        selectedCustomer,
        setSelectedCustomer,
        loading,
        sending,
        uploading,
        templates,
        windowStatus,
        setWindowStatus,
        loadMessages,
        sendMessage,
        sendTemplate: originalSendTemplate,
        sendCta,
        sendReplyButtons,
        sendListMessage,
        sendMedia,
        userId,
        isLoadingAccount
    } = useChat()

    // Wrapper to ensure components are built from variableValues
    const sendTemplate = useCallback(async (template: any) => {
        // If template already has components, use them directly
        if (template.components && template.components.length > 0) {
            return originalSendTemplate(template)
        }
        
        // If template has variableValues but no components, build them
        if (template.variableValues && Object.keys(template.variableValues).length > 0) {
            const content = template.content || template.bodyText || ''
            const matches = content.match(/\{\{(\d+)\}\}/g) || []
            const varNumbers: string[] = [...new Set(matches.map((m: string) => m.replace(/[{}]/g, '')))] as string[]
            
            if (varNumbers.length > 0) {
                // Sort by variable number to ensure correct order
                const sortedVars = [...varNumbers].sort((a, b) => parseInt(a) - parseInt(b))
                
                // Build ALL parameters - don't filter out empty ones
                const bodyParameters = sortedVars.map((v) => ({
                    type: "text",
                    text: template.variableValues[v]?.trim() || ''
                }))
                
                if (bodyParameters.length > 0) {
                    template.components = [{
                        type: "body",
                        parameters: bodyParameters
                    }]
                }
            }
        }
        
        return originalSendTemplate(template)
    }, [originalSendTemplate])

    // Show loading state while checking authentication
    if (isLoadingAccount) {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                <Header />
                <div className="flex flex-1 items-center justify-center">
                    <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
            </div>
        )
    }

    // Show message if user is not authenticated
    if (!userId) {
        return (
            <div className="flex flex-col h-full overflow-hidden">
                <Header />
                <div className="flex flex-1 items-center justify-center">
                    <div className="text-center">
                        <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
                        <h3 className="text-lg font-semibold mb-2">
                            Authentication Required
                        </h3>
                        <p className="text-sm text-muted-foreground">
                            Please log in to access messages
                        </p>
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <Header />
            <div className="flex flex-1 bg-background overflow-hidden min-h-0">
                {/* Customers Sidebar - Hidden on mobile if chat is open */}
                <MessagesSidebar
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onSelectCustomer={setSelectedCustomer}
                    loading={loading}
                    onRefresh={loadMessages}
                    messages={messages}
                    className={selectedCustomer ? "hidden md:flex" : "flex"}
                />

                {/* Chat Area - Hidden on mobile if no customer selected */}
                {selectedCustomer ? (
                    <div className={`flex-1 flex flex-col bg-background overflow-hidden min-h-0 ${!selectedCustomer ? "hidden md:flex" : "flex"}`}>
                        <ChatArea
                            selectedCustomer={selectedCustomer}
                            messages={messages}
                            currentUserId={userId}
                            onSendMessage={sendMessage}
                            onSendTemplate={sendTemplate}
                            onSendCta={sendCta}
                            onSendReplyButtons={sendReplyButtons}
                            onSendListMessage={sendListMessage}
                            onSendMedia={sendMedia}
                            sending={sending}
                            uploading={uploading}
                            templates={templates}
                            onBack={() => setSelectedCustomer(null)}
                            windowStatus={windowStatus}
                        />
                    </div>
                ) : (
                    <EmptyState />
                )}
            </div>
        </div>
    )
}
