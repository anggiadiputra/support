const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

/**
 * External Link for sidebar
 */
export interface ExternalLink {
  label: string
  url: string
}

/**
 * Branding Settings
 * Requirements: 1.1, 2.1
 */
export interface BrandingSettings {
  websiteName: string
  logoUrl: string
  supportEmail: string
  supportWhatsapp: string
  termsUrl: string
  privacyUrl: string
  n8nPackageName: string
  externalLinks: ExternalLink[]
}

/**
 * Get default app name from environment
 */
const getDefaultAppName = () => process.env.NEXT_PUBLIC_APP_NAME || 'Messaging Platform'

/**
 * Default branding values (uses env for app name)
 */
export const DEFAULT_BRANDING: BrandingSettings = {
  websiteName: getDefaultAppName(),
  logoUrl: '',
  supportEmail: 'support@yourdomain.com',
  supportWhatsapp: '+6281234567890',
  termsUrl: 'https://yourdomain.com/terms',
  privacyUrl: 'https://yourdomain.com/privacy',
  n8nPackageName: '@kichat/n8n-nodes-kirimchat',
  externalLinks: [],
}

export const brandingApi = {
  /**
   * Fetch public branding settings (no auth required)
   * Requirements: 7.1, 7.2
   */
  async get(): Promise<BrandingSettings> {
    const response = await fetch(`${API_URL}/api/v1/branding`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      // Return defaults on error
      return DEFAULT_BRANDING
    }

    const result = await response.json()

    if (!result.success) {
      return DEFAULT_BRANDING
    }

    // Ensure externalLinks is always an array
    return {
      ...DEFAULT_BRANDING,
      ...result.data,
      externalLinks: Array.isArray(result.data?.externalLinks) ? result.data.externalLinks : [],
    }
  },
}
