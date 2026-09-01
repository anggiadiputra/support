"use client"

import { useState, useEffect, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Header } from "@/components/layout/header"
import { RefreshCw, User, PanelRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { VisuallyHidden } from "@radix-ui/react-visually-hidden"
import { useUnifiedInbox } from "./hooks/use-unified-inbox"
import { UnifiedConversationList } from "./components/unified-conversation-list"
import { UnifiedEmptyState } from "./components/unified-empty-state"
import { ConnectionStatusBanner } from "./components/connection-status-banner"
import { ConnectionStatus } from "./components/connection-status"
import { CustomerProfilePanel } from "./components/customer-profile-panel"
import { ChatArea } from "../messages/components/chat-area"
import { IGChatArea } from "../instagram/inbox/components"
import { MessengerChatArea } from "./components/messenger-chat-area"
import type { Customer } from "../messages/hooks/use-chat"
import type { IGConversation } from "@/lib/api/instagram"
import type { AssignableUser } from "./types/unified-inbox"
import { cn, normalizePhoneNumber } from "@/lib/utils"
import { useBottomNav } from "@/components/layout/bottom-nav-context"

// Custom hook to detect screen size
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const media = window.matchMedia(query)
    if (media.matches !== matches) {
      setMatches(media.matches)
    }
    const listener = () => setMatches(media.matches)
    media.addEventListener("change", listener)
    return () => media.removeEventListener("change", listener)
  }, [matches, query])

  return matches
}

