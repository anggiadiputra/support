import { prisma } from '../utils/database.js';
import type { ConversationType, Role, AssigneeType } from '@prisma/client';
import { eventEmitter } from '../websocket/event-emitter.js';
import { resolveAIConfig } from './ai/resolve-ai-config.js';

/**
 * Assignment result interface - Extended to support AI Agent assignments
 */
export interface AssignmentResult {
  id: string;
  conversationId: string;
  conversationType: ConversationType;
  assigneeType: AssigneeType;
  // Human fields
  assigneeId: string | null;
  assigneeName: string | null;
  assigneeImage: string | null;
  // AI Agent fields
  aiAgentId: string | null;
  aiAgentName: string | null;
  // Common fields
  assignedById: string;
  assignedByName: string;
  assignedAt: Date;
  unassignedAt: Date | null;
}

/**
 * Assignable entity interface - Unified type for humans and AI agents
 * Requirements: 1.1, 1.2, 1.3
 */
export interface AssignableEntity {
  id: string;
  name: string;
  type: 'HUMAN' | 'AI_AGENT';
  email?: string;        // For humans
  image?: string | null; // For humans
  role?: Role;           // For humans
}

/**
 * AI Response Decision interface
 * Requirements: 2.1, 2.2, 2.4, 3.1, 3.2
 */
export interface AIResponseDecision {
  shouldRespond: boolean;
  reason: 'assigned_to_human' | 'assigned_to_ai' | 'unassigned_ai_enabled' | 'ai_disabled';
  aiAgentId: string | null;
  aiAgentName: string | null;
}

/**
 * Assignable user interface (legacy - for backward compatibility)
 */
export interface AssignableUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
}

/**
 * Assignment error codes
 */
export const ASSIGNMENT_ERRORS = {
  UNAUTHORIZED_ASSIGN: 'You do not have permission to assign this conversation',
  UNAUTHORIZED_UNASSIGN: 'You do not have permission to unassign this conversation',
  CONVERSATION_NOT_FOUND: 'Conversation not found',
  ASSIGNEE_NOT_FOUND: 'Assignee not found or not a team member',
  ALREADY_ASSIGNED: 'Conversation is already assigned to this user',
  NOT_ASSIGNED: 'Conversation is not currently assigned',
} as const;

/**
 * AI Assignment error codes
 * Requirements: 1.4, 4.3, 4.4
 */
export const AI_ASSIGNMENT_ERRORS = {
  AI_DISABLED: 'AI Chatbot is not enabled. Enable AI first to assign to AI Agent.',
  AI_AGENT_NOT_FOUND: 'AI Agent not found or does not belong to this account.',
  AI_AGENT_REQUIRED: 'AI Agent ID is required for AI assignment.',
  INVALID_ASSIGNEE_TYPE: 'Invalid assignee type. Must be HUMAN or AI_AGENT.',
} as const;

/**
 * AssignmentService
 * 
 * Handles conversation assignment management for OneInbox.
 * Manages assigning/unassigning conversations to team members.
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 2.4, 7.1, 7.2, 7.3, 7.4, 8.1
 */
