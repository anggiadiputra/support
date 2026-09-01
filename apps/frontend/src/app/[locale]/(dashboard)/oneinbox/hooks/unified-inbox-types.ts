/**
 * Unified Inbox Types
 * Shared types for the unified inbox hooks
 */

import type { Message } from "@/lib/api/messages-api"
import type { IGConversation, IGMessage } from "@/lib/api/instagram"
import type { MessengerConversation, MessengerMessage } from "@/lib/api/messenger"
import type { WindowStatus } from "@/lib/window-utils"
import type { Customer } from "../../messages/hooks/use-chat"
import type {
  ChannelType,
  UnifiedConversation,
  ReadStatusFilter,
  AssignmentFilterType,
  AssignableUser,
  CRMCustomer,
  CRMCustomerDetail,
  PipelineStage,
} from "../types/unified-inbox"

// Re-export types from unified-inbox
export type {
  ChannelType,
  UnifiedConversation,
  ReadStatusFilter,
  AssignmentFilterType,
  AssignableUser,
  CRMCustomer,
  CRMCustomerDetail,
  PipelineStage,
}

// Export other types
export type { Message, IGConversation, IGMessage, MessengerConversation, MessengerMessage, WindowStatus, Customer }

/**
 * CRM Data State
 */
export interface CRMDataState {
  crmCustomers: Map<string, CRMCustomer>
  crmCustomersByIgsid: Map<string, CRMCustomer>
  crmCustomersByPsid: Map<string, CRMCustomer>
  pipelineStages: PipelineStage[]
  availableTags: string[]
  crmDataLoaded: boolean
  selectedCustomerDetail: CRMCustomerDetail | null
  customerLoading: boolean
  isPanelOpen: boolean
}

/**
 * CRM Data Actions
 */
export interface CRMDataActions {
  loadCrmData: () => Promise<void>
  loadCustomerDetail: (customerId: string) => Promise<void>
  updateCustomerTags: (customerId: string, tags: string[]) => Promise<boolean>
  updateCustomerStage: (customerId: string, pipelineStageId: string) => Promise<boolean>
  addCustomerNote: (customerId: string, content: string) => Promise<boolean>
  updateCustomerContact: (customerId: string, updates: { name?: string; email?: string; customFields?: Record<string, string> }) => Promise<boolean>
  linkCustomerToConversation: (customerId: string) => Promise<boolean>
  setIsPanelOpen: (open: boolean) => void
  setSelectedCustomerDetail: (detail: CRMCustomerDetail | null) => void
}

/**
 * Assignment State
 */
export interface AssignmentState {
  assignmentFilter: AssignmentFilterType
  assignableUsers: AssignableUser[]
  aiEnabled: boolean
  defaultAIAgentName: string | null
}

/**
 * Assignment Actions
 */
export interface AssignmentActions {
  setAssignmentFilter: (filter: AssignmentFilterType) => void
  loadAssignableUsers: () => Promise<void>
  assignConversation: (conversationId: string, conversationType: ChannelType, id: string, type?: 'human' | 'ai') => Promise<boolean>
  unassignConversation: (conversationId: string, conversationType: ChannelType) => Promise<boolean>
}

/**
 * Filter State
 */
export interface FilterState {
  channelFilter: ChannelType | "all"
  searchQuery: string
  readStatusFilter: ReadStatusFilter
  tagsFilter: string[]
  pipelineFilter: string[]
}

/**
 * Filter Actions
 */
export interface FilterActions {
  setChannelFilter: (filter: ChannelType | "all") => void
  setSearchQuery: (query: string) => void
  setReadStatusFilter: (filter: ReadStatusFilter) => void
  setTagsFilter: (tags: string[]) => void
  setPipelineFilter: (stages: string[]) => void
  clearFilters: () => void
}

/**
 * WhatsApp Messaging State
 */
export interface WhatsAppMessagingState {
  waMessages: Message[]
  waCustomers: Customer[]
  waTemplates: any[]
  waWindowStatus: WindowStatus | null
  whatsappConnected: boolean
}

/**
 * WhatsApp Messaging Actions
 */
export interface WhatsAppMessagingActions {
  setWaWindowStatus: (status: WindowStatus | null) => void
  sendWhatsAppMessage: (text: string) => Promise<boolean | "WINDOW_EXPIRED">
  sendWhatsAppTemplate: (template: any) => Promise<boolean>
  sendWhatsAppMedia: (file: File, caption?: string) => Promise<boolean | "WINDOW_EXPIRED">
  sendWhatsAppCta: (ctaForm: {
    bodyText: string
    buttonLabel: string
    buttonUrl: string
    footerText: string
    headerImageUrl: string
  }) => Promise<boolean | "WINDOW_EXPIRED">
  sendWhatsAppReplyButtons: (replyForm: {
    bodyText: string
    buttons: { id: string; title: string }[]
    footerText: string
    headerImage: File | null
  }) => Promise<boolean | "WINDOW_EXPIRED">
  sendWhatsAppListMessage: (listForm: {
    headerText: string
    bodyText: string
    footerText: string
    buttonText: string
    sections: Array<{
      title: string
      rows: Array<{
        id: string
        title: string
        description: string
      }>
    }>
  }) => Promise<boolean | "WINDOW_EXPIRED">
  sendWhatsAppCarousel: (carouselForm: {
    bodyText: string
    cards: Array<{
      mediaType: "image" | "video"
      mediaUrl: string
      bodyText?: string
      buttonLabel?: string
      buttonUrl?: string
      buttons?: Array<{
        id: string
        title: string
      }>
    }>
  }) => Promise<boolean | "WINDOW_EXPIRED">
}

/**
 * Instagram Messaging State
 */
export interface InstagramMessagingState {
  igMessages: IGMessage[]
  instagramConnected: boolean | null
}

/**
 * Instagram Messaging Actions
 */
export interface InstagramMessagingActions {
  sendInstagramMessage: (data: {
    type: "text" | "image" | "video" | "audio" | "sticker"
    text?: string
    mediaUrl?: string
  }) => Promise<boolean>
  sendInstagramReaction: (messageId: string) => Promise<void>
}

/**
 * Messenger Messaging State
 */
export interface MessengerMessagingState {
  msgMessages: MessengerMessage[]
  messengerConnected: boolean | null
}

/**
 * Messenger Messaging Actions
 */
export interface MessengerMessagingActions {
  sendMessengerMessage: (data: {
    type: "text" | "image" | "video" | "audio" | "file"
    text?: string
    mediaUrl?: string
  }) => Promise<boolean>
}

/**
 * Conversation State
 */
export interface ConversationState {
  conversations: UnifiedConversation[]
  selectedConversation: UnifiedConversation | null
  loading: boolean
  sending: boolean
  uploading: boolean
}

/**
 * Conversation Actions
 */
export interface ConversationActions {
  setConversations: React.Dispatch<React.SetStateAction<UnifiedConversation[]>>
  setSelectedConversation: React.Dispatch<React.SetStateAction<UnifiedConversation | null>>
  selectConversation: (conversation: UnifiedConversation | null) => Promise<void>
  loadConversations: () => Promise<void>
}
