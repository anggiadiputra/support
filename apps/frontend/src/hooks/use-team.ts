/**
 * Team Query Hooks
 *
 * TanStack Query hooks for team management - members and invitations.
 * Uses hierarchical query keys and configured cache times for optimal performance.
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  teamApi,
  type TeamMember,
  type Invitation,
  type AgentLimit,
  type InviteAgentInput,
} from '@/lib/api/team-api'
import { queryKeys } from '@/lib/query-keys'
import { CACHE_TIMES } from '@/lib/cache-config'

/**
 * Hook for fetching team members
 *
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useTeamMembers(enabled: boolean = true) {
  return useQuery<TeamMember[], Error>({
    queryKey: queryKeys.team.members(),
    queryFn: () => teamApi.getMembers(),
    ...CACHE_TIMES.team,
    enabled,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching pending invitations
 *
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useTeamInvitations(enabled: boolean = true) {
  return useQuery<Invitation[], Error>({
    queryKey: queryKeys.team.invitations(),
    queryFn: () => teamApi.getInvitations(),
    ...CACHE_TIMES.team,
    enabled,
    placeholderData: (previousData) => previousData,
  })
}

/**
 * Hook for fetching agent limit
 *
 * @param enabled - Whether the query should be enabled (default: true)
 */
export function useAgentLimit(enabled: boolean = true) {
  return useQuery<AgentLimit, Error>({
    queryKey: [...queryKeys.team.all, 'limit'],
    queryFn: () => teamApi.getAgentLimit(),
    ...CACHE_TIMES.team,
    enabled,
  })
}

/**
 * Hook for inviting an agent
 *
 * Invalidates both invitations and limit queries on success.
 */
export function useInviteAgent() {
  const queryClient = useQueryClient()

  return useMutation<Invitation, Error, InviteAgentInput>({
    mutationFn: (input) => teamApi.inviteAgent(input),
    onSuccess: (newInvitation) => {
      // Add new invitation to cache
      queryClient.setQueryData<Invitation[]>(queryKeys.team.invitations(), (old) => {
        if (!old) return [newInvitation]
        return [newInvitation, ...old]
      })
      // Invalidate limit to refresh count
      queryClient.invalidateQueries({ queryKey: [...queryKeys.team.all, 'limit'] })
    },
  })
}

/**
 * Hook for removing a team member
 *
 * Uses optimistic updates for immediate UI feedback.
 */
export function useRemoveTeamMember() {
  const queryClient = useQueryClient()

  return useMutation<
    void,
    Error,
    string,
    { previousMembers: TeamMember[] | undefined }
  >({
    mutationFn: (memberId) => teamApi.removeMember(memberId),
    onMutate: async (memberId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.team.members() })

      // Snapshot previous value
      const previousMembers = queryClient.getQueryData<TeamMember[]>(queryKeys.team.members())

      // Optimistically remove member
      queryClient.setQueryData<TeamMember[]>(queryKeys.team.members(), (old) => {
        if (!old) return old
        return old.filter((member) => member.id !== memberId)
      })

      return { previousMembers }
    },
    onError: (_error, _memberId, context) => {
      // Rollback on error
      if (context?.previousMembers) {
        queryClient.setQueryData(queryKeys.team.members(), context.previousMembers)
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.team.all })
    },
  })
}

/**
 * Hook for cancelling an invitation
 *
 * Uses optimistic updates for immediate UI feedback.
 */
export function useCancelInvitation() {
  const queryClient = useQueryClient()

  return useMutation<
    void,
    Error,
    string,
    { previousInvitations: Invitation[] | undefined }
  >({
    mutationFn: (invitationId) => teamApi.cancelInvitation(invitationId),
    onMutate: async (invitationId) => {
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: queryKeys.team.invitations() })

      // Snapshot previous value
      const previousInvitations = queryClient.getQueryData<Invitation[]>(queryKeys.team.invitations())

      // Optimistically remove invitation
      queryClient.setQueryData<Invitation[]>(queryKeys.team.invitations(), (old) => {
        if (!old) return old
        return old.filter((inv) => inv.id !== invitationId)
      })

      return { previousInvitations }
    },
    onError: (_error, _invitationId, context) => {
      // Rollback on error
      if (context?.previousInvitations) {
        queryClient.setQueryData(queryKeys.team.invitations(), context.previousInvitations)
      }
    },
    onSettled: () => {
      // Always refetch after mutation
      queryClient.invalidateQueries({ queryKey: queryKeys.team.all })
    },
  })
}

/**
 * Hook for resending an invitation
 */
export function useResendInvitation() {
  return useMutation<void, Error, string>({
    mutationFn: (invitationId) => teamApi.resendInvitation(invitationId),
  })
}
