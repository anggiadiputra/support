interface InsightsAvailabilityInput {
  isLoading: boolean
  connectionStatuses: string[]
}

interface InsightsAvailability {
  enabled: boolean
  showNoWaba: boolean
}

export function getInsightsAvailability({
  isLoading,
  connectionStatuses,
}: InsightsAvailabilityInput): InsightsAvailability {
  if (isLoading) {
    return { enabled: false, showNoWaba: false }
  }

  const hasConnectedWaba = connectionStatuses.some(
    (status) => status === 'connected',
  )

  return {
    enabled: hasConnectedWaba,
    showNoWaba: !hasConnectedWaba,
  }
}
