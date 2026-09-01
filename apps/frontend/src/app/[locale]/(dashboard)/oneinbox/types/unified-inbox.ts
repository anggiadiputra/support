/**
 * Unified Inbox Types
 * Common types for combining WhatsApp, Instagram, and Messenger conversations
 */

import type { Customer } from "../../messages/hooks/use-chat"
import type { IGConversation } from "@/lib/api/instagram"
import type { MessengerConversation } from "@/lib/api/messenger"

export type ChannelType = "whatsapp" | "instagram" | "messenger"

// Filter types for OneInbox filtering capabilities
export type ReadStatusFilter = "all" | "read" | "unread"

// Assignment filter type for filtering conversations by assignment status
export type AssignmentFilterType = "all" | "mine" | "unassigned" | "others"

// Assignable user interface for team members who can be assigned conversations
export interface AssignableUser {
  id: string
  name: string
  email: string
  image: string | null
  role: "BUSINESS_OWNER" | "AGENT"
}

// AI Agent interface for AI agents that can be assigned conversations
// Requirements: 1.1, 1.3, 1.6
export interface AssignableAIAgent {
  id: string
  name: string
  type: "AI_AGENT"
}

// Assignable entity - can be either human or AI Agent
// Requirements: 1.1, 1.2, 1.3
export type AssignableEntity = 
  | {
      id: string
      name: string
      type: "HUMAN"
      email: string
      image: string | null
      role: "BUSINESS_OWNER" | "AGENT"
    }
  | {
      id: string
      name: string
      type: "AI_AGENT"
    }

// Response from assignable-entities endpoint
// Requirements: 1.1, 1.2
export interface AssignableEntitiesResponse {
  humans: AssignableEntity[]
  aiAgents: AssignableEntity[]
}

// Assignee type for assignment records
// Requirements: 4.1
export type AssigneeType = "HUMAN" | "AI_AGENT"

// Assignment result from API - extended with AI Agent support
// Requirements: 4.1, 4.2, 4.3, 7.1, 7.3
export interface AssignmentResult {
  id: string
  conversationId: string
  conversationType: "WHATSAPP" | "INSTAGRAM" | "MESSENGER"
  assigneeType: AssigneeType
  // Human fields (when assigneeType = HUMAN)
  assigneeId: string | null
  assigneeName: string | null
  assigneeImage?: string | null
  // AI Agent fields (when assigneeType = AI_AGENT)
  aiAgentId: string | null
  aiAgentName: string | null
  // Common fields
  assignedById: string
  assignedAt: Date
}

// Assignment history item - extended with AI Agent support
// Requirements: 7.1, 7.2, 7.3
export interface AssignmentHistoryItem extends AssignmentResult {
  unassignedAt: Date | null
  assignedByName: string
  // Escalation info (when assignment is triggered by keyword)
  isEscalation?: boolean
  escalationKeywordGroup?: string | null
  escalationKeyword?: string | null
}

export interface FilterState {
  channel: ChannelType | "all"
  readStatus: ReadStatusFilter
  tags: string[]
  pipelineStages: string[]
  searchQuery: string
}

// CRM-related types for customer and pipeline data
export interface PipelineStage {
  id: string
  name: string
  color: string
  order: number
}

export interface CRMCustomer {
  id: string
  phoneNumber: string
  tags: string[]
  pipelineStageId: string | null
  pipelineStage: {
    id: string
    name: string
    color: string
  } | null
}

export interface CustomerNote {
  id: string
  content: string
  createdAt: Date
  createdBy: string
}

export interface CRMCustomerDetail {
  id: string
  name: string | null
  phoneNumber: string
  email: string | null
  avatar: string | null
  tags: string[]
  pipelineStageId: string | null
  pipelineStage: PipelineStage | null
  notes: CustomerNote[]
  customFields: Record<string, string>
  createdAt: Date
  updatedAt: Date
  // WhatsApp BSUID fields
  whatsappBsuid?: string | null
  whatsappParentBsuid?: string | null
  whatsappUsername?: string | null
  bsuidMappedAt?: Date | null
}

