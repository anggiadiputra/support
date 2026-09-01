"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Link2, UserPlus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { UnifiedConversation, CRMCustomerDetail, PipelineStage } from "../types/unified-inbox"
import { PanelHeader } from "./customer-panel/panel-header"
import { TagsSection } from "./customer-panel/tags-section"
import { PipelineSection } from "./customer-panel/pipeline-section"
import { NotesSection } from "./customer-panel/notes-section"
import { ContactSection } from "./customer-panel/contact-section"
import { LinkCustomerDialog } from "./customer-panel/link-customer-dialog"
import { AssignmentHistorySection } from "./customer-panel/assignment-history-section"
import { AssignmentSection } from "./customer-panel/assignment-section"
import type { AssignableUser, AssigneeType, ChannelType } from "../types/unified-inbox"

interface CustomerProfilePanelProps {
  conversation: UnifiedConversation | null
  crmCustomer: CRMCustomerDetail | null
  isOpen: boolean
  onToggle: () => void
  loading?: boolean
  availableTags: string[]
  pipelineStages: PipelineStage[]
  onUpdateTags: (customerId: string, tags: string[]) => Promise<boolean>
  onUpdateStage: (customerId: string, stageId: string) => Promise<boolean>
  onAddNote: (customerId: string, content: string) => Promise<boolean>
  onUpdateContact: (customerId: string, updates: { name?: string; email?: string }) => Promise<boolean>
  onLinkCustomer: (customerId: string) => Promise<void>
  // Assignment props (Requirements: 6.1, 6.2, 6.3, 6.4)
  assignableUsers?: AssignableUser[]
  currentUserId?: string
  onAssign?: (conversationId: string, conversationType: ChannelType, assigneeId: string, type?: 'human' | 'ai') => Promise<boolean>
  onUnassign?: (conversationId: string, conversationType: ChannelType) => Promise<boolean>
  assignmentLoading?: boolean
}

function PanelSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {/* Header skeleton */}
      <div className="flex items-center gap-3">
        <Skeleton className="h-12 w-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
      {/* Tags skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <div className="flex gap-2">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      </div>
      {/* Pipeline skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-full" />
      </div>
      {/* Notes skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-16 w-full" />
      </div>
    </div>
  )
}

function UnlinkedState({
  onLinkClick,
  onCreateClick,
}: {
  onLinkClick: () => void
  onCreateClick?: () => void
}) {
  return (
    <div className="flex flex-col items-center justify-center h-full p-6 text-center">
      <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <span className="text-2xl text-muted-foreground">?</span>
      </div>
      <h3 className="font-medium mb-2">No customer linked</h3>
      <p className="text-sm text-muted-foreground mb-6">
        This conversation is not linked to any CRM customer record.
      </p>
      <div className="space-y-2 w-full max-w-[200px]">
        <Button onClick={onLinkClick} className="w-full gap-2">
          <Link2 className="h-4 w-4" />
          Link Customer
        </Button>
        {onCreateClick && (
          <Button variant="outline" onClick={onCreateClick} className="w-full gap-2">
            <UserPlus className="h-4 w-4" />
            Create New Customer
          </Button>
        )}
      </div>
    </div>
  )
}

export function CustomerProfilePanel({
  conversation,
  crmCustomer,
  isOpen,
  onToggle,
  loading = false,
  availableTags,
  pipelineStages,
  onUpdateTags,
  onUpdateStage,
  onAddNote,
  onUpdateContact,
  onLinkCustomer,
  // Assignment props
  assignableUsers = [],
  currentUserId = "",
  onAssign,
  onUnassign,
  assignmentLoading = false,
}: CustomerProfilePanelProps) {
  const [linkDialogOpen, setLinkDialogOpen] = useState(false)

  // Handle tag operations
  const handleAddTag = async (tag: string) => {
    if (!crmCustomer) return false
    const newTags = [...crmCustomer.tags, tag]
    return onUpdateTags(crmCustomer.id, newTags)
  }

  const handleRemoveTag = async (tag: string) => {
    if (!crmCustomer) return false
    const newTags = crmCustomer.tags.filter((t) => t !== tag)
    return onUpdateTags(crmCustomer.id, newTags)
  }

  // Handle stage change
  const handleStageChange = async (stageId: string) => {
    if (!crmCustomer) return false
    return onUpdateStage(crmCustomer.id, stageId)
  }

  // Handle note add
  const handleAddNote = async (content: string) => {
    if (!crmCustomer) return false
    return onAddNote(crmCustomer.id, content)
  }

  // Handle contact update
  const handleContactUpdate = async (updates: { name?: string; email?: string }) => {
    if (!crmCustomer) return false
    return onUpdateContact(crmCustomer.id, updates)
  }

  // Handle link customer
  const handleLinkCustomer = async (customerId: string) => {
    await onLinkCustomer(customerId)
  }

  // Handle assignment (Requirements: 6.1, 6.2, 6.3, 6.4)
  const handleAssign = async (assigneeId: string, type: 'human' | 'ai' = 'human'): Promise<boolean> => {
    if (!conversation || !onAssign) return false
    try {
      await onAssign(conversation.id, conversation.channel, assigneeId, type)
      return true
    } catch {
      return false
    }
  }

  const handleUnassign = async (): Promise<boolean> => {
    if (!conversation || !onUnassign) return false
    try {
      await onUnassign(conversation.id, conversation.channel)
      return true
    } catch {
      return false
    }
  }

  // Get current assignee from conversation
  const currentAssignee: AssignableUser | null = conversation?.assigneeId && conversation?.assigneeType !== "AI_AGENT"
    ? assignableUsers.find(u => u.id === conversation.assigneeId) || {
        id: conversation.assigneeId,
        name: conversation.assigneeName || "Unknown",
        email: "",
        image: conversation.assigneeImage,
        role: "AGENT" as const,
      }
    : null
  
  // Get AI Agent assignment info
  const currentAssigneeType = conversation?.assigneeType || "HUMAN"
  const currentAIAgentId = conversation?.aiAgentId || null
  const currentAIAgentName = conversation?.aiAgentName || null

  // No conversation selected
  if (!conversation) {
    return null
  }

  const hasCrmCustomer = !!conversation.crmCustomerId

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          "border-l bg-background flex flex-col transition-all duration-200 ease-in-out h-full",
          isOpen ? "w-[320px]" : "w-0 overflow-hidden"
        )}
      >
        {isOpen && (
          <>
            {/* Panel header with close button */}
            {loading ? (
              <div className="flex items-center justify-between p-4 border-b bg-background">
                <Skeleton className="h-5 w-32" />
                <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : crmCustomer ? (
              <PanelHeader customer={crmCustomer} onClose={onToggle} />
            ) : (
              <div className="flex items-center justify-between p-4 border-b bg-background">
                <h3 className="font-semibold">Customer Profile</h3>
                <Button variant="ghost" size="icon" onClick={onToggle} className="h-8 w-8">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            {/* Panel content */}
            <ScrollArea className="flex-1">
              {loading ? (
                <PanelSkeleton />
              ) : !hasCrmCustomer ? (
                <div>
                  {/* Assignment Section - shown even without CRM customer (Requirements: 6.1, 6.2, 6.3, 6.4) */}
                  <AssignmentSection
                    conversationId={conversation.id}
                    conversationType={conversation.channel}
                    currentAssignee={currentAssignee}
                    currentAssigneeType={currentAssigneeType}
                    currentAIAgentId={currentAIAgentId}
                    currentAIAgentName={currentAIAgentName}
                    assignableUsers={assignableUsers}
                    currentUserId={currentUserId}
                    onAssign={handleAssign}
                    onUnassign={handleUnassign}
                    loading={assignmentLoading}
                  />
                  {/* Show assignment history even without CRM customer (Requirements: 8.2, 8.3) */}
                  <AssignmentHistorySection
                    conversationId={conversation.id}
                    conversationType={conversation.channel}
                  />
                  <UnlinkedState
                    onLinkClick={() => setLinkDialogOpen(true)}
                  />
                </div>
              ) : crmCustomer ? (
                <div>
                  {/* Assignment Section - above Pipeline Stage (Requirements: 6.1, 6.2, 6.3, 6.4) */}
                  <AssignmentSection
                    conversationId={conversation.id}
                    conversationType={conversation.channel}
                    currentAssignee={currentAssignee}
                    currentAssigneeType={currentAssigneeType}
                    currentAIAgentId={currentAIAgentId}
                    currentAIAgentName={currentAIAgentName}
                    assignableUsers={assignableUsers}
                    currentUserId={currentUserId}
                    onAssign={handleAssign}
                    onUnassign={handleUnassign}
                    loading={assignmentLoading}
                  />
                  {/* Contact Information - moved to top for quick access */}
                  <ContactSection
                    customer={crmCustomer}
                    onUpdate={handleContactUpdate}
                  />
                  <TagsSection
                    tags={crmCustomer.tags}
                    availableTags={availableTags}
                    onAddTag={handleAddTag}
                    onRemoveTag={handleRemoveTag}
                  />
                  <PipelineSection
                    currentStage={crmCustomer.pipelineStage}
                    availableStages={pipelineStages}
                    onStageChange={handleStageChange}
                  />
                  <NotesSection
                    notes={crmCustomer.notes}
                    onAddNote={handleAddNote}
                  />
                  {/* Assignment History (Requirements: 8.2, 8.3) */}
                  <AssignmentHistorySection
                    conversationId={conversation.id}
                    conversationType={conversation.channel}
                  />
                </div>
              ) : null}
            </ScrollArea>
          </>
        )}
      </div>

      {/* Link customer dialog */}
      <LinkCustomerDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        onSelectCustomer={handleLinkCustomer}
      />
    </>
  )
}
