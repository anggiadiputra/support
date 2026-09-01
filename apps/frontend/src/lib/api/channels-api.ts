const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

/**
 * Channel Status Settings
 * Used to determine which channels are enabled in the sidebar
 */
export interface ChannelStatus {
  instagram: boolean
  messenger: boolean
}

/**
 * Default channel status (all disabled)
 */
export const DEFAULT_CHANNEL_STATUS: ChannelStatus = {
  instagram: false,
  messenger: false,
}

export const channelsApi = {
  /**
   * Fetch public channel status (no auth required)
   * Used by sidebar to show/hide channel links
   */
  async getStatus(): Promise<ChannelStatus> {
    try {
      const response = await fetch(`${API_URL}/api/v1/channels/status`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        // Return defaults on error
        return DEFAULT_CHANNEL_STATUS
      }

      const result = await response.json()

      if (!result.success) {
        return DEFAULT_CHANNEL_STATUS
      }

      return result.data
    } catch {
      // Return defaults on network error
      return DEFAULT_CHANNEL_STATUS
    }
  },
}