export interface UnifiedConversation {
  id: string
  channel: ChannelType
  // Common fields
  participantName: string | null
  participantIdentifier: string // IGSID or phone number - used for CRM matching
  participantDisplayId: string // Display-friendly identifier (username with @ or phone number)
  participantAvatar: string | null
  lastMessagePreview: string | null
  lastMessageAt: Date | null
  unreadCount: number
  isWindowActive: boolean
  // CRM-linked fields for filtering
  tags: string[]
  pipelineStageId: string | null
  pipelineStage: {
    id: string
    name: string
    color: string
  } | null
  crmCustomerId: string | null
  // Full CRM customer data when loaded for panel display
  crmCustomerDetail: CRMCustomerDetail | null
  // Assignment fields
  assigneeId: string | null
  assigneeName: string | null
  assigneeImage: string | null
  assignedAt: Date | null
  // AI Agent assignment fields - Requirements: 1.5, 1.6
  assigneeType?: AssigneeType
  aiAgentId?: string | null
  aiAgentName?: string | null
  // Multi-account fields for Instagram, Messenger, and WhatsApp
  whatsappPhoneNumberId?: string | null
  whatsappDisplayNumber?: string | null
  instagramAccountId?: string | null
  instagramAccountUsername?: string | null
  facebookPageId?: string | null
  facebookPageName?: string | null
  // Original data for passing to existing components
  originalData: Customer | IGConversation | MessengerConversation
}

/**
 * Transform WhatsApp Customer to UnifiedConversation
 * @param customer - The WhatsApp customer data
 * @param messages - Array of messages for this customer
 * @param unreadCounts - Optional map of customerId to unread count from backend
 * @param assignments - Optional map of customerId to assignment data from backend
 */
export function transformWhatsAppToUnified(
  customer: Customer,
  messages: any[],
  unreadCounts?: Record<string, number>,
  assignments?: Record<string, {
    assigneeId: string | null
    assigneeName: string | null
    assigneeImage: string | null
    assigneeType: AssigneeType
    aiAgentId: string | null
    aiAgentName: string | null
    assignedAt: string
  }>
): UnifiedConversation {
  // Get messages for this customer (match by id only, not phoneNumber, to avoid mixing conversations across WA numbers)
  const customerMessages = messages.filter(
    (m) => m.customer?.id === customer.id
  )
  
  // Sort by timestamp descending to get the latest message
  const sortedMessages = customerMessages.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  )
  const lastMessage = sortedMessages[0]

  // Get unread count from backend data, default to 0 if not available
  const unreadCount = unreadCounts?.[customer.id] ?? 0

  // Get assignment data from backend
  const assignment = assignments?.[customer.id]

  return {
    id: `wa-${customer.id}`,
    channel: "whatsapp",
    participantName: customer.name || null,
    participantIdentifier: customer.phoneNumber,
    participantDisplayId: customer.phoneNumber,
    participantAvatar: null,
    lastMessagePreview: lastMessage?.content || lastMessage?.text?.body || null,
    lastMessageAt: lastMessage ? new Date(lastMessage.timestamp) : null,
    unreadCount,
    isWindowActive: true, // Will be updated when selected
    // CRM fields - will be enriched later with CRM data
    tags: [],
    pipelineStageId: null,
    pipelineStage: null,
    crmCustomerId: null,
    crmCustomerDetail: null,
    // Assignment fields from backend - support both HUMAN and AI_AGENT types
    assigneeId: assignment?.assigneeId || null,
    assigneeName: assignment?.assigneeName || null,
    assigneeImage: assignment?.assigneeImage || null,
    assignedAt: assignment?.assignedAt ? new Date(assignment.assignedAt) : null,
    assigneeType: assignment?.assigneeType || "HUMAN",
    aiAgentId: assignment?.aiAgentId || null,
    aiAgentName: assignment?.aiAgentName || null,
    // Multi-account fields
    whatsappPhoneNumberId: (customer as any).whatsappPhoneNumberId || (customer as any).whatsappPhoneNumber?.id || null,
    whatsappDisplayNumber: (customer as any).whatsappPhoneNumber?.displayPhoneNumber || null,
    instagramAccountId: null,
    instagramAccountUsername: null,
    facebookPageId: null,
    facebookPageName: null,
    originalData: customer,
  }
}

