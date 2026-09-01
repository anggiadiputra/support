import { cookies } from 'next/headers'
import { AnalyticsData } from './analytics-api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export async function getAnalyticsServer(timeRange: string = '7d'): Promise<AnalyticsData | null> {
    try {
        const cookieStore = await cookies()
        const response = await fetch(
            `${API_URL}/api/v1/analytics?timeRange=${timeRange}`,
            {
                headers: {
                    Cookie: cookieStore.toString(),
                },
                cache: 'no-store', // Selalu fetch data terbaru, jangan cache di server Next.js secara agresif
            }
        )

        if (!response.ok) {
            console.error(`Failed to fetch analytics: ${response.status} ${response.statusText}`)
            return null
        }

        const result = await response.json()
        return result.data as AnalyticsData
    } catch (error) {
        console.error("Failed to fetch analytics server-side:", error)
        return null
    }
}