export class AssignmentService {
  /**
   * Get all user IDs in a business owner's context (business owner + active agents)
   * Used for broadcasting WebSocket events
   * 
   * @param businessOwnerId - The business owner's user ID
   * @returns Array of user IDs
   */
  private async getUserIdsInContext(businessOwnerId: string): Promise<string[]> {
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        businessOwnerId,
        status: 'ACTIVE',
        agentUserId: { not: null },
      },
      select: {
        agentUserId: true,
      },
    });

    const agentIds = teamMembers
      .filter((tm) => tm.agentUserId !== null)
      .map((tm) => tm.agentUserId as string);

    return [businessOwnerId, ...agentIds];
  }

  /**
   * Emit assignment changed WebSocket event to all users in business owner context
   * Uses business room broadcast for efficient delivery to all team members
   * Includes history item for realtime assignment history updates
   * 
   * @param businessOwnerId - The business owner's user ID
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param assigneeId - The assignee ID (null for unassign)
   * @param assigneeName - The assignee name (null for unassign)
   * @param assignedById - The user who made the change
   * @param action - 'assigned' or 'unassigned'
   * @param historyItem - Optional assignment history item for realtime updates
   * Requirements: 2.4
   */
  private async emitAssignmentChangedEvent(
    businessOwnerId: string,
    conversationId: string,
    conversationType: ConversationType,
    assigneeId: string | null,
    assigneeName: string | null,
    assignedById: string,
    action: 'assigned' | 'unassigned',
    historyItem?: {
      id: string;
      assigneeId: string | null;
      assigneeName: string | null;
      assigneeType: 'HUMAN' | 'AI_AGENT';
      aiAgentId: string | null;
      aiAgentName: string | null;
      assignedById: string;
      assignedByName: string | null;
      assignedAt: Date;
      unassignedAt: Date | null;
    }
  ): Promise<void> {
    eventEmitter.emitAssignmentChangedToBusinessRoom(businessOwnerId, {
      conversationId,
      conversationType: conversationType.toLowerCase() as 'whatsapp' | 'instagram' | 'messenger',
      assigneeId,
      assigneeName,
      assigneeType: historyItem?.assigneeType,
      aiAgentId: historyItem?.aiAgentId ?? null,
      aiAgentName: historyItem?.aiAgentName ?? null,
      assignedById,
      assignedByName: historyItem?.assignedByName ?? null,
      action,
      historyItem: historyItem ? {
        id: historyItem.id,
        assigneeId: historyItem.assigneeId,
        assigneeName: historyItem.assigneeName,
        assigneeType: historyItem.assigneeType,
        aiAgentId: historyItem.aiAgentId,
        aiAgentName: historyItem.aiAgentName,
        assignedById: historyItem.assignedById,
        assignedByName: historyItem.assignedByName,
        assignedAt: historyItem.assignedAt.toISOString(),
        unassignedAt: historyItem.unassignedAt?.toISOString() ?? null,
      } : undefined,
    });
  }

  /**
   * Get current active assignment for a conversation
   * Extended to support AI Agent assignments
   * 
   * @param conversationId - The conversation ID (Customer ID for WhatsApp, IGConversation ID for Instagram)
   * @param conversationType - The conversation type (WHATSAPP or INSTAGRAM)
   * @param businessOwnerId - The business owner's user ID for scoping
   * @returns Current assignment or null if not assigned
   * Requirements: 1.1
   */
  async getAssignment(
    conversationId: string,
    conversationType: ConversationType,
    businessOwnerId: string
  ): Promise<AssignmentResult | null> {
    const assignment = await prisma.conversationAssignment.findFirst({
      where: {
        conversationId,
        conversationType,
        businessOwnerId,
        unassignedAt: null, // Only active assignments
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        aiAgent: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!assignment) {
      return null;
    }

    return {
      id: assignment.id,
      conversationId: assignment.conversationId,
      conversationType: assignment.conversationType,
      assigneeType: assignment.assigneeType,
      // Human fields
      assigneeId: assignment.assigneeId,
      assigneeName: assignment.assignee?.name ?? null,
      assigneeImage: assignment.assignee?.image ?? null,
      // AI Agent fields
      aiAgentId: assignment.aiAgentId,
      aiAgentName: assignment.aiAgent?.name ?? null,
      // Common fields
      assignedById: assignment.assignedById,
      assignedByName: assignment.assignedBy.name,
      assignedAt: assignment.assignedAt,
      unassignedAt: assignment.unassignedAt,
    };
  }

  /**
   * Assign a conversation to a human user
   * Enforces single active assignment constraint by unassigning previous assignment
   * 
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param assigneeId - The user ID to assign to
   * @param assignedById - The user ID making the assignment
   * @param businessOwnerId - The business owner's user ID
   * @param escalationInfo - Optional escalation info when assignment is triggered by keyword
   * @returns The new assignment
   * Requirements: 1.2, 1.3, 1.4, 2.4, 4.1, 4.2
   */
  async assignConversation(
    conversationId: string,
    conversationType: ConversationType,
    assigneeId: string,
    assignedById: string,
    businessOwnerId: string,
    escalationInfo?: {
      keywordGroup: string;
      keyword: string;
    }
  ): Promise<AssignmentResult> {
    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if already assigned to the same user
      const existingAssignment = await tx.conversationAssignment.findFirst({
        where: {
          conversationId,
          conversationType,
          businessOwnerId,
          unassignedAt: null,
        },
      });

      if (existingAssignment?.assigneeId === assigneeId && existingAssignment?.assigneeType === 'HUMAN') {
        throw new Error(ASSIGNMENT_ERRORS.ALREADY_ASSIGNED);
      }

      // Unassign previous assignment if exists (Requirement 1.3)
      if (existingAssignment) {
        await tx.conversationAssignment.update({
          where: { id: existingAssignment.id },
          data: { unassignedAt: new Date() },
        });
      }

      // Create new assignment with assigneeType = HUMAN (Requirement 4.1, 4.2)
      const newAssignment = await tx.conversationAssignment.create({
        data: {
          conversationId,
          conversationType,
          assigneeType: 'HUMAN',
          assigneeId,
          assignedById,
          businessOwnerId,
          // Escalation info (if triggered by keyword)
          isEscalation: !!escalationInfo,
          escalationKeywordGroup: escalationInfo?.keywordGroup,
          escalationKeyword: escalationInfo?.keyword,
        },
        include: {
          assignee: {
            select: {
              id: true,
              name: true,
              image: true,
            },
          },
          assignedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return {
        id: newAssignment.id,
        conversationId: newAssignment.conversationId,
        conversationType: newAssignment.conversationType,
        assigneeType: newAssignment.assigneeType,
        // Human fields
        assigneeId: newAssignment.assigneeId,
        assigneeName: newAssignment.assignee?.name ?? null,
        assigneeImage: newAssignment.assignee?.image ?? null,
        // AI Agent fields (null for human assignments)
        aiAgentId: null,
        aiAgentName: null,
        // Common fields
        assignedById: newAssignment.assignedById,
        assignedByName: newAssignment.assignedBy.name,
        assignedAt: newAssignment.assignedAt,
        unassignedAt: newAssignment.unassignedAt,
      };
    });

    // Emit WebSocket event after successful assignment (Requirement 2.4)
    await this.emitAssignmentChangedEvent(
      businessOwnerId,
      result.conversationId,
      result.conversationType,
      result.assigneeId,
      result.assigneeName,
      result.assignedById,
      'assigned',
      {
        id: result.id,
        assigneeId: result.assigneeId,
        assigneeName: result.assigneeName,
        assigneeType: 'HUMAN',
        aiAgentId: null,
        aiAgentName: null,
        assignedById: result.assignedById,
        assignedByName: result.assignedByName,
        assignedAt: result.assignedAt,
        unassignedAt: result.unassignedAt,
      }
    );

    return result;
  }

  /**
   * Assign a conversation to an AI Agent
   * Validates AI Agent exists and belongs to business owner
   * Enforces single active assignment constraint by unassigning previous assignment
   * 
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param aiAgentId - The AI Agent ID to assign to
   * @param assignedById - The user ID making the assignment
   * @param businessOwnerId - The business owner's user ID
   * @returns The new assignment
   * Requirements: 1.4, 4.3, 4.4
   */
  async assignToAIAgent(
    conversationId: string,
    conversationType: ConversationType,
    aiAgentId: string,
    assignedById: string,
    businessOwnerId: string
  ): Promise<AssignmentResult> {
    // Validate AI Agent ID is provided (Requirement 4.3)
    if (!aiAgentId) {
      throw new Error(AI_ASSIGNMENT_ERRORS.AI_AGENT_REQUIRED);
    }

    // Validate AI is enabled
    const aiConfig = await prisma.aIConfig.findUnique({
      where: { userId: businessOwnerId },
      select: { enabled: true },
    });

    if (!aiConfig?.enabled) {
      throw new Error(AI_ASSIGNMENT_ERRORS.AI_DISABLED);
    }

    // Validate AI Agent exists and belongs to business owner (Requirement 4.4)
    const aiAgent = await prisma.aIAgent.findFirst({
      where: {
        id: aiAgentId,
        userId: businessOwnerId,
      },
      select: {
        id: true,
        name: true,
      },
    });

    if (!aiAgent) {
      throw new Error(AI_ASSIGNMENT_ERRORS.AI_AGENT_NOT_FOUND);
    }

    // Use transaction to ensure atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Check if already assigned to the same AI Agent
      const existingAssignment = await tx.conversationAssignment.findFirst({
        where: {
          conversationId,
          conversationType,
          businessOwnerId,
          unassignedAt: null,
        },
      });

      if (existingAssignment?.aiAgentId === aiAgentId && existingAssignment?.assigneeType === 'AI_AGENT') {
        throw new Error(ASSIGNMENT_ERRORS.ALREADY_ASSIGNED);
      }

      // Unassign previous assignment if exists
      if (existingAssignment) {
        await tx.conversationAssignment.update({
          where: { id: existingAssignment.id },
          data: { unassignedAt: new Date() },
        });
      }

      // Create new assignment with assigneeType = AI_AGENT (Requirement 4.3)
      const newAssignment = await tx.conversationAssignment.create({
        data: {
          conversationId,
          conversationType,
          assigneeType: 'AI_AGENT',
          aiAgentId,
          assignedById,
          businessOwnerId,
        },
        include: {
          aiAgent: {
            select: {
              id: true,
              name: true,
            },
          },
          assignedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      });

      return {
        id: newAssignment.id,
        conversationId: newAssignment.conversationId,
        conversationType: newAssignment.conversationType,
        assigneeType: newAssignment.assigneeType,
        // Human fields (null for AI assignments)
        assigneeId: null,
        assigneeName: null,
        assigneeImage: null,
        // AI Agent fields
        aiAgentId: newAssignment.aiAgentId,
        aiAgentName: newAssignment.aiAgent?.name ?? null,
        // Common fields
        assignedById: newAssignment.assignedById,
        assignedByName: newAssignment.assignedBy.name,
        assignedAt: newAssignment.assignedAt,
        unassignedAt: newAssignment.unassignedAt,
      };
    });

    // Emit WebSocket event after successful assignment (Requirement 2.4)
    // For AI Agent assignments, we use the AI Agent name as the assignee name
    await this.emitAssignmentChangedEvent(
      businessOwnerId,
      result.conversationId,
      result.conversationType,
      result.aiAgentId, // Use aiAgentId as the identifier
      result.aiAgentName, // Use AI Agent name
      result.assignedById,
      'assigned',
      {
        id: result.id,
        assigneeId: null,
        assigneeName: null,
        assigneeType: 'AI_AGENT',
        aiAgentId: result.aiAgentId,
        aiAgentName: result.aiAgentName,
        assignedById: result.assignedById,
        assignedByName: result.assignedByName,
        assignedAt: result.assignedAt,
        unassignedAt: result.unassignedAt,
      }
    );

    return result;
  }

  /**
   * Unassign a conversation
   * 
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param unassignedById - The user ID performing the unassignment
   * @param businessOwnerId - The business owner's user ID
   * Requirements: 2.4, 3.1
   */
  async unassignConversation(
    conversationId: string,
    conversationType: ConversationType,
    unassignedById: string,
    businessOwnerId: string
  ): Promise<void> {
    // Fetch assignment with relations for history item
    const assignment = await prisma.conversationAssignment.findFirst({
      where: {
        conversationId,
        conversationType,
        businessOwnerId,
        unassignedAt: null,
      },
      include: {
        assignee: {
          select: { id: true, name: true },
        },
        aiAgent: {
          select: { id: true, name: true },
        },
        assignedBy: {
          select: { id: true, name: true },
        },
      },
    });

    if (!assignment) {
      throw new Error(ASSIGNMENT_ERRORS.NOT_ASSIGNED);
    }

    const unassignedAt = new Date();
    await prisma.conversationAssignment.update({
      where: { id: assignment.id },
      data: { unassignedAt },
    });

    // Emit WebSocket event after successful unassignment (Requirement 2.4)
    // Include history item with updated unassignedAt for realtime update
    await this.emitAssignmentChangedEvent(
      businessOwnerId,
      conversationId,
      conversationType,
      null,
      null,
      unassignedById,
      'unassigned',
      {
        id: assignment.id,
        assigneeId: assignment.assigneeId,
        assigneeName: assignment.assignee?.name ?? null,
        assigneeType: assignment.assigneeType as 'HUMAN' | 'AI_AGENT',
        aiAgentId: assignment.aiAgentId,
        aiAgentName: assignment.aiAgent?.name ?? null,
        assignedById: assignment.assignedById,
        assignedByName: assignment.assignedBy.name,
        assignedAt: assignment.assignedAt,
        unassignedAt,
      }
    );
  }

  /**
   * Get list of users that can be assigned (Business Owner + active Agents)
   * 
   * @param businessOwnerId - The business owner's user ID
   * @returns List of assignable users
   * Requirements: 2.1
   */
  async getAssignableUsers(businessOwnerId: string): Promise<AssignableUser[]> {
    // Get business owner
    const businessOwner = await prisma.user.findUnique({
      where: { id: businessOwnerId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });

    if (!businessOwner) {
      return [];
    }

    // Get active agents
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        businessOwnerId,
        status: 'ACTIVE',
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
    });

    const agents = teamMembers
      .filter((tm) => tm.agent !== null)
      .map((tm) => tm.agent as AssignableUser);

    return [businessOwner, ...agents];
  }

  /**
   * Get all assignable entities (humans + AI agents)
   * Returns combined list with type indicator for dropdown display
   * 
   * @param businessOwnerId - The business owner's user ID
   * @returns List of assignable entities (humans and AI agents)
   * Requirements: 1.1, 1.2, 1.3
   */
  async getAssignableEntities(businessOwnerId: string): Promise<AssignableEntity[]> {
    // Get business owner
    const businessOwner = await prisma.user.findUnique({
      where: { id: businessOwnerId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        role: true,
      },
    });

    if (!businessOwner) {
      return [];
    }

    // Get active agents (humans)
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        businessOwnerId,
        status: 'ACTIVE',
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
      },
    });

    // Build human entities list
    const humanEntities: AssignableEntity[] = [
      {
        id: businessOwner.id,
        name: businessOwner.name,
        type: 'HUMAN',
        email: businessOwner.email,
        image: businessOwner.image,
        role: businessOwner.role,
      },
      ...teamMembers
        .filter((tm) => tm.agent !== null)
        .map((tm) => ({
          id: tm.agent!.id,
          name: tm.agent!.name,
          type: 'HUMAN' as const,
          email: tm.agent!.email,
          image: tm.agent!.image,
          role: tm.agent!.role,
        })),
    ];

    // Check if AI is enabled (Requirement 1.2)
    const aiConfig = await prisma.aIConfig.findUnique({
      where: { userId: businessOwnerId },
      select: { enabled: true },
    });

    // If AI is not enabled, return only human entities
    if (!aiConfig?.enabled) {
      return humanEntities;
    }

    // Get all AI Agents belonging to business owner (Requirement 1.1, 1.3)
    const aiAgents = await prisma.aIAgent.findMany({
      where: { userId: businessOwnerId },
      select: {
        id: true,
        name: true,
      },
    });

    // Build AI agent entities list
    const aiAgentEntities: AssignableEntity[] = aiAgents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      type: 'AI_AGENT' as const,
    }));

    // Return combined list (humans first, then AI agents)
    return [...humanEntities, ...aiAgentEntities];
  }

  /**
   * Get assignment history for a conversation
   * Extended to support AI Agent assignments
   * 
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param businessOwnerId - The business owner's user ID
   * @returns List of all assignments (newest first)
   * Requirements: 7.1, 7.2, 7.3, 8.1, 8.2, 8.3
   */
  async getAssignmentHistory(
    conversationId: string,
    conversationType: ConversationType,
    businessOwnerId: string
  ): Promise<AssignmentResult[]> {
    const assignments = await prisma.conversationAssignment.findMany({
      where: {
        conversationId,
        conversationType,
        businessOwnerId,
      },
      include: {
        assignee: {
          select: {
            id: true,
            name: true,
            image: true,
          },
        },
        aiAgent: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedBy: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        assignedAt: 'desc', // Newest first (Requirement 8.3)
      },
    });

    return assignments.map((assignment) => ({
      id: assignment.id,
      conversationId: assignment.conversationId,
      conversationType: assignment.conversationType,
      assigneeType: assignment.assigneeType,
      // Human fields
      assigneeId: assignment.assigneeId,
      assigneeName: assignment.assignee?.name ?? null,
      assigneeImage: assignment.assignee?.image ?? null,
      // AI Agent fields
      aiAgentId: assignment.aiAgentId,
      aiAgentName: assignment.aiAgent?.name ?? null,
      // Common fields
      assignedById: assignment.assignedById,
      assignedByName: assignment.assignedBy.name,
      assignedAt: assignment.assignedAt,
      unassignedAt: assignment.unassignedAt,
      // Escalation info
      isEscalation: assignment.isEscalation,
      escalationKeywordGroup: assignment.escalationKeywordGroup,
      escalationKeyword: assignment.escalationKeyword,
    }));
  }

  /**
   * Check if a user can perform assignment action
   * 
   * @param userId - The user attempting the action
   * @param userRole - The user's role
   * @param targetAssigneeId - The target assignee ID
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param businessOwnerId - The business owner's user ID
   * @returns True if user can assign
   * Requirements: 7.1, 7.2, 7.3
   */
  async canAssign(
    userId: string,
    userRole: Role,
    targetAssigneeId: string,
    conversationId: string,
    conversationType: ConversationType,
    businessOwnerId: string
  ): Promise<boolean> {
    // Admin can assign any conversation to anyone (same as Business Owner)
    if (userRole === 'ADMIN') {
      return true;
    }

    // Business Owner can assign any conversation to anyone (Requirement 7.1)
    if (userRole === 'BUSINESS_OWNER') {
      return true;
    }

    // Agent permissions - NEW RULES
    if (userRole === 'AGENT') {
      const currentAssignment = await this.getAssignment(
        conversationId,
        conversationType,
        businessOwnerId
      );

      // Check if conversation is available for agent to claim
      // Available = unassigned OR assigned to AI Agent
      const isUnassigned = !currentAssignment;
      const isAssignedToAI = currentAssignment?.assigneeType === 'AI_AGENT';
      const isAvailable = isUnassigned || isAssignedToAI;

      // Agent can only assign if conversation is available
      if (!isAvailable) {
        // Conversation is assigned to another human - agent cannot take over
        return false;
      }

      // Agent can assign to self
      if (targetAssigneeId === userId) {
        return true;
      }

      // Agent cannot assign to other humans
      return false;
    }

    return false;
  }

  /**
   * Check if a user can unassign a conversation
   * 
   * @param userId - The user attempting the action
   * @param userRole - The user's role
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param businessOwnerId - The business owner's user ID
   * @returns True if user can unassign
   * Requirements: 7.1, 7.4
   */
  async canUnassign(
    userId: string,
    userRole: Role,
    conversationId: string,
    conversationType: ConversationType,
    businessOwnerId: string
  ): Promise<boolean> {
    // Admin can unassign any conversation (same as Business Owner)
    if (userRole === 'ADMIN') {
      return true;
    }

    // Business Owner can unassign any conversation (Requirement 7.1)
    if (userRole === 'BUSINESS_OWNER') {
      return true;
    }

    // Agent can only unassign their own conversations
    if (userRole === 'AGENT') {
      const currentAssignment = await this.getAssignment(
        conversationId,
        conversationType,
        businessOwnerId
      );

      // Agent can unassign their own assignment
      if (currentAssignment?.assigneeId === userId) {
        return true;
      }

      // Agent cannot unassign others' conversations (Requirement 7.4)
      return false;
    }

    return false;
  }

  /**
   * Check if AI should respond to a message in a conversation
   * Returns decision based on assignment status and AI configuration
   * 
   * @param conversationId - The conversation ID
   * @param conversationType - The conversation type
   * @param businessOwnerId - The business owner's user ID
   * @returns AI response decision with reason and AI Agent ID if applicable
   * Requirements: 2.1, 2.2, 2.4, 3.1, 3.2, 6.1, 6.2, 6.3, 6.4
   */
  async shouldAIRespond(
    conversationId: string,
    conversationType: ConversationType,
    businessOwnerId: string,
    whatsappAccountId?: string
  ): Promise<AIResponseDecision> {
    // Get current assignment for conversation
    const currentAssignment = await this.getAssignment(
      conversationId,
      conversationType,
      businessOwnerId
    );

    // If assigned to human → return { shouldRespond: false } (Requirement 2.1, 2.2, 6.2)
    if (currentAssignment?.assigneeType === 'HUMAN') {
      return {
        shouldRespond: false,
        reason: 'assigned_to_human',
        aiAgentId: null,
        aiAgentName: null,
      };
    }

    // If assigned to AI Agent → return { shouldRespond: true, aiAgentId } (Requirement 3.1, 6.3)
    if (currentAssignment?.assigneeType === 'AI_AGENT' && currentAssignment.aiAgentId) {
      return {
        shouldRespond: true,
        reason: 'assigned_to_ai',
        aiAgentId: currentAssignment.aiAgentId,
        aiAgentName: currentAssignment.aiAgentName,
      };
    }

    // If unassigned → check AIConfig.enabled and return default agent (Requirement 3.2, 6.4)
    // Uses per-account config if available, falls back to user-level default
    const resolvedConfig = await resolveAIConfig(businessOwnerId, whatsappAccountId);

    // If AI is disabled → skip AI response
    if (!resolvedConfig?.enabled) {
      return {
        shouldRespond: false,
        reason: 'ai_disabled',
        aiAgentId: null,
        aiAgentName: null,
      };
    }

    // If AI is enabled and has active agent → use that agent (Requirement 3.2)
    if (resolvedConfig.activeAgentId) {
      const activeAgent = await prisma.aIAgent.findUnique({
        where: { id: resolvedConfig.activeAgentId },
        select: { id: true, name: true },
      });

      if (activeAgent) {
        return {
          shouldRespond: true,
          reason: 'unassigned_ai_enabled',
          aiAgentId: activeAgent.id,
          aiAgentName: activeAgent.name,
        };
      }
    }

    // AI is enabled but no active agent configured
    return {
      shouldRespond: false,
      reason: 'ai_disabled',
      aiAgentId: null,
      aiAgentName: null,
    };
  }
}

// Export singleton instance
export const assignmentService = new AssignmentService();
