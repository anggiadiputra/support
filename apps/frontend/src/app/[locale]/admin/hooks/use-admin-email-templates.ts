"use client"

import { useState, useEffect, useCallback } from "react"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

export interface EmailTemplateListItem {
  id: string
  slug: string
  name: string
  description: string | null
  variables: string[]
  isActive: boolean
  updatedAt: string
}

export interface EmailTemplateData {
  id: string
  slug: string
  name: string
  description: string | null
  subject: string
  htmlBody: string
  textBody: string
  variables: string[]
  isActive: boolean
  updatedAt: string
}

export interface EmailTemplatePreview {
  subject: string
  html: string
  text: string
}

export function useAdminEmailTemplates() {
  const [templates, setTemplates] = useState<EmailTemplateListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchTemplates = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/email-templates`, {
        credentials: "include",
      })

      if (!response.ok) {
        throw new Error("Failed to fetch email templates")
      }

      const result = await response.json()
      if (result.success) {
        setTemplates(result.data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const getTemplate = useCallback(async (slug: string): Promise<EmailTemplateData | null> => {
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/email-templates/${slug}`, {
        credentials: "include",
      })

      if (!response.ok) return null

      const result = await response.json()
      return result.success ? result.data : null
    } catch {
      return null
    }
  }, [])

  const updateTemplate = useCallback(
    async (
      slug: string,
      data: { subject: string; htmlBody: string; textBody: string; isActive: boolean }
    ): Promise<{ success: boolean; message: string }> => {
      try {
        const response = await fetch(`${API_URL}/api/v1/admin/email-templates/${slug}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        })

        const result = await response.json()

        if (!response.ok) {
          return { success: false, message: result.error?.message || "Failed to update template" }
        }

        await fetchTemplates()
        return { success: true, message: result.message || "Template updated" }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : "An error occurred" }
      }
    },
    [fetchTemplates]
  )

  const resetTemplate = useCallback(
    async (slug: string): Promise<{ success: boolean; message: string }> => {
      try {
        const response = await fetch(`${API_URL}/api/v1/admin/email-templates/${slug}/reset`, {
          method: "POST",
          credentials: "include",
        })

        const result = await response.json()

        if (!response.ok) {
          return { success: false, message: result.error?.message || "Failed to reset template" }
        }

        await fetchTemplates()
        return { success: true, message: result.message || "Template reset to default" }
      } catch (err) {
        return { success: false, message: err instanceof Error ? err.message : "An error occurred" }
      }
    },
    [fetchTemplates]
  )

  const previewTemplate = useCallback(
    async (
      slug: string,
      data: { subject: string; htmlBody: string; textBody: string }
    ): Promise<EmailTemplatePreview | null> => {
      try {
        const response = await fetch(`${API_URL}/api/v1/admin/email-templates/${slug}/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(data),
        })

        const result = await response.json()
        return result.success ? result.data : null
      } catch {
        return null
      }
    },
    []
  )

  const seedTemplates = useCallback(async (): Promise<{ success: boolean; message: string }> => {
    try {
      const response = await fetch(`${API_URL}/api/v1/admin/email-templates/seed`, {
        method: "POST",
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        return { success: false, message: result.error?.message || "Failed to seed templates" }
      }

      await fetchTemplates()
      return { success: true, message: result.message || "Templates seeded" }
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : "An error occurred" }
    }
  }, [fetchTemplates])

  return {
    templates,
    isLoading,
    error,
    refetch: fetchTemplates,
    getTemplate,
    updateTemplate,
    resetTemplate,
    previewTemplate,
    seedTemplates,
  }
}
