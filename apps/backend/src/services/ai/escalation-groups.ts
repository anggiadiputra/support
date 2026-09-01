/**
 * Escalation Keyword Groups Service
 *
 * Manages keyword groups that map specific keywords to agents.
 * When a customer uses a keyword from a group, the conversation
 * is assigned to the group's designated agent.
 */

import { prisma } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';

// ============================================================================
// Types
// ============================================================================

export interface EscalationKeywordGroup {
  id: string;
  whatsappAccountAIConfigId: string;
  name: string;
  keywords: string[];
  assignedAgentId: string;
  assignedAgent?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateEscalationGroupInput {
  whatsappAccountAIConfigId: string;
  name: string;
  keywords: string[];
  assignedAgentId: string;
}

export interface UpdateEscalationGroupInput {
  name?: string;
  keywords?: string[];
  assignedAgentId?: string;
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Get all escalation keyword groups for a WhatsApp account AI config
 */
export async function getEscalationGroups(
  whatsappAccountAIConfigId: string
): Promise<EscalationKeywordGroup[]> {
  try {
    const groups = await prisma.escalationKeywordGroup.findMany({
      where: { whatsappAccountAIConfigId },
      include: {
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return groups.map((group) => ({
      ...group,
      keywords: group.keywords as string[],
    }));
  } catch (error) {
    logger.error('Failed to get escalation groups', {
      whatsappAccountAIConfigId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Get escalation groups by WhatsApp account ID
 * This is used during message processing when we only have the WA account ID
 */
export async function getEscalationGroupsByWhatsAppAccountId(
  whatsappAccountId: string,
  userId: string
): Promise<EscalationKeywordGroup[]> {
  try {
    // First find the config
    const config = await prisma.whatsAppAccountAIConfig.findUnique({
      where: {
        userId_whatsappAccountId: {
          userId,
          whatsappAccountId,
        },
      },
      select: { id: true },
    });

    if (!config) {
      return [];
    }

    return getEscalationGroups(config.id);
  } catch (error) {
    logger.error('Failed to get escalation groups by WA account', {
      whatsappAccountId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Create a new escalation keyword group
 */
export async function createEscalationGroup(
  input: CreateEscalationGroupInput
): Promise<EscalationKeywordGroup> {
  try {
    // Normalize keywords (lowercase, trim)
    const normalizedKeywords = input.keywords.map((k) => k.toLowerCase().trim());

    const group = await prisma.escalationKeywordGroup.create({
      data: {
        whatsappAccountAIConfigId: input.whatsappAccountAIConfigId,
        name: input.name,
        keywords: normalizedKeywords,
        assignedAgentId: input.assignedAgentId,
      },
      include: {
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.info('Escalation group created', {
      groupId: group.id,
      name: group.name,
      keywordCount: normalizedKeywords.length,
      assignedAgentId: input.assignedAgentId,
    });

    return {
      ...group,
      keywords: group.keywords as string[],
    };
  } catch (error) {
    logger.error('Failed to create escalation group', {
      input,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Update an escalation keyword group
 */
export async function updateEscalationGroup(
  groupId: string,
  input: UpdateEscalationGroupInput
): Promise<EscalationKeywordGroup> {
  try {
    const updateData: {
      name?: string;
      keywords?: string[];
      assignedAgentId?: string;
    } = {};

    if (input.name !== undefined) {
      updateData.name = input.name;
    }

    if (input.keywords !== undefined) {
      updateData.keywords = input.keywords.map((k) => k.toLowerCase().trim());
    }

    if (input.assignedAgentId !== undefined) {
      updateData.assignedAgentId = input.assignedAgentId;
    }

    const group = await prisma.escalationKeywordGroup.update({
      where: { id: groupId },
      data: updateData,
      include: {
        assignedAgent: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    logger.info('Escalation group updated', { groupId, updates: Object.keys(input) });

    return {
      ...group,
      keywords: group.keywords as string[],
    };
  } catch (error) {
    logger.error('Failed to update escalation group', {
      groupId,
      input,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Delete an escalation keyword group
 */
export async function deleteEscalationGroup(groupId: string): Promise<void> {
  try {
    await prisma.escalationKeywordGroup.delete({
      where: { id: groupId },
    });

    logger.info('Escalation group deleted', { groupId });
  } catch (error) {
    logger.error('Failed to delete escalation group', {
      groupId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Check if a message matches any keyword group and return the matched group
 * Returns null if no match found
 */
export async function findMatchingKeywordGroup(
  message: string,
  whatsappAccountId: string,
  userId: string
): Promise<EscalationKeywordGroup | null> {
  try {
    logger.debug('Escalation: Checking keyword groups', { whatsappAccountId, userId, messagePreview: message.substring(0, 50) });
    
    const groups = await getEscalationGroupsByWhatsAppAccountId(whatsappAccountId, userId);

    logger.debug('Escalation: Found groups', { count: groups.length, groups: groups.map(g => ({ name: g.name, keywords: g.keywords })) });

    if (groups.length === 0) {
      return null;
    }

    const messageLower = message.toLowerCase();

    for (const group of groups) {
      for (const keyword of group.keywords) {
        if (messageLower.includes(keyword)) {
          logger.info('Matched escalation keyword group', {
            groupId: group.id,
            groupName: group.name,
            matchedKeyword: keyword,
            assignedAgentId: group.assignedAgentId,
          });
          return group;
        }
      }
    }

    return null;
  } catch (error) {
    logger.error('Failed to find matching keyword group', {
      whatsappAccountId,
      userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}
