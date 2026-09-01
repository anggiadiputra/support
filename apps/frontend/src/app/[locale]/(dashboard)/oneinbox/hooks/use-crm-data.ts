/**
 * useCRMData Hook
 * Handles CRM data loading, customer details, and customer updates
 */

import { useState, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import { normalizePhoneNumber } from "@/lib/utils"
import type {
  CRMCustomer,
  CRMCustomerDetail,
  PipelineStage,
  UnifiedConversation,
  IGConversation,
  MessengerConversation,
} from "./unified-inbox-types"

interface UseCRMDataOptions {
  userId: string | null
  selectedConversation: UnifiedConversation | null
  loadConversations: () => Promise<void>
}

export function useCRMData({ userId, selectedConversation, loadConversations }: UseCRMDataOptions) {
  const { toast } = useToast()

  // CRM data cache state
  const [crmCustomers, setCrmCustomers] = useState<Map<string, CRMCustomer>>(new Map())
  const [crmCustomersByIgsid, setCrmCustomersByIgsid] = useState<Map<string, CRMCustomer>>(new Map())
  const [crmCustomersByPsid, setCrmCustomersByPsid] = useState<Map<string, CRMCustomer>>(new Map())
  const [pipelineStages, setPipelineStages] = useState<PipelineStage[]>([])
  const [availableTags, setAvailableTags] = useState<string[]>([])
  const [crmDataLoaded, setCrmDataLoaded] = useState(false)

  // Customer panel state
  const [isPanelOpen, setIsPanelOpen] = useState(true)
  const [selectedCustomerDetail, setSelectedCustomerDetail] = useState<CRMCustomerDetail | null>(null)
  const [customerLoading, setCustomerLoading] = useState(false)

  // Load CRM data (customers and pipeline stages) for filtering
  const loadCrmData = useCallback(async () => {
    if (!userId) return

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

    // Try to load cached pipeline stages first for instant display
    try {
      const cachedStages = sessionStorage.getItem('oneinbox_pipeline_stages')
      if (cachedStages) {
        const stages = JSON.parse(cachedStages)
        if (stages.length > 0) {
          setPipelineStages(stages)
        }
      }
    } catch (e) {
      // Ignore cache errors
    }

    try {
      // Fetch customers and pipelines in parallel
      const [customersRes, pipelinesRes] = await Promise.all([
        fetch(`${apiUrl}/api/v1/customers`, { credentials: "include" }),
        fetch(`${apiUrl}/api/v1/crm/pipelines`, { credentials: "include" }),
      ])

      // Process customers
      if (customersRes.ok) {
        const customersResult = await customersRes.json()
        const customers = customersResult.data || []

        // Build customer maps keyed by phoneNumber, instagramIgsid, and messengerPsid for quick lookup
        const customerMap = new Map<string, CRMCustomer>()
        const customerByIgsidMap = new Map<string, CRMCustomer>()
        const customerByPsidMap = new Map<string, CRMCustomer>()
        const allTags = new Set<string>()

        customers.forEach((customer: any) => {
          const crmCustomer: CRMCustomer = {
            id: customer.id,
            phoneNumber: customer.phoneNumber,
            tags: customer.tags || [],
            pipelineStageId: customer.pipelineStageId || null,
            pipelineStage: customer.pipelineStage
              ? {
                id: customer.pipelineStage.id,
                name: customer.pipelineStage.name,
                color: customer.pipelineStage.color,
              }
              : null,
          }

          // Map by phone number for WhatsApp (normalize for consistent matching)
          if (customer.phoneNumber) {
            customerMap.set(normalizePhoneNumber(customer.phoneNumber), crmCustomer)
          }

          // Map by Instagram IGSID for Instagram
          if (customer.instagramIgsid) {
            customerByIgsidMap.set(customer.instagramIgsid, crmCustomer)
          }

          // Map by Messenger PSID for Messenger
          if (customer.messengerPsid) {
            customerByPsidMap.set(customer.messengerPsid, crmCustomer)
          }

          // Extract unique tags
          if (customer.tags && Array.isArray(customer.tags)) {
            customer.tags.forEach((tag: string) => allTags.add(tag))
          }
        })

        setCrmCustomers(customerMap)
        setCrmCustomersByIgsid(customerByIgsidMap)
        setCrmCustomersByPsid(customerByPsidMap)
        setAvailableTags(Array.from(allTags).sort())
      }

      // Process pipelines
      if (pipelinesRes.ok) {
        const pipelinesResult = await pipelinesRes.json()
        const pipelines = pipelinesResult.data || []

        // Extract all stages from all pipelines
        const allStages: PipelineStage[] = []
        pipelines.forEach((pipeline: any) => {
          if (pipeline.stages && Array.isArray(pipeline.stages)) {
            pipeline.stages.forEach((stage: any) => {
              allStages.push({
                id: stage.id,
                name: stage.name,
                color: stage.color || "#000000",
                order: stage.order || 0,
              })
            })
          }
        })

        // Sort by order
        allStages.sort((a, b) => a.order - b.order)
        setPipelineStages(allStages)

        // Cache pipeline stages
        try {
          sessionStorage.setItem('oneinbox_pipeline_stages', JSON.stringify(allStages))
        } catch (e) {
          // Ignore cache errors
        }
      }

      setCrmDataLoaded(true)

      // Cache CRM customers data
      try {
        const crmCache = {
          availableTags: Array.from(availableTags).sort(),
          timestamp: Date.now()
        }
        sessionStorage.setItem('oneinbox_crm_cache', JSON.stringify(crmCache))
      } catch (e) {
        // Ignore cache errors
      }
    } catch (error) {
      console.error("Failed to load CRM data:", error)
      // Continue without CRM data - filters will be disabled
    }
  }, [userId])

  // Load customer detail for panel display
  const loadCustomerDetail = useCallback(async (customerId: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
    setCustomerLoading(true)
    try {
      const response = await fetch(`${apiUrl}/api/v1/customers/${customerId}`, {
        credentials: "include",
      })
      if (!response.ok) {
        throw new Error("Failed to load customer detail")
      }
      const result = await response.json()
      const data = result.data

      const customerDetail: CRMCustomerDetail = {
        id: data.id,
        name: data.name || null,
        phoneNumber: data.phoneNumber,
        email: data.email || null,
        avatar: data.avatar || null,
        tags: data.tags || [],
        pipelineStageId: data.pipelineStageId || null,
        pipelineStage: data.pipelineStage || null,
        notes: (data.notes || []).map((note: any) => ({
          id: note.id,
          content: note.content,
          createdAt: new Date(note.createdAt),
          createdBy: note.createdBy || "",
        })),
        customFields: data.customFields || {},
        createdAt: new Date(data.createdAt),
        updatedAt: new Date(data.updatedAt),
      }

      setSelectedCustomerDetail(customerDetail)
    } catch (error) {
      console.error("Failed to load customer detail:", error)
      setSelectedCustomerDetail(null)
    } finally {
      setCustomerLoading(false)
    }
  }, [])

  // Update customer tags with optimistic UI
  const updateCustomerTags = useCallback(async (customerId: string, tags: string[]) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
    
    // Store previous state for rollback
    const previousCustomerDetail = selectedCustomerDetail
    const previousAvailableTags = [...availableTags]
    
    // Optimistic update - immediately update the UI
    if (selectedCustomerDetail && selectedCustomerDetail.id === customerId) {
      setSelectedCustomerDetail({
        ...selectedCustomerDetail,
        tags
      })
    }
    
    // Add new tags to available tags immediately
    const newTags = tags.filter(t => !availableTags.includes(t))
    if (newTags.length > 0) {
      setAvailableTags([...availableTags, ...newTags].sort())
    }
    
    try {
      const response = await fetch(`${apiUrl}/api/v1/customers/${customerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags }),
      })
      if (!response.ok) {
        throw new Error("Failed to update customer tags")
      }
      // Success - no need to refresh since we already updated optimistically
      return true
    } catch (error) {
      console.error("Failed to update customer tags:", error)
      // Rollback on error
      if (previousCustomerDetail) {
        setSelectedCustomerDetail(previousCustomerDetail)
      }
      setAvailableTags(previousAvailableTags)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update tags",
      })
      return false
    }
  }, [selectedCustomerDetail, availableTags, toast])

  // Update customer pipeline stage with optimistic UI
  const updateCustomerStage = useCallback(async (customerId: string, pipelineStageId: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
    
    // Find the new stage from pipelineStages
    const newStage = pipelineStages.find(s => s.id === pipelineStageId)
    
    // Store previous state for rollback
    const previousCustomerDetail = selectedCustomerDetail
    
    // Optimistic update - immediately update the UI
    if (selectedCustomerDetail && selectedCustomerDetail.id === customerId) {
      setSelectedCustomerDetail({
        ...selectedCustomerDetail,
        pipelineStageId,
        pipelineStage: newStage || null
      })
    }
    
    try {
      const response = await fetch(`${apiUrl}/api/v1/customers/${customerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pipelineStageId }),
      })
      if (!response.ok) {
        throw new Error("Failed to update pipeline stage")
      }
      // Success - no need to refresh since we already updated optimistically
      return true
    } catch (error) {
      console.error("Failed to update pipeline stage:", error)
      // Rollback on error
      if (previousCustomerDetail) {
        setSelectedCustomerDetail(previousCustomerDetail)
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update pipeline stage",
      })
      return false
    }
  }, [pipelineStages, selectedCustomerDetail, toast])

  // Add customer note with optimistic UI
  const addCustomerNote = useCallback(async (customerId: string, content: string) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
    
    // Store previous state for rollback
    const previousCustomerDetail = selectedCustomerDetail
    
    // Create optimistic note
    const optimisticNote = {
      id: 'temp-' + Date.now(),
      content,
      createdAt: new Date(),
      createdBy: userId || ''
    }
    
    // Optimistic update - immediately add the note to UI
    if (selectedCustomerDetail && selectedCustomerDetail.id === customerId) {
      setSelectedCustomerDetail({
        ...selectedCustomerDetail,
        notes: [optimisticNote, ...(selectedCustomerDetail.notes || [])]
      })
    }
    
    try {
      const response = await fetch(`${apiUrl}/api/v1/customers/${customerId}/notes`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      })
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error?.message || "Failed to add note")
      }
      
      // Get the real note from response and replace optimistic one
      const data = await response.json()
      if (selectedCustomerDetail && selectedCustomerDetail.id === customerId && data.data) {
        setSelectedCustomerDetail(prev => {
          if (!prev) return prev
          const notesWithoutOptimistic = (prev.notes || []).filter(n => n.id !== optimisticNote.id)
          return {
            ...prev,
            notes: [data.data, ...notesWithoutOptimistic]
          }
        })
      }
      
      toast({
        title: "Success",
        description: "Note added successfully",
      })
      return true
    } catch (error) {
      console.error("Failed to add customer note:", error)
      // Rollback on error
      if (previousCustomerDetail) {
        setSelectedCustomerDetail(previousCustomerDetail)
      }
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add note",
      })
      return false
    }
  }, [selectedCustomerDetail, userId, toast])

  // Update customer contact info
  const updateCustomerContact = useCallback(async (
    customerId: string,
    updates: { name?: string; email?: string; customFields?: Record<string, string> }
  ) => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
    try {
      const response = await fetch(`${apiUrl}/api/v1/customers/${customerId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
      })
      if (!response.ok) {
        throw new Error("Failed to update contact info")
      }
      // Refresh customer detail
      await loadCustomerDetail(customerId)
      return true
    } catch (error) {
      console.error("Failed to update customer contact:", error)
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to update contact info",
      })
      return false
    }
  }, [loadCustomerDetail, toast])

  // Link customer to Instagram or Messenger conversation
  const linkCustomerToConversation = useCallback(async (customerId: string) => {
    if (!selectedConversation) return false

    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

    // For Instagram conversations, use the link-customer endpoint
    if (selectedConversation.channel === "instagram") {
      const igConversation = selectedConversation.originalData as IGConversation
      try {
        const response = await fetch(`${apiUrl}/api/v1/instagram/conversations/${igConversation.id}/link-customer`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId }),
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error?.message || "Failed to link customer")
        }

        // Refresh customer detail
        await loadCustomerDetail(customerId)

        // Refresh CRM data and conversations
        await loadCrmData()
        await loadConversations()

        toast({
          title: "Success",
          description: "Customer linked successfully",
        })
        return true
      } catch (error: any) {
        console.error("Failed to link customer:", error)
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to link customer",
        })
        return false
      }
    }

    // For Messenger conversations, use the link-customer endpoint
    if (selectedConversation.channel === "messenger") {
      const msgConversation = selectedConversation.originalData as MessengerConversation
      try {
        const response = await fetch(`${apiUrl}/api/v1/messenger/conversations/${msgConversation.id}/link-customer`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ customerId }),
        })
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}))
          throw new Error(errorData.error?.message || "Failed to link customer")
        }

        // Refresh customer detail
        await loadCustomerDetail(customerId)

        // Refresh CRM data and conversations
        await loadCrmData()
        await loadConversations()

        toast({
          title: "Success",
          description: "Customer linked successfully",
        })
        return true
      } catch (error: any) {
        console.error("Failed to link customer:", error)
        toast({
          variant: "destructive",
          title: "Error",
          description: error.message || "Failed to link customer",
        })
        return false
      }
    }

    return false
  }, [selectedConversation, loadCustomerDetail, loadCrmData, loadConversations, toast])

  return {
    // State
    crmCustomers,
    crmCustomersByIgsid,
    crmCustomersByPsid,
    pipelineStages,
    availableTags,
    crmDataLoaded,
    isPanelOpen,
    setIsPanelOpen,
    selectedCustomerDetail,
    setSelectedCustomerDetail,
    customerLoading,
    // Actions
    loadCrmData,
    loadCustomerDetail,
    updateCustomerTags,
    updateCustomerStage,
    addCustomerNote,
    updateCustomerContact,
    linkCustomerToConversation,
  }
}
