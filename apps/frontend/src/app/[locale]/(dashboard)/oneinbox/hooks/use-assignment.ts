/**
 * useAssignment Hook
 * Handles conversation assignment to users and AI agents
 */

import { useState, useCallback } from "react"
import { assignmentApi } from "@/lib/api/assignment-api"
import { useToast } from "@/hooks/use-toast"
import type { ChannelType, UnifiedConversation, AssignmentFilterType, AssignableUser } from "./unified-inbox-types"

interface UseAssignmentOptions {
  conversations: UnifiedConversation[]
  setConversations: React.Dispatch<React.SetStateAction<UnifiedConversation[]>>
  setSelectedConversation: React.Dispatch<React.SetStateAction<UnifiedConversation | null>>
}

export function useAssignment({
  conversations,
  setConversations,
  setSelectedConversation,
}: UseAssignmentOptions) {
  const { toast } = useToast()

  // Assignment state (Requirements: 5.2, 5.3, 5.4)
  const [assignmentFilter, setAssignmentFilter] = useState<AssignmentFilterType>("all")
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([])
  
  // AI status state (Requirements: 5.1, 5.2, 5.3, 5.4)
  const [aiEnabled, setAIEnabled] = useState(false)
  const [defaultAIAgentName, setDefaultAIAgentName] = useState<string | null>(null)

  // Load assignable users and AI agents (Requirements: 2.1, 5.1, 5.2, 5.3, 5.4)
  const loadAssignableUsers = useCallback(async () => {
    try {
      // Fetch both users and AI agents in one call
      const response = await assignmentApi.fetchAssignableEntities()
      
      // Extract human users from the response
      const users = (response.humans || []).map(entity => ({
        id: entity.id,
        name: entity.name,
        email: entity.type === 'HUMAN' ? entity.email : '',
        image: entity.type === 'HUMAN' ? entity.image : null,
        role: entity.type === 'HUMAN' ? entity.role : 'AGENT' as const,
      }))
      setAssignableUsers(users)
      
      // Set AI enabled status based on available AI agents (Requirements: 5.1, 5.2)
      const hasAIAgents = response.aiAgents && response.aiAgents.length > 0
      setAIEnabled(hasAIAgents)
      
      // Set default AI agent name (first agent if available)
      if (hasAIAgents && response.aiAgents[0]) {
        setDefaultAIAgentName(response.aiAgents[0].name)
      } else {
        setDefaultAIAgentName(null)
      }
    } catch (error) {
      console.error("Failed to load assignable users:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to load team members",
      })
    }
  }, [toast])

  // Assign conversation to a user or AI Agent (Requirements: 1.4, 2.2)
  const assignConversation = useCallback(async (
    conversationId: string,
    conversationType: ChannelType,
    id: string,
    type: 'human' | 'ai' = 'human'
  ): Promise<boolean> => {
    // Find the conversation to get the raw ID (without wa- or ig- prefix)
    const conversation = conversations.find(c => c.id === conversationId)
    if (!conversation) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Conversation not found",
      })
      return false
    }

    // Extract the raw conversation ID (remove wa-, ig-, or msg- prefix)
    const rawConversationId = conversationId.replace(/^(wa|ig|msg)-/, "")

    // Find the assignee name for optimistic update
    // For AI agents, we'll need to fetch the name from the API response
    const assignee = type === 'human' ? assignableUsers.find(u => u.id === id) : null

    // Optimistic update for human assignment
    if (type === 'human') {
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            assigneeId: id,
            assigneeName: assignee?.name || null,
            assigneeImage: assignee?.image || null,
            assignedAt: new Date(),
          }
        }
        return conv
      }))

      // Also update selected conversation if it's the same
      setSelectedConversation(prev => {
        if (prev?.id === conversationId) {
          return {
            ...prev,
            assigneeId: id,
            assigneeName: assignee?.name || null,
            assigneeImage: assignee?.image || null,
            assignedAt: new Date(),
          }
        }
        return prev
      })
    }

    try {
      const result = await assignmentApi.assignConversation(rawConversationId, conversationType, id, type)
      
      // Update with actual result from API (especially for AI agents)
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            assigneeId: result.assigneeId,
            assigneeName: result.assigneeName,
            assigneeImage: result.assigneeImage || null,
            assignedAt: result.assignedAt,
          }
        }
        return conv
      }))

      setSelectedConversation(prev => {
        if (prev?.id === conversationId) {
          return {
            ...prev,
            assigneeId: result.assigneeId,
            assigneeName: result.assigneeName,
            assigneeImage: result.assigneeImage || null,
            assignedAt: result.assignedAt,
          }
        }
        return prev
      })

      const displayName = type === 'ai' 
        ? result.aiAgentName || "AI Agent"
        : assignee?.name || "team member"
      
      toast({
        title: "Success",
        description: `Conversation assigned to ${displayName}`,
      })
      return true
    } catch (error: any) {
      console.error("Failed to assign conversation:", error)
      // Revert optimistic update
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            assigneeId: conversation.assigneeId,
            assigneeName: conversation.assigneeName,
            assigneeImage: conversation.assigneeImage,
            assignedAt: conversation.assignedAt,
          }
        }
        return conv
      }))
      setSelectedConversation(prev => {
        if (prev?.id === conversationId) {
          return {
            ...prev,
            assigneeId: conversation.assigneeId,
            assigneeName: conversation.assigneeName,
            assigneeImage: conversation.assigneeImage,
            assignedAt: conversation.assignedAt,
          }
        }
        return prev
      })
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to assign conversation",
      })
      return false
    }
  }, [conversations, assignableUsers, setConversations, setSelectedConversation, toast])

  // Unassign conversation (Requirements: 3.1)
  const unassignConversation = useCallback(async (
    conversationId: string,
    conversationType: ChannelType
  ): Promise<boolean> => {
    // Find the conversation to get the current assignment for rollback
    const conversation = conversations.find(c => c.id === conversationId)
    if (!conversation) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Conversation not found",
      })
      return false
    }

    // Extract the raw conversation ID (remove wa-, ig-, or msg- prefix)
    const rawConversationId = conversationId.replace(/^(wa|ig|msg)-/, "")

    // Optimistic update
    setConversations(prev => prev.map(conv => {
      if (conv.id === conversationId) {
        return {
          ...conv,
          assigneeId: null,
          assigneeName: null,
          assigneeImage: null,
          assignedAt: null,
        }
      }
      return conv
    }))

    // Also update selected conversation if it's the same
    setSelectedConversation(prev => {
      if (prev?.id === conversationId) {
        return {
          ...prev,
          assigneeId: null,
          assigneeName: null,
          assigneeImage: null,
          assignedAt: null,
        }
      }
      return prev
    })

    try {
      await assignmentApi.unassignConversation(rawConversationId, conversationType)
      toast({
        title: "Success",
        description: "Conversation unassigned",
      })
      return true
    } catch (error: any) {
      console.error("Failed to unassign conversation:", error)
      // Revert optimistic update
      setConversations(prev => prev.map(conv => {
        if (conv.id === conversationId) {
          return {
            ...conv,
            assigneeId: conversation.assigneeId,
            assigneeName: conversation.assigneeName,
            assigneeImage: conversation.assigneeImage,
            assignedAt: conversation.assignedAt,
          }
        }
        return conv
      }))
      setSelectedConversation(prev => {
        if (prev?.id === conversationId) {
          return {
            ...prev,
            assigneeId: conversation.assigneeId,
            assigneeName: conversation.assigneeName,
            assigneeImage: conversation.assigneeImage,
            assignedAt: conversation.assignedAt,
          }
        }
        return prev
      })
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "Failed to unassign conversation",
      })
      return false
    }
  }, [conversations, setConversations, setSelectedConversation, toast])

  return {
    // State
    assignmentFilter,
    setAssignmentFilter,
    assignableUsers,
    aiEnabled,
    defaultAIAgentName,
    // Actions
    loadAssignableUsers,
    assignConversation,
    unassignConversation,
  }
}
