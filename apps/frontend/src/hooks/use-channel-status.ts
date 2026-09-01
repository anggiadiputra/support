import { useQuery } from "@tanstack/react-query"
import {
  channelsApi,
  DEFAULT_CHANNEL_STATUS,
  type ChannelStatus,
} from "@/lib/api/channels-api"

export interface UseChannelStatusReturn {
  channelStatus: ChannelStatus
  instagramEnabled: boolean
  messengerEnabled: boolean
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

/**
 * Hook to fetch and cache channel enabled status
 * 
 * - Fetches from /api/v1/channels/status endpoint
 * - Caches for 60 seconds (staleTime)
 * - Returns defaults on error
 * - Used by sidebar to show/hide Instagram and Messenger links
 */
export function useChannelStatus(): UseChannelStatusReturn {
  const {
    data,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["channel-status"],
    queryFn: channelsApi.getStatus,
    staleTime: 60 * 1000, // 60 seconds cache
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
    retry: 1,
    refetchOnWindowFocus: false,
  })

  const channelStatus = data ?? DEFAULT_CHANNEL_STATUS

  return {
    channelStatus,
    instagramEnabled: channelStatus.instagram,
    messengerEnabled: channelStatus.messenger,
    isLoading,
    error: error as Error | null,
    refetch,
  }
}
