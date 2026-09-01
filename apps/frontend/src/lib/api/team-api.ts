/**
 * Team API
 *
 * API functions for team management - members and invitations.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export interface TeamMember {
  id: string
  agentUserId: string | null
  status: 'PENDING' | 'ACTIVE' | 'REMOVED'
  invitedAt: string
  joinedAt: string | null
  agent: {
    id: string
    name: string
    email: string
  } | null
}

export interface Invitation {
  id: string
  email: string
  status: string
  createdAt: string
  expiresAt: string
}

export interface AgentLimit {
  currentCount: number
  limit: number
  tier: string
  canInvite: boolean
}

export interface InviteAgentInput {
  email: string
}

export const teamApi = {
  /**
   * Get all team members
   */
  async getMembers(): Promise<TeamMember[]> {
    const response = await fetch(`${API_URL}/api/v1/team/members`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch team members')
    }

    return result.data || []
  },

  /**
   * Remove a team member
   */
  async removeMember(memberId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/team/members/${memberId}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to remove team member')
    }
  },

  /**
   * Get all pending invitations
   */
  async getInvitations(): Promise<Invitation[]> {
    const response = await fetch(`${API_URL}/api/v1/team/invitations`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch invitations')
    }

    return result.data || []
  },

  /**
   * Send an invitation to an agent
   */
  async inviteAgent(input: InviteAgentInput): Promise<Invitation> {
    const response = await fetch(`${API_URL}/api/v1/team/invitations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(input),
    })

    const result = await response.json()

    if (!response.ok) {
      // Handle specific error codes
      const errorCode = result.error?.code
      if (errorCode === 'AGENT_LIMIT_REACHED') {
        throw new Error('AGENT_LIMIT_REACHED')
      } else if (errorCode === 'INVITATION_EXISTS') {
        throw new Error('An invitation has already been sent to this email')
      } else if (errorCode === 'ALREADY_AGENT') {
        throw new Error('This user is already an agent on your team')
      }
      throw new Error(result.error?.message || 'Failed to send invitation')
    }

    return result.data
  },

  /**
   * Cancel a pending invitation
   */
  async cancelInvitation(invitationId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/team/invitations/${invitationId}`, {
      method: 'DELETE',
      credentials: 'include',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to cancel invitation')
    }
  },

  /**
   * Resend an invitation email
   */
  async resendInvitation(invitationId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/team/invitations/${invitationId}/resend`, {
      method: 'POST',
      credentials: 'include',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to resend invitation')
    }
  },

  /**
   * Get agent limit info
   */
  async getAgentLimit(): Promise<AgentLimit> {
    const response = await fetch(`${API_URL}/api/v1/team/limit`, {
      method: 'GET',
      credentials: 'include',
    })

    const result = await response.json()

    if (!response.ok) {
      throw new Error(result.error?.message || 'Failed to fetch agent limit')
    }

    return result.data
  },
}
