import { prisma } from '../utils/database.js';
import { invalidateUserCache } from '../utils/cache.js';

/**
 * Team member status enum (mirrors Prisma enum)
 */
export type TeamMemberStatus = 'PENDING' | 'ACTIVE' | 'REMOVED';

/**
 * Team member with agent details
 */
export interface TeamMemberWithAgent {
  id: string;
  businessOwnerId: string;
  agentUserId: string | null;
  status: TeamMemberStatus;
  invitedAt: Date;
  joinedAt: Date | null;
  removedAt: Date | null;
  agent: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
}

/**
 * TeamService
 * 
 * Handles team member management for Business Owners.
 * Manages the relationship between Business Owners and their Agents.
 * 
 * Requirements: 1.1, 4.3, 6.1, 6.2
 */
export class TeamService {
  /**
   * Get all team members for a business owner
   * 
   * @param businessOwnerId - The business owner's user ID
   * @returns Array of team members with agent details
   * Requirements: 1.1, 4.1
   */
  async getTeamMembers(businessOwnerId: string): Promise<TeamMemberWithAgent[]> {
    const teamMembers = await prisma.teamMember.findMany({
      where: {
        businessOwnerId,
        status: { not: 'REMOVED' },
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: {
        invitedAt: 'desc',
      },
    });

    return teamMembers;
  }

  /**
   * Get count of active agents for a business owner
   * Used for subscription tier limit checking
   * 
   * @param businessOwnerId - The business owner's user ID
   * @returns Number of active agents
   * Requirements: 7.1
   */
  async getActiveAgentCount(businessOwnerId: string): Promise<number> {
    return prisma.teamMember.count({
      where: {
        businessOwnerId,
        status: 'ACTIVE',
      },
    });
  }

  /**
   * Remove an agent from the team
   * Sets status to REMOVED and records timestamp
   * 
   * @param businessOwnerId - The business owner's user ID
   * @param teamMemberId - The team member record ID
   * @throws Error if team member not found or doesn't belong to business owner
   * Requirements: 4.3, 6.4
   */
  async removeAgent(businessOwnerId: string, teamMemberId: string): Promise<void> {
    // Find the team member and verify ownership
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        id: teamMemberId,
        businessOwnerId,
        status: 'ACTIVE',
      },
    });

    if (!teamMember) {
      throw new Error('AGENT_NOT_FOUND');
    }

    // Update status to REMOVED and restore the user's role atomically.
    // Without restoring the role, a removed agent keeps role=AGENT with no
    // ACTIVE membership, which locks them out of all data/WebSocket routes
    // (resolveContext returns 403 "Agent not associated with any business").
    await prisma.$transaction(async (tx) => {
      await tx.teamMember.update({
        where: { id: teamMemberId },
        data: {
          status: 'REMOVED',
          removedAt: new Date(),
        },
      });

      if (teamMember.agentUserId) {
        // Only revert to BUSINESS_OWNER if the user is not still an ACTIVE
        // agent of some other team (defensive guard for future multi-team).
        const stillActive = await tx.teamMember.findFirst({
          where: {
            agentUserId: teamMember.agentUserId,
            status: 'ACTIVE',
          },
          select: { id: true },
        });

        if (!stillActive) {
          await tx.user.update({
            where: { id: teamMember.agentUserId },
            data: { role: 'BUSINESS_OWNER' },
          });
        }
      }
    });

    // Invalidate all sessions for the removed agent
    if (teamMember.agentUserId) {
      await this.invalidateAgentSessions(teamMember.agentUserId);
    }
  }

  /**
   * Get the business owner ID for an agent
   * Used for context resolution in API requests
   * 
   * @param agentUserId - The agent's user ID
   * @returns Business owner ID or null if not found
   * Requirements: 6.1, 6.2
   */
  async getBusinessOwnerIdForAgent(agentUserId: string): Promise<string | null> {
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        agentUserId,
        status: 'ACTIVE',
      },
      select: {
        businessOwnerId: true,
      },
    });

    return teamMember?.businessOwnerId ?? null;
  }

  /**
   * Check if a user is an agent of a specific business owner
   * 
   * @param agentUserId - The agent's user ID
   * @param businessOwnerId - The business owner's user ID
   * @returns True if the user is an active agent of the business owner
   * Requirements: 6.1
   */
  async isAgentOf(agentUserId: string, businessOwnerId: string): Promise<boolean> {
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        agentUserId,
        businessOwnerId,
        status: 'ACTIVE',
      },
    });

    return teamMember !== null;
  }

  /**
   * Invalidate all sessions for an agent
   * Called when agent is removed from team
   * 
   * @param agentUserId - The agent's user ID
   * Requirements: 6.4
   */
  private async invalidateAgentSessions(agentUserId: string): Promise<void> {
    // Delete all sessions for the agent from database
    await prisma.session.deleteMany({
      where: {
        userId: agentUserId,
      },
    });
    
    // Also invalidate the user cache so stale businessOwnerId is not used
    await invalidateUserCache(agentUserId);
  }

  /**
   * Get team member by ID
   * 
   * @param teamMemberId - The team member record ID
   * @param businessOwnerId - The business owner's user ID (for authorization)
   * @returns Team member or null
   */
  async getTeamMemberById(
    teamMemberId: string,
    businessOwnerId: string
  ): Promise<TeamMemberWithAgent | null> {
    const teamMember = await prisma.teamMember.findFirst({
      where: {
        id: teamMemberId,
        businessOwnerId,
      },
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });

    return teamMember;
  }
}

// Export singleton instance
export const teamService = new TeamService();