/**
 * Transform Instagram Conversation to UnifiedConversation
 */
export function transformInstagramToUnified(
  conversation: IGConversation
): UnifiedConversation {
  return {
    id: `ig-${conversation.id}`,
    channel: "instagram",
    participantName: conversation.participantName || null,
    // Use IGSID as identifier for CRM matching
    participantIdentifier: conversation.participantIgsid,
    // Use username with @ for display
    participantDisplayId: conversation.participantUsername 
      ? `@${conversation.participantUsername}` 
      : conversation.participantIgsid,
    participantAvatar: conversation.participantProfilePic || null,
    lastMessagePreview: conversation.lastMessagePreview || null,
    lastMessageAt: conversation.lastMessageAt 
      ? new Date(conversation.lastMessageAt) 
      : null,
    unreadCount: conversation.unreadCount || 0,
    isWindowActive: conversation.isWindowActive,
    // CRM fields - will be enriched later with CRM data if linked
    tags: [],
    pipelineStageId: null,
    pipelineStage: null,
    crmCustomerId: null,
    crmCustomerDetail: null,
    // Assignment fields from backend (if available) - support both HUMAN and AI_AGENT types
    assigneeId: (conversation as any).assigneeId || null,
    assigneeName: (conversation as any).assigneeName || null,
    assigneeImage: (conversation as any).assigneeImage || null,
    assignedAt: (conversation as any).assignedAt ? new Date((conversation as any).assignedAt) : null,
    assigneeType: (conversation as any).assigneeType || "HUMAN",
    aiAgentId: (conversation as any).aiAgentId || null,
    aiAgentName: (conversation as any).aiAgentName || null,
    // Multi-account fields
    instagramAccountId: conversation.instagramAccountId || conversation.instagramAccount?.id || null,
    instagramAccountUsername: conversation.instagramAccount?.username || null,
    facebookPageId: null,
    facebookPageName: null,
    originalData: conversation,
  }
}

/**
 * Transform Messenger Conversation to UnifiedConversation
 */
export function transformMessengerToUnified(
  conversation: MessengerConversation
): UnifiedConversation {
  return {
    id: `msg-${conversation.id}`,
    channel: "messenger",
    participantName: conversation.participantName || null,
    // Use PSID as identifier for CRM matching
    participantIdentifier: conversation.participantPsid,
    // Use name or PSID for display
    participantDisplayId: conversation.participantName || conversation.participantPsid,
    participantAvatar: conversation.participantProfilePic || null,
    lastMessagePreview: conversation.lastMessagePreview || null,
    lastMessageAt: conversation.lastMessageAt 
      ? new Date(conversation.lastMessageAt) 
      : null,
    unreadCount: conversation.unreadCount || 0,
    isWindowActive: conversation.isWindowActive,
    // CRM fields - will be enriched later with CRM data if linked
    tags: [],
    pipelineStageId: null,
    pipelineStage: null,
    crmCustomerId: conversation.customerId || null,
    crmCustomerDetail: null,
    // Assignment fields from backend (if available) - support both HUMAN and AI_AGENT types
    assigneeId: (conversation as any).assigneeId || null,
    assigneeName: (conversation as any).assigneeName || null,
    assigneeImage: (conversation as any).assigneeImage || null,
    assignedAt: (conversation as any).assignedAt ? new Date((conversation as any).assignedAt) : null,
    assigneeType: (conversation as any).assigneeType || "HUMAN",
    aiAgentId: (conversation as any).aiAgentId || null,
    aiAgentName: (conversation as any).aiAgentName || null,
    // Multi-account fields
    instagramAccountId: null,
    instagramAccountUsername: null,
    facebookPageId: (conversation as any).facebookPageId || (conversation as any).facebookPage?.id || null,
    facebookPageName: (conversation as any).facebookPage?.pageName || null,
    originalData: conversation,
  }
}

