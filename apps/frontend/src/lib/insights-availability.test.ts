import { describe, expect, it } from 'vitest'
import { getInsightsAvailability } from './insights-availability'

describe('Insights availability', () => {
  it('waits for the WABA account query before enabling Insights', () => {
    expect(
      getInsightsAvailability({
        isLoading: true,
        connectionStatuses: ['connected'],
      }),
    ).toEqual({ enabled: false, showNoWaba: false })
  })

  it('shows the connect-WABA state when no connected account exists', () => {
    expect(
      getInsightsAvailability({
        isLoading: false,
        connectionStatuses: ['disconnected'],
      }),
    ).toEqual({ enabled: false, showNoWaba: true })
  })

  it('enables Insights for a connected WABA without requiring a selected phone number', () => {
    expect(
      getInsightsAvailability({
        isLoading: false,
        connectionStatuses: ['connected'],
      }),
    ).toEqual({ enabled: true, showNoWaba: false })
  })
})
