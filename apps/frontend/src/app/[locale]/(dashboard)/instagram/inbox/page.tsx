"use client"

import { Header } from "@/components/layout/header"
import { RefreshCw, User } from "lucide-react"
import { IconBrandInstagram } from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Link } from "@/i18n/routing"
import { useInstagramChat } from "./hooks/use-instagram-chat"
import { IGConversationList, IGChatArea, IGEmptyState } from "./components"

export default function InstagramInboxPage() {
  const {
    conversations,
    messages,
    selectedConversation,
    setSelectedConversation,
    loading,
    loadingMessages,
    sending,
    searchQuery,
    setSearchQuery,
    loadConversations,
    sendMessage,
    sendReaction,
    searchConversations,
    userId,
    isLoadingAccount,
    isConnected,
    checkingConnection,
  } = useInstagramChat()

  // Show loading state while checking authentication or connection
  if (isLoadingAccount || checkingConnection) {
    return (
      <>
        <Header />
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </>
    )
  }

  // Show message if user is not authenticated
  if (!userId) {
    return (
      <>
        <Header />
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="text-center">
            <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2">
              Authentication Required
            </h3>
            <p className="text-sm text-muted-foreground">
              Please log in to access Instagram messages
            </p>
          </div>
        </div>
      </>
    )
  }

  // Show message if Instagram is not connected
  if (isConnected === false) {
    return (
      <>
        <Header />
        <div className="flex h-[calc(100vh-4rem)] items-center justify-center">
          <div className="text-center max-w-md px-4">
            <IconBrandInstagram className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2">
              Instagram Not Connected
            </h3>
            <p className="text-sm text-muted-foreground mb-6">
              Connect your Instagram Professional account to start managing your DMs
            </p>
            <Button asChild>
              <Link href="/instagram">
                Connect Instagram
              </Link>
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header />
      <div className="flex h-[calc(100vh-4rem)] bg-background">
        {/* Conversations Sidebar */}
        <IGConversationList
          conversations={conversations}
          selectedConversation={selectedConversation}
          onSelectConversation={setSelectedConversation}
          loading={loading}
          onRefresh={loadConversations}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          onSearch={searchConversations}
          className={selectedConversation ? "hidden md:flex" : "flex"}
        />

        {/* Chat Area */}
        {selectedConversation ? (
          <div className={`flex-1 flex flex-col bg-background h-full ${!selectedConversation ? "hidden md:flex" : "flex"}`}>
            <IGChatArea
              conversation={selectedConversation}
              messages={messages}
              onSendMessage={sendMessage}
              onSendReaction={sendReaction}
              sending={sending}
              loadingMessages={loadingMessages}
              onBack={() => setSelectedConversation(null as any)}
            />
          </div>
        ) : (
          <IGEmptyState />
        )}
      </div>
    </>
  )
}