export default function OneInboxPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const phoneParam = searchParams.get("phone")
  const conversationParam = searchParams.get("conversation")
  const typeParam = searchParams.get("type") // whatsapp, instagram, messenger
  
  const {
    filteredConversations,
    conversations,
    selectedConversation,
    selectConversation,
    channelFilter,
    setChannelFilter,
    searchQuery,
    setSearchQuery,
    // New filter state
    readStatusFilter,
    setReadStatusFilter,
    tagsFilter,
    setTagsFilter,
    pipelineFilter,
    setPipelineFilter,
    // Account filter state
    accountFilter,
    setAccountFilter,
    instagramAccounts,
    facebookPages,
    whatsappPhoneNumbers,
    clearFilters,
    // Assignment filter state (Requirements: 5.1)
    assignmentFilter,
    setAssignmentFilter,
    assignableUsers,
    loadAssignableUsers,
    // AI status state (Requirements: 5.1, 5.2, 5.3, 5.4)
    aiEnabled,
    defaultAIAgentName,
    // Assignment methods (Requirements: 6.1, 6.2, 6.3, 6.4)
    assignConversation,
    unassignConversation,
    // CRM data for filter dropdowns
    availableTags,
    pipelineStages,
    loading,
    sending,
    uploading,
    whatsappConnected,
    instagramConnected,
    waMessages,
    waTemplates,
    waWindowStatus,
    sendWhatsAppMessage,
    sendWhatsAppTemplate,
    sendWhatsAppMedia,
    sendWhatsAppCta,
    sendWhatsAppReplyButtons,
    sendWhatsAppListMessage,
    sendWhatsAppCarousel,
    retryWhatsAppMessage,
    sendWhatsAppReaction,
    igMessages,
    sendInstagramMessage,
    sendInstagramReaction,
    msgMessages,
    sendMessengerMessage,
    userId,
    isLoadingAccount,
    loadConversations,
    // Customer panel state
    isPanelOpen,
    setIsPanelOpen,
    selectedCustomerDetail,
    customerLoading,
    updateCustomerTags,
    updateCustomerStage,
    addCustomerNote,
    updateCustomerContact,
    linkCustomerToConversation,
    // WebSocket state
    webSocketState,
    // Pagination for infinite scroll
    waHasMore,
    isLoadingMore,
    loadMoreConversations,
  } = useUnifiedInbox()

  // State for mobile panel sheet
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false)
  
  // Track if we've already handled the params to avoid repeated selections
  const phoneParamHandledRef = useRef<string | null>(null)
  const conversationParamHandledRef = useRef<string | null>(null)

  // Detect if we're on desktop (lg breakpoint = 1024px)
  const isDesktop = useMediaQuery("(min-width: 1024px)")
  const isMobile = useMediaQuery("(max-width: 767px)")
  
  // Hide bottom nav when chat is open on mobile
  const { setIsHidden } = useBottomNav()
  
  useEffect(() => {
    if (isMobile && selectedConversation) {
      setIsHidden(true)
    } else {
      setIsHidden(false)
    }
    return () => setIsHidden(false)
  }, [isMobile, selectedConversation, setIsHidden])

  // Handle browser back button on mobile - close chat instead of navigating away
  useEffect(() => {
    if (!isMobile) return

    // When chat opens, push a state to history
    if (selectedConversation) {
      window.history.pushState({ chatOpen: true }, "")
    }

    const handlePopState = (event: PopStateEvent) => {
      // If chat is open and user pressed back, close chat instead of navigating
      if (selectedConversation) {
        event.preventDefault()
        selectConversation(null)
      }
    }

    window.addEventListener("popstate", handlePopState)
    return () => window.removeEventListener("popstate", handlePopState)
  }, [isMobile, selectedConversation, selectConversation])

  // Load assignable users on mount
  useEffect(() => {
    if (userId) {
      loadAssignableUsers()
    }
  }, [userId, loadAssignableUsers])

  // Auto-select conversation when phone query param is provided (e.g., from customer page)
  useEffect(() => {
    if (!phoneParam || loading || conversations.length === 0) return
    if (phoneParamHandledRef.current === phoneParam) return // Already handled this phone param
    
    // Find conversation matching the phone number (normalize for consistent matching)
    const conversation = conversations.find(
      (c) => c.channel === "whatsapp" && normalizePhoneNumber(c.participantIdentifier) === normalizePhoneNumber(phoneParam)
    )
    
    if (conversation) {
      phoneParamHandledRef.current = phoneParam
      selectConversation(conversation)
      
      // Remove the query param from URL to clean up
      const newUrl = window.location.pathname
      router.replace(newUrl, { scroll: false })
    }
  }, [phoneParam, loading, conversations, selectConversation, router])

  // Auto-select conversation when conversation ID query param is provided (e.g., from notification)
  useEffect(() => {
    if (!conversationParam || loading || conversations.length === 0) return
    if (conversationParamHandledRef.current === conversationParam) return // Already handled
    
    // Find conversation matching the ID and optional type
    const conversation = conversations.find((c) => {
      const idMatches = c.id === conversationParam
      if (!idMatches) return false
      
      // If type is specified, also match channel
      if (typeParam) {
        return c.channel === typeParam.toLowerCase()
      }
      return true
    })
    
    if (conversation) {
      conversationParamHandledRef.current = conversationParam
      selectConversation(conversation)
      
      // Remove the query params from URL to clean up
      const newUrl = window.location.pathname
      router.replace(newUrl, { scroll: false })
    }
  }, [conversationParam, typeParam, loading, conversations, selectConversation, router])

  // Handle linking customer to conversation
  const handleLinkCustomer = async (customerId: string) => {
    await linkCustomerToConversation(customerId)
  }

  // Toggle panel - on mobile opens sheet, on desktop toggles sidebar
  const handlePanelToggle = () => {
    if (isDesktop) {
      setIsPanelOpen(!isPanelOpen)
    } else {
      setMobileSheetOpen(!mobileSheetOpen)
    }
  }

  // Show loading state while checking authentication
  if (isLoadingAccount) {
    return (
      <div className="flex flex-col h-screen overflow-hidden">
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
      <div className="flex flex-col h-screen overflow-hidden">
        <Header />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <User className="h-16 w-16 mx-auto mb-4 text-muted-foreground/50" />
            <h3 className="text-lg font-semibold mb-2">
              Authentication Required
            </h3>
            <p className="text-sm text-muted-foreground">
              Please log in to access OneInbox
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-[100dvh] md:h-screen overflow-hidden">
      {/* Hide header on mobile when chat is open */}
      <div className={cn("flex-shrink-0", selectedConversation ? "hidden md:block" : "")}>
        <div className="flex items-center">
          <div className="flex-1">
            <Header />
          </div>
          {/* WebSocket Connection Status - positioned at far right */}
          <ConnectionStatus state={webSocketState} className="absolute right-4 top-4" />
        </div>

        {/* Connection Status Banner */}
        <ConnectionStatusBanner
          whatsappConnected={whatsappConnected}
          instagramConnected={instagramConnected}
        />
      </div>

      <div className="flex flex-1 bg-background overflow-hidden min-h-0">
        {/* Unified Conversation List */}
        <UnifiedConversationList
          conversations={filteredConversations}
          selectedConversation={selectedConversation}
          onSelectConversation={selectConversation}
          loading={loading}
          onRefresh={loadConversations}
          channelFilter={channelFilter}
          onChannelFilterChange={setChannelFilter}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          whatsappConnected={whatsappConnected}
          instagramConnected={instagramConnected}
          readStatusFilter={readStatusFilter}
          onReadStatusChange={setReadStatusFilter}
          tagsFilter={tagsFilter}
          onTagsChange={setTagsFilter}
          pipelineFilter={pipelineFilter}
          onPipelineChange={setPipelineFilter}
          availableTags={availableTags}
          pipelineStages={pipelineStages}
          onClearFilters={clearFilters}
          accountFilter={accountFilter}
          onAccountFilterChange={setAccountFilter}
          instagramAccounts={instagramAccounts}
          facebookPages={facebookPages}
          whatsappPhoneNumbers={whatsappPhoneNumbers}
          assignmentFilter={assignmentFilter}
          onAssignmentFilterChange={setAssignmentFilter}
          assignableUsers={assignableUsers}
          aiEnabled={aiEnabled}
          defaultAIAgentName={defaultAIAgentName}
          className={selectedConversation ? "hidden md:flex" : "flex"}
          hasMore={waHasMore}
          isLoadingMore={isLoadingMore}
          onLoadMore={loadMoreConversations}
        />

        {/* Chat Area - Conditionally render based on channel */}
        {selectedConversation ? (
          <div className={cn(
            "flex-1 flex flex-col bg-background relative min-h-0",
            !selectedConversation ? "hidden md:flex" : "flex"
          )}>
            {/* Panel toggle button - Desktop: when panel closed, Mobile: always visible */}
            <div className={cn(
              "absolute right-2 top-2 z-10 flex items-center gap-1",
            )}>
              <Button
                variant="ghost"
                size="icon"
                onClick={handlePanelToggle}
                className={cn(
                  // On desktop, only show when panel is closed
                  isDesktop && isPanelOpen ? "hidden" : "flex"
                )}
                title="Open customer panel"
              >
                <PanelRight className="h-4 w-4" />
              </Button>
            </div>

            {selectedConversation.channel === "whatsapp" ? (
              <ChatArea
                key={selectedConversation.id}
                selectedCustomer={selectedConversation.originalData as Customer}
                messages={waMessages}
                currentUserId={userId}
                onSendMessage={sendWhatsAppMessage}
                onSendTemplate={sendWhatsAppTemplate}
                onSendCta={sendWhatsAppCta}
                onSendReplyButtons={sendWhatsAppReplyButtons}
                onSendListMessage={sendWhatsAppListMessage}
                onSendCarousel={sendWhatsAppCarousel}
                onSendMedia={sendWhatsAppMedia}
                onSendReaction={sendWhatsAppReaction}
                sending={sending}
                uploading={uploading}
                templates={waTemplates}
                onBack={() => selectConversation(null)}
                windowStatus={waWindowStatus}
                onRetryMessage={retryWhatsAppMessage}
              />
            ) : selectedConversation.channel === "instagram" ? (
              <IGChatArea
                key={selectedConversation.id}
                conversation={selectedConversation.originalData as IGConversation}
                messages={igMessages}
                onSendMessage={sendInstagramMessage}
                onSendReaction={sendInstagramReaction}
                sending={sending}
                loadingMessages={loading}
                onBack={() => selectConversation(null)}
              />
            ) : (
              <MessengerChatArea
                key={selectedConversation.id}
                conversation={selectedConversation.originalData as any}
                messages={msgMessages}
                onSendMessage={sendMessengerMessage}
                sending={sending}
                loadingMessages={loading}
                onBack={() => selectConversation(null)}
              />
            )}
          </div>
        ) : (
          <UnifiedEmptyState />
        )}

        {/* Customer Profile Panel - Desktop sidebar */}
        {selectedConversation && (
          <div className="hidden lg:block h-full">
            <CustomerProfilePanel
              conversation={selectedConversation}
              crmCustomer={selectedCustomerDetail}
              isOpen={isPanelOpen}
              onToggle={() => setIsPanelOpen(!isPanelOpen)}
              loading={customerLoading}
              availableTags={availableTags}
              pipelineStages={pipelineStages}
              onUpdateTags={updateCustomerTags}
              onUpdateStage={updateCustomerStage}
              onAddNote={addCustomerNote}
              onUpdateContact={updateCustomerContact}
              onLinkCustomer={handleLinkCustomer}
              // Assignment props (Requirements: 6.1, 6.2, 6.3, 6.4)
              assignableUsers={assignableUsers}
              currentUserId={userId}
              onAssign={assignConversation}
              onUnassign={unassignConversation}
            />
          </div>
        )}
      </div>

      {/* Customer Profile Panel - Mobile/Tablet Sheet */}
      {selectedConversation && (
        <Sheet open={mobileSheetOpen} onOpenChange={setMobileSheetOpen}>
          <SheetContent side="right" className="w-[340px] p-0 lg:hidden" hideCloseButton>
            <VisuallyHidden>
              <SheetTitle>Customer Profile</SheetTitle>
            </VisuallyHidden>
            <CustomerProfilePanel
              conversation={selectedConversation}
              crmCustomer={selectedCustomerDetail}
              isOpen={true}
              onToggle={() => setMobileSheetOpen(false)}
              loading={customerLoading}
              availableTags={availableTags}
              pipelineStages={pipelineStages}
              onUpdateTags={updateCustomerTags}
              onUpdateStage={updateCustomerStage}
              onAddNote={addCustomerNote}
              onUpdateContact={updateCustomerContact}
              onLinkCustomer={handleLinkCustomer}
              // Assignment props (Requirements: 6.1, 6.2, 6.3, 6.4)
              assignableUsers={assignableUsers}
              currentUserId={userId}
              onAssign={assignConversation}
              onUnassign={unassignConversation}
            />
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
