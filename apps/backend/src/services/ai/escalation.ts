/**
 * Escalation Helper Service
 *
 * Detects escalation keywords in messages and optionally auto-assigns to human queue.
 * Used by AI chatbot to detect when a customer wants to speak with a human agent.
 *
 * Supports two modes:
 * 1. General escalation keywords - AI stops, optionally moves to human queue
 * 2. Keyword groups - AI stops and assigns to specific agent based on keyword match
 */

import { assignmentService } from '../assignment-service.js';
import type { ConversationType } from '@prisma/client';
import { logger } from '../../utils/logger.js';
import { findMatchingKeywordGroup, type EscalationKeywordGroup } from './escalation-groups.js';
import { notificationService } from '../notification-service.js';

/**
 * Result of escalation keyword check
 */
export interface EscalationResult {
  shouldEscalate: boolean;
  matchedKeyword?: string; // The keyword that triggered escalation
  matchedGroup?: EscalationKeywordGroup; // The keyword group that matched (if any)
}

/**
 * Configuration for escalation behavior
 */
export interface EscalationConfig {
  keywords: string[] | null | undefined; // List of escalation keywords
  autoAssign: boolean; // Whether to auto-assign to human queue
}

/**
 * Check if message contains escalation keywords
 *
 * @param message - The incoming message text
 * @param keywords - Array of escalation keywords (can be null/undefined)
 * @returns EscalationResult with shouldEscalate and matchedKeyword
 *
 * @example
 * ```typescript
 * const result = checkEscalation("Saya mau bicara dengan cs", ["bicara dengan cs", "human agent"]);
 * // result: { shouldEscalate: true, matchedKeyword: "bicara dengan cs" }
 * ```
 */
export function checkEscalation(
  message: string,
  keywords: string[] | null | undefined
): EscalationResult {
  // If keywords is null/undefined/empty → return { shouldEscalate: false }
  if (!keywords || keywords.length === 0) {
    return { shouldEscalate: false };
  }

  // Convert message to lowercase for case-insensitive matching
  const lowerMessage = message.toLowerCase();

  // Check if any keyword is found in the message
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase().trim();

    // Skip empty keywords
    if (!lowerKeyword) {
      continue;
    }

    // Use includes() for phrase matching (e.g., "bicara dengan cs")
    if (lowerMessage.includes(lowerKeyword)) {
      return {
        shouldEscalate: true,
        matchedKeyword: keyword,
      };
    }
  }

  // No keyword matched
  return { shouldEscalate: false };
}

/**
 * Check escalation with keyword groups support
 *
 * Checks both:
 * 1. Keyword groups (first priority) - assigns to specific agent
 * 2. General escalation keywords - moves to unassigned queue
 *
 * @param message - The incoming message text
 * @param keywords - General escalation keywords (can be null)
 * @param whatsappAccountId - The WhatsApp account ID
 * @param userId - The business owner ID
 * @returns EscalationResult with group info if matched
 */
export async function checkEscalationWithGroups(
  message: string,
  keywords: string[] | null | undefined,
  whatsappAccountId: string,
  userId: string
): Promise<EscalationResult> {
  // First, check keyword groups (higher priority - specific agent assignment)
  const matchedGroup = await findMatchingKeywordGroup(message, whatsappAccountId, userId);

  if (matchedGroup) {
    return {
      shouldEscalate: true,
      matchedKeyword: matchedGroup.keywords.find((k) =>
        message.toLowerCase().includes(k.toLowerCase())
      ),
      matchedGroup,
    };
  }

  // Fall back to general escalation keywords
  return checkEscalation(message, keywords);
}

/**
 * Handle escalation auto-assign
 * Sets conversation assignment to HUMAN (unassigned queue)
 *
 * This unassigns the conversation from AI, making it available
 * for human agents to pick up from the unassigned queue.
 *
 * @param conversationId - The conversation ID
 * @param conversationType - 'WHATSAPP' or 'INSTAGRAM'
 * @param userId - The user ID (business owner ID)
 *
 * @example
 * ```typescript
 * await handleEscalationAssign("conv-123", "WHATSAPP", "user-456");
 * // Conversation is now unassigned and available for human agents
 * ```
 */
export async function handleEscalationAssign(
  conversationId: string,
  conversationType: 'WHATSAPP' | 'INSTAGRAM',
  userId: string
): Promise<void> {
  try {
    // Unassign the conversation to move it to human queue
    // This removes any AI assignment and makes it available for human agents
    await assignmentService.unassignConversation(
      conversationId,
      conversationType as ConversationType,
      userId, // unassignedById - system action on behalf of user
      userId // businessOwnerId
    );

    logger.info('Escalation: Conversation moved to human queue', {
      conversationId,
      conversationType,
      userId,
    });
  } catch (error) {
    // If conversation is not assigned, that's fine - it's already in human queue
    if (error instanceof Error && error.message === 'Conversation is not currently assigned') {
      logger.debug('Escalation: Conversation already in human queue', {
        conversationId,
        conversationType,
      });
      return;
    }

    // Log and re-throw other errors
    logger.error('Escalation: Failed to move conversation to human queue', {
      conversationId,
      conversationType,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Handle escalation with specific agent assignment
 * Assigns conversation to the specified agent and sends notification
 *
 * @param conversationId - The conversation ID
 * @param conversationType - 'WHATSAPP' or 'INSTAGRAM'
 * @param userId - The business owner ID
 * @param matchedGroup - The matched keyword group with agent info
 * @param customerName - Customer name for notification (optional)
 */
export async function handleEscalationAssignToAgent(
  conversationId: string,
  conversationType: 'WHATSAPP' | 'INSTAGRAM',
  userId: string,
  matchedGroup: EscalationKeywordGroup,
  matchedKeyword: string,
  customerName?: string
): Promise<void> {
  try {
    // Assign conversation to the specific agent with escalation info
    await assignmentService.assignConversation(
      conversationId,
      conversationType as ConversationType,
      matchedGroup.assignedAgentId,
      userId, // assignedById
      userId, // businessOwnerId
      {
        keywordGroup: matchedGroup.name,
        keyword: matchedKeyword,
      }
    );

    logger.info('Escalation: Conversation assigned to specific agent', {
      conversationId,
      conversationType,
      groupName: matchedGroup.name,
      assignedAgentId: matchedGroup.assignedAgentId,
      assignedAgentName: matchedGroup.assignedAgent?.name,
    });

    // Send notification to the assigned agent
    logger.debug('Escalation: Creating notification for agent', { agentId: matchedGroup.assignedAgentId });
    try {
      await notificationService.createEscalationNotification(
        matchedGroup.assignedAgentId,
        conversationId,
        conversationType,
        matchedGroup.name,
        customerName
      );
      logger.debug('Escalation: Notification created successfully');
    } catch (notifError) {
      logger.error('Escalation: Failed to create notification', { error: notifError instanceof Error ? notifError.message : 'Unknown error' });
    }
  } catch (error) {
    logger.error('Escalation: Failed to assign conversation to agent', {
      conversationId,
      conversationType,
      groupId: matchedGroup.id,
      groupName: matchedGroup.name,
      assignedAgentId: matchedGroup.assignedAgentId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
