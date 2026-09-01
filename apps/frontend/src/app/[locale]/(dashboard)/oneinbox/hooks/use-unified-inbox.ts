/**
 * useUnifiedInbox Hook
 * Combines WhatsApp and Instagram conversations into a unified inbox
 * with real-time WebSocket updates and smart polling fallback
 * 
 * This hook composes several smaller hooks for better maintainability:
 * - useCRMData: CRM data loading and customer management
 * - useAssignment: Conversation assignment management
 * - useWhatsAppMessaging: WhatsApp message sending
 * - useInstagramMessaging: Instagram message sending
 * - useMessengerMessaging: Messenger message sending
 * - useConversationFilters: Filtering logic
 * - useWebSocketHandlers: WebSocket event handlers
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { messagesApi } from "@/lib/api/messages-api"
import { wabaApi } from "@/lib/api/waba"
import { instagramApi, type IGConversation, type InstagramAccount } from "@/lib/api/instagram"
import { messengerApi, type MessengerConversation, type FacebookPage } from "@/lib/api/messenger"
import { useToast } from "@/hooks/use-toast"
import { useBusinessAccount } from "@/hooks/use-business-account"
import { fetchWindowStatus, type WindowStatus } from "@/lib/window-utils"
import { useWebSocket } from "@/hooks/use-websocket"
import type { MessageStatusEvent } from "@/hooks/use-websocket"
import type { Customer } from "../../messages/hooks/use-chat"
import {
  type UnifiedConversation,
  type CRMCustomer,
  transformWhatsAppToUnified,
  transformInstagramToUnified,
  transformMessengerToUnified,
} from "../types/unified-inbox"
import { normalizePhoneNumber } from "@/lib/utils"

// Import composed hooks
import { useCRMData } from "./use-crm-data"
import { useAssignment } from "./use-assignment"
import { useWhatsAppMessaging } from "./use-whatsapp-messaging"
import { useInstagramMessaging } from "./use-instagram-messaging"
import { useMessengerMessaging } from "./use-messenger-messaging"
import { useConversationFilters } from "./use-conversation-filters"
import { useWebSocketHandlers } from "./use-websocket-handlers"

export function useUnifiedInbox() {
  // Core state
  const [conversations, setConversations] = useState<UnifiedConversation[]>([])
  const [selectedConversation, setSelectedConversation] = useState<UnifiedConversation | null>(null)
  const [loading, setLoading] = useState(false)
  const [waWindowStatus, setWaWindowStatus] = useState<WindowStatus | null>(null)

  // WhatsApp pagination state for infinite scroll
  const [waPaginationCursor, setWaPaginationCursor] = useState<string | null>(null)
  const [waHasMore, setWaHasMore] = useState(false)
  const [isLoadingMore, setIsLoadingMore] = useState(false)

  // Track tab visibility for smart polling
  const [isTabVisible, setIsTabVisible] = useState(true)

  // Multi-account state for filters
  const [instagramAccounts, setInstagramAccounts] = useState<InstagramAccount[]>([])
  const [facebookPages, setFacebookPages] = useState<FacebookPage[]>([])
  const [whatsappPhoneNumbers, setWhatsappPhoneNumbers] = useState<{ id: string; phoneNumberId: string; displayPhoneNumber: string }[]>([])

  const { userId, isLoading: isLoadingAccount } = useBusinessAccount()
  const { toast } = useToast()

  // Refs for stable function references (avoid circular dependencies)
  const loadConversationsRef = useRef<() => Promise<void>>(() => Promise.resolve())

  // Initialize CRM Data hook with stable loadConversations reference
  const crmData = useCRMData({
    userId,
    selectedConversation,
    loadConversations: useCallback(async () => { 
      await loadConversationsRef.current() 
    }, []),
  })

  // Initialize Assignment hook
  const assignment = useAssignment({
    conversations,
    setConversations,
    setSelectedConversation,
  })

  // Initialize WhatsApp Messaging hook with stable loadConversations reference
  const whatsappMessaging = useWhatsAppMessaging({
    userId,
    selectedConversation,
    waWindowStatus,
    loadConversations: useCallback(async () => {
      await loadConversationsRef.current()
    }, []),
  })

  // Initialize Instagram Messaging hook
  const instagramMessaging = useInstagramMessaging({
    selectedConversation,
  })

  // Initialize Messenger Messaging hook
  const messengerMessaging = useMessengerMessaging({
    selectedConversation,
  })

  // Initialize Filters hook
  const filters = useConversationFilters({
    conversations,
    userId,
    assignmentFilter: assignment.assignmentFilter,
  })

  // Store CRM data in refs for stable access in loadConversations
  const crmCustomersRef = useRef<Map<string, CRMCustomer>>(new Map())
  const crmCustomersByIgsidRef = useRef<Map<string, CRMCustomer>>(new Map())
  const crmCustomersByPsidRef = useRef<Map<string, CRMCustomer>>(new Map())

  // Update refs when CRM data changes
  useEffect(() => {
    crmCustomersRef.current = crmData.crmCustomers
    crmCustomersByIgsidRef.current = crmData.crmCustomersByIgsid
    crmCustomersByPsidRef.current = crmData.crmCustomersByPsid
  }, [crmData.crmCustomers, crmData.crmCustomersByIgsid, crmData.crmCustomersByPsid])

  // Load conversations from both channels - OPTIMIZED with parallel fetch and caching
  const loadConversations = useCallback(async () => {
    if (!userId) return

    setLoading(true)
    const errors: string[] = []
    let waConversations: UnifiedConversation[] = []
    let igConversations: UnifiedConversation[] = []
    let msgConversations: UnifiedConversation[] = []

    // Helper function to process WhatsApp data (initial load only)
    const processWhatsAppData = (response: any) => {
      const data = response.data || []
      const unreadCounts = response.unreadCounts || {}
      const assignments = response.assignments || {}
      const pagination = response.pagination || { hasMore: false, nextCursor: null }

      // Update pagination state for infinite scroll
      setWaHasMore(pagination.hasMore)
      setWaPaginationCursor(pagination.nextCursor)

      whatsappMessaging.setWaMessages(data)

      // Extract unique customers (dedup by id only, since same sender on different WA numbers = different customer IDs)
      const uniqueCustomers = data.reduce((acc: Customer[], msg: any) => {
        if (!msg.customer) return acc
        const exists = acc.find((c) => c.id === msg.customer.id)
        if (!exists) {
          acc.push({
            id: msg.customer.id,
            phoneNumber: msg.customer.phoneNumber,
            name: msg.customer.name,
            whatsappPhoneNumberId: msg.customer.whatsappPhoneNumberId,
            whatsappPhoneNumber: msg.customer.whatsappPhoneNumber,
          } as Customer)
        }
        return acc
      }, [])

      whatsappMessaging.setWaCustomers(uniqueCustomers)
      whatsappMessaging.setWhatsappConnected(true)

      return uniqueCustomers.map((customer: Customer) =>
        transformWhatsAppToUnified(customer, data, unreadCounts, assignments)
      )
    }

    // Helper function to process Instagram data
    const processInstagramData = async () => {
      const status = await instagramApi.getConnectionStatus()
      if (status.connected) {
        // Set account for filter (single account from connection status)
        if (status.account) {
          setInstagramAccounts([status.account])
        }
        const response = await instagramApi.getConversations({ limit: 50 })
        instagramMessaging.setInstagramConnected(true)
        return (response.data || []).map(transformInstagramToUnified)
      } else {
        instagramMessaging.setInstagramConnected(false)
        setInstagramAccounts([])
        return []
      }
    }

    // Helper function to process Messenger data
    const processMessengerData = async () => {
      const status = await messengerApi.getConnectionStatus()
      if (status.connected) {
        // Load pages for filter
        try {
          const pages = await messengerApi.getPages()
          setFacebookPages(pages)
        } catch (e) {
          console.error("Failed to load Facebook pages:", e)
        }
        const response = await messengerApi.getConversations({ limit: 50 })
        messengerMessaging.setMessengerConnected(true)
        return (response.data || []).map(transformMessengerToUnified)
      } else {
        messengerMessaging.setMessengerConnected(false)
        setFacebookPages([])
        return []
      }
    }

    // Helper function to fetch fresh CRM data for enrichment
    const fetchCrmData = async () => {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      try {
        const response = await fetch(`${apiUrl}/api/v1/customers`, { credentials: "include" })
        if (!response.ok) return { customerMap: new Map(), customerByIgsidMap: new Map(), customerByPsidMap: new Map() }
        
        const result = await response.json()
        const customers = result.data || []
        
        const customerMap = new Map<string, CRMCustomer>()
        const customerByIgsidMap = new Map<string, CRMCustomer>()
        const customerByPsidMap = new Map<string, CRMCustomer>()
        
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
          
          if (customer.phoneNumber) {
            // Normalize phone number for consistent matching (+62xxx and 62xxx should match)
            customerMap.set(normalizePhoneNumber(customer.phoneNumber), crmCustomer)
          }
          if (customer.instagramIgsid) {
            customerByIgsidMap.set(customer.instagramIgsid, crmCustomer)
          }
          if (customer.messengerPsid) {
            customerByPsidMap.set(customer.messengerPsid, crmCustomer)
          }
        })
        
        return { customerMap, customerByIgsidMap, customerByPsidMap }
      } catch (error) {
        console.error("Failed to fetch CRM data for enrichment:", error)
        return { customerMap: new Map(), customerByIgsidMap: new Map(), customerByPsidMap: new Map() }
      }
    }

    // Parallel fetch WhatsApp, Instagram, Messenger, AND fresh CRM data
    const [waResult, igResult, msgResult, crmResult] = await Promise.allSettled([
      messagesApi.getMessages(),
      processInstagramData(),
      processMessengerData(),
      fetchCrmData()
    ])

    // Process WhatsApp result
    if (waResult.status === "fulfilled") {
      try {
        waConversations = processWhatsAppData(waResult.value)
      } catch (error) {
        console.error("Failed to process WhatsApp data:", error)
        errors.push("WhatsApp")
        whatsappMessaging.setWhatsappConnected(false)
      }
    } else {
      console.error("Failed to load WhatsApp messages:", waResult.reason)
      errors.push("WhatsApp")
      whatsappMessaging.setWhatsappConnected(false)
    }

    // Process Instagram result
    if (igResult.status === "fulfilled") {
      igConversations = igResult.value
    } else {
      console.error("Failed to load Instagram conversations:", igResult.reason)
      errors.push("Instagram")
      instagramMessaging.setInstagramConnected(false)
    }

    // Process Messenger result
    if (msgResult.status === "fulfilled") {
      msgConversations = msgResult.value
    } else {
      console.error("Failed to load Messenger conversations:", msgResult.reason)
      errors.push("Messenger")
      messengerMessaging.setMessengerConnected(false)
    }

    // Merge and sort by lastMessageAt descending
    const merged = [...waConversations, ...igConversations, ...msgConversations].sort((a, b) => {
      const aTime = a.lastMessageAt?.getTime() || 0
      const bTime = b.lastMessageAt?.getTime() || 0
      return bTime - aTime
    })

    // Get fresh CRM data from the parallel fetch result
    const freshCrmData = crmResult.status === "fulfilled" 
      ? crmResult.value 
      : { customerMap: new Map(), customerByIgsidMap: new Map(), customerByPsidMap: new Map() }

    // Update refs with fresh CRM data so selectConversation also uses fresh data
    if (crmResult.status === "fulfilled") {
      crmCustomersRef.current = freshCrmData.customerMap
      crmCustomersByIgsidRef.current = freshCrmData.customerByIgsidMap
      crmCustomersByPsidRef.current = freshCrmData.customerByPsidMap
    }

    // Enrich conversations with fresh CRM data (use fresh data from parallel fetch)
    const enrichedConversations = merged.map((conversation) => {
      let crmCustomer = undefined

      if (conversation.channel === "whatsapp") {
        // Normalize phone number for consistent matching (+62xxx and 62xxx should match)
        crmCustomer = freshCrmData.customerMap.get(normalizePhoneNumber(conversation.participantIdentifier))
      } else if (conversation.channel === "instagram") {
        crmCustomer = freshCrmData.customerByIgsidMap.get(conversation.participantIdentifier)
      } else if (conversation.channel === "messenger") {
        crmCustomer = freshCrmData.customerByPsidMap.get(conversation.participantIdentifier)
      }

      if (crmCustomer) {
        return {
          ...conversation,
          tags: crmCustomer.tags,
          pipelineStageId: crmCustomer.pipelineStageId,
          pipelineStage: crmCustomer.pipelineStage,
          crmCustomerId: crmCustomer.id,
        }
      }
      return conversation
    })

    setConversations(enrichedConversations)

    // Cache conversations to sessionStorage for faster subsequent loads
    try {
      const cacheData = {
        conversations: enrichedConversations.map(c => ({
          ...c,
          lastMessageAt: c.lastMessageAt?.toISOString(),
          assignedAt: c.assignedAt?.toISOString(),
        })),
        timestamp: Date.now()
      }
      sessionStorage.setItem('oneinbox_conversations', JSON.stringify(cacheData))
    } catch (e) {
      // Ignore cache errors
    }

    // Show warning if any channel failed
    if (errors.length > 0) {
      toast({
        variant: "destructive",
        title: "Partial Load",
        description: `Could not load ${errors.join(", ")} messages`,
      })
    }

    setLoading(false)
  }, [userId, toast, whatsappMessaging.setWaMessages, whatsappMessaging.setWaCustomers, whatsappMessaging.setWhatsappConnected, instagramMessaging.setInstagramConnected, messengerMessaging.setMessengerConnected])

  // Load more WhatsApp conversations for infinite scroll
  const loadMoreConversations = useCallback(async () => {
    if (!waHasMore || isLoadingMore || !waPaginationCursor) return

    setIsLoadingMore(true)
    try {
      const response = await messagesApi.getMessages(undefined, undefined, { cursor: waPaginationCursor })
      const data = response.data || []
      const unreadCounts = response.unreadCounts || {}
      const assignments = response.assignments || {}
      const pagination = response.pagination || { hasMore: false, nextCursor: null }

      // Update pagination state
      setWaHasMore(pagination.hasMore)
      setWaPaginationCursor(pagination.nextCursor)

      // Append new messages
      whatsappMessaging.setWaMessages((prev: any[]) => [...prev, ...data])

      // Extract unique customers
      const uniqueCustomers = data.reduce((acc: Customer[], msg: any) => {
        if (!msg.customer) return acc
        const exists = acc.find((c: Customer) => c.id === msg.customer.id)
        if (!exists) {
          acc.push({
            id: msg.customer.id,
            phoneNumber: msg.customer.phoneNumber,
            name: msg.customer.name,
            whatsappPhoneNumberId: msg.customer.whatsappPhoneNumberId,
            whatsappPhoneNumber: msg.customer.whatsappPhoneNumber,
          } as Customer)
        }
        return acc
      }, [])

      // Append new customers
      whatsappMessaging.setWaCustomers((prev: Customer[]) => {
        const existing = new Set(prev.map((c: Customer) => c.id))
        const newCustomers = uniqueCustomers.filter((c: Customer) => !existing.has(c.id))
        return [...prev, ...newCustomers]
      })

      // Transform and append new conversations
      const newWaConversations = uniqueCustomers.map((customer: Customer) =>
        transformWhatsAppToUnified(customer, data, unreadCounts, assignments)
      )

      // Append to existing conversations and sort
      setConversations(prev => {
        const existingIds = new Set(prev.map(c => c.id))
        const newConversations = newWaConversations.filter(c => !existingIds.has(c.id))
        const merged = [...prev, ...newConversations]
        return merged.sort((a, b) => {
          const aTime = a.lastMessageAt?.getTime() || 0
          const bTime = b.lastMessageAt?.getTime() || 0
          return bTime - aTime
        })
      })
    } catch (error) {
      console.error("Failed to load more conversations:", error)
    } finally {
      setIsLoadingMore(false)
    }
  }, [waHasMore, isLoadingMore, waPaginationCursor, whatsappMessaging.setWaMessages, whatsappMessaging.setWaCustomers])

  // Update the ref when loadConversations changes
  useEffect(() => {
    loadConversationsRef.current = loadConversations
  }, [loadConversations])

  // Refresh messages for currently selected conversation
  const refreshSelectedConversationMessages = useCallback(async () => {
    if (!selectedConversation) return

    if (selectedConversation.channel === "instagram") {
      const igConversation = selectedConversation.originalData as IGConversation
      try {
        const response = await instagramApi.getMessages(igConversation.id, { limit: 100 })
        instagramMessaging.setIgMessages(response.data || [])
      } catch (error) {
        // Silently fail on polling refresh
      }
    } else if (selectedConversation.channel === "messenger") {
      const msgConversation = selectedConversation.originalData as MessengerConversation
      try {
        const response = await messengerApi.getConversation(msgConversation.id, { limit: 100 })
        messengerMessaging.setMsgMessages(response.messages || [])
      } catch (error) {
        // Silently fail on polling refresh
      }
    }
  }, [selectedConversation, instagramMessaging.setIgMessages, messengerMessaging.setMsgMessages])

  // Initialize WebSocket handlers
  const wsHandlers = useWebSocketHandlers({
    selectedConversation,
    setConversations,
    setSelectedConversation,
    loadConversations,
    refreshSelectedConversationMessages,
  })

  const handleMessageStatus = useCallback(
    (event: MessageStatusEvent) => {
      const { messageId, conversationId, status } = event.payload
      const debug = typeof window !== "undefined" && localStorage.getItem("oneinbox_debug") === "1"

      if (debug) {
        console.debug("[oneinbox] message_status", event.payload)
      }
      let updated = false

      whatsappMessaging.setWaMessages(prev => {
        const next = prev.map(msg => {
          const matchesMessage = msg.id === messageId || msg.waMessageId === messageId
          const matchesConversation =
            (msg.customer as Customer | undefined)?.id === conversationId ||
            msg.customerId === conversationId

          if (matchesMessage || matchesConversation) {
            updated = true
            return {
              ...msg,
              status: status.toUpperCase(),
              messageStatus: status,
              waStatus: status,
            }
          }

          return msg
        })

        return next
      })

      // Refresh only if we didn't find a local match (to avoid flicker/loop)
      if (!updated) {
        loadConversations()
      }
    },
    [loadConversations, whatsappMessaging.setWaMessages]
  )

  // Initialize WebSocket connection
  const { state: webSocketState } = useWebSocket({
    onNewMessage: wsHandlers.handleNewMessage,
    onConversationUpdated: wsHandlers.handleConversationUpdated,
    onMessageStatus: handleMessageStatus,
    onUnreadCountUpdated: wsHandlers.handleUnreadCountUpdated,
    onAssignmentChanged: wsHandlers.handleAssignmentChanged,
    onOutboundMessage: wsHandlers.handleOutboundMessage,
    enabled: !isLoadingAccount && !!userId,
  })

  // Determine if polling should be active (only when WebSocket is not connected)
  const shouldPoll = useMemo(() => {
    return !webSocketState.isConnected || webSocketState.connectionMode === "polling"
  }, [webSocketState.isConnected, webSocketState.connectionMode])

  // Select conversation and load messages
  const selectConversation = useCallback(
    async (conversation: UnifiedConversation | null) => {
      setSelectedConversation(conversation)

      if (!conversation) {
        setWaWindowStatus(null)
        instagramMessaging.setIgMessages([])
        messengerMessaging.setMsgMessages([])
        crmData.setSelectedCustomerDetail(null)
        return
      }

      // Load customer detail - use refs for fresh CRM data
      if (conversation.crmCustomerId) {
        crmData.loadCustomerDetail(conversation.crmCustomerId)
      } else {
        let foundCustomerId: string | null = null
        
        // Use refs which are updated with fresh data in loadConversations
        if (conversation.channel === "whatsapp") {
          // Normalize phone number for consistent matching (+62xxx and 62xxx should match)
          const crmCustomer = crmCustomersRef.current.get(normalizePhoneNumber(conversation.participantIdentifier))
          if (crmCustomer) foundCustomerId = crmCustomer.id
        } else if (conversation.channel === "instagram") {
          const crmCustomer = crmCustomersByIgsidRef.current.get(conversation.participantIdentifier)
          if (crmCustomer) foundCustomerId = crmCustomer.id
        } else if (conversation.channel === "messenger") {
          const crmCustomer = crmCustomersByPsidRef.current.get(conversation.participantIdentifier)
          if (crmCustomer) foundCustomerId = crmCustomer.id
        }
        
        if (foundCustomerId) {
          crmData.loadCustomerDetail(foundCustomerId)
        } else {
          crmData.setSelectedCustomerDetail(null)
        }
      }

      if (conversation.channel === "whatsapp") {
        const customer = conversation.originalData as Customer
        const status = await fetchWindowStatus(customer.id)
        setWaWindowStatus(status)
        instagramMessaging.setIgMessages([])
        messengerMessaging.setMsgMessages([])
        
        // Optimistic update: Set unreadCount to 0 immediately
        setConversations(prev => prev.map(conv => {
          if (conv.id === conversation.id) {
            return { ...conv, unreadCount: 0 }
          }
          return conv
        }))
        setSelectedConversation(prev => prev ? { ...prev, unreadCount: 0 } : null)
        
        await messagesApi.markAsRead(customer.id).catch((error) => {
          console.error("Failed to mark WhatsApp messages as read:", error)
        })
      } else if (conversation.channel === "instagram") {
        const igConversation = conversation.originalData as IGConversation
        try {
          const response = await instagramApi.getMessages(igConversation.id, { limit: 100 })
          instagramMessaging.setIgMessages(response.data || [])
          messengerMessaging.setMsgMessages([])
          setConversations(prev => prev.map(conv => {
            if (conv.id === conversation.id) {
              return { ...conv, unreadCount: 0 }
            }
            return conv
          }))
          setSelectedConversation(prev => prev ? { ...prev, unreadCount: 0 } : null)
          await instagramApi.markAsRead(igConversation.id).catch(() => { })
        } catch (error) {
          console.error("Failed to load Instagram messages:", error)
        }
        setWaWindowStatus(null)
      } else if (conversation.channel === "messenger") {
        const msgConversation = conversation.originalData as MessengerConversation
        try {
          const response = await messengerApi.getConversation(msgConversation.id, { limit: 100 })
          messengerMessaging.setMsgMessages(response.messages || [])
          instagramMessaging.setIgMessages([])
          setConversations(prev => prev.map(conv => {
            if (conv.id === conversation.id) {
              return { ...conv, unreadCount: 0 }
            }
            return conv
          }))
          setSelectedConversation(prev => prev ? { ...prev, unreadCount: 0 } : null)
          await messengerApi.markAsRead(msgConversation.id).catch(() => { })
        } catch (error) {
          console.error("Failed to load Messenger messages:", error)
        }
        setWaWindowStatus(null)
      }
    },
    [crmData.loadCustomerDetail, crmData.setSelectedCustomerDetail, instagramMessaging.setIgMessages, messengerMessaging.setMsgMessages]
  )

  // Handle visibility change for smart polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      const isVisible = document.visibilityState === "visible"
      setIsTabVisible(isVisible)
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [])

  // Load CRM data once on mount
  useEffect(() => {
    if (!isLoadingAccount && userId) {
      crmData.loadCrmData()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoadingAccount])

  // Load WhatsApp phone numbers for multi-number filter
  useEffect(() => {
    if (!isLoadingAccount && userId) {
      wabaApi.getAccounts().then(accounts => {
        const phoneNumbers = accounts
          .filter(a => a.connectionStatus === "connected")
          .flatMap(a => a.phoneNumbers.map(pn => ({
            id: pn.id,
            phoneNumberId: pn.phoneNumberId,
            displayPhoneNumber: pn.displayPhoneNumber,
          })))
        setWhatsappPhoneNumbers(phoneNumbers)
      }).catch(err => {
        console.error("Failed to load WhatsApp phone numbers:", err)
      })
    }
  }, [userId, isLoadingAccount])

  // Load cached conversations first for instant UI, then fetch fresh data
  useEffect(() => {
    if (!isLoadingAccount && userId) {
      // Try to load from cache first for instant display
      try {
        const cached = sessionStorage.getItem('oneinbox_conversations')
        if (cached) {
          const { conversations: cachedConversations, timestamp } = JSON.parse(cached)
          const cacheAge = Date.now() - timestamp
          const CACHE_MAX_AGE = 5 * 60 * 1000 // 5 minutes
          
          if (cacheAge < CACHE_MAX_AGE && cachedConversations.length > 0) {
            const restored = cachedConversations.map((c: any) => ({
              ...c,
              lastMessageAt: c.lastMessageAt ? new Date(c.lastMessageAt) : null,
              assignedAt: c.assignedAt ? new Date(c.assignedAt) : null,
            }))
            setConversations(restored)
          }
        }
      } catch (e) {
        // Ignore cache errors
      }

      // Then fetch fresh data in background
      loadConversations()
      whatsappMessaging.loadTemplates()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoadingAccount])

  // Polling for real-time updates
  useEffect(() => {
    if (!isLoadingAccount && userId && shouldPoll) {
      if (isTabVisible) {
        loadConversations()
        refreshSelectedConversationMessages()
      }

      const interval = setInterval(() => {
        if (isTabVisible) {
          loadConversations()
          refreshSelectedConversationMessages()
        }
      }, 5000)

      return () => clearInterval(interval)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isLoadingAccount, isTabVisible, shouldPoll])

  return {
    // Conversations
    conversations,
    filteredConversations: filters.filteredConversations,
    selectedConversation,
    selectConversation,
    // Filters
    channelFilter: filters.channelFilter,
    setChannelFilter: filters.setChannelFilter,
    searchQuery: filters.searchQuery,
    setSearchQuery: filters.setSearchQuery,
    readStatusFilter: filters.readStatusFilter,
    setReadStatusFilter: filters.setReadStatusFilter,
    tagsFilter: filters.tagsFilter,
    setTagsFilter: filters.setTagsFilter,
    pipelineFilter: filters.pipelineFilter,
    setPipelineFilter: filters.setPipelineFilter,
    accountFilter: filters.accountFilter,
    setAccountFilter: filters.setAccountFilter,
    clearFilters: filters.clearFilters,
    // Multi-account data for filters
    instagramAccounts,
    facebookPages,
    whatsappPhoneNumbers,
    // Assignment state
    assignmentFilter: assignment.assignmentFilter,
    setAssignmentFilter: assignment.setAssignmentFilter,
    assignableUsers: assignment.assignableUsers,
    aiEnabled: assignment.aiEnabled,
    defaultAIAgentName: assignment.defaultAIAgentName,
    assignConversation: assignment.assignConversation,
    unassignConversation: assignment.unassignConversation,
    loadAssignableUsers: assignment.loadAssignableUsers,
    // CRM data
    availableTags: crmData.availableTags,
    pipelineStages: crmData.pipelineStages,
    crmDataLoaded: crmData.crmDataLoaded,
    isPanelOpen: crmData.isPanelOpen,
    setIsPanelOpen: crmData.setIsPanelOpen,
    selectedCustomerDetail: crmData.selectedCustomerDetail,
    customerLoading: crmData.customerLoading,
    loadCustomerDetail: crmData.loadCustomerDetail,
    updateCustomerTags: crmData.updateCustomerTags,
    updateCustomerStage: crmData.updateCustomerStage,
    addCustomerNote: crmData.addCustomerNote,
    updateCustomerContact: crmData.updateCustomerContact,
    linkCustomerToConversation: crmData.linkCustomerToConversation,
    // Loading states
    loading,
    sending: whatsappMessaging.sending || instagramMessaging.sending || messengerMessaging.sending,
    uploading: whatsappMessaging.uploading,
    // Connection status
    whatsappConnected: whatsappMessaging.whatsappConnected,
    instagramConnected: instagramMessaging.instagramConnected,
    messengerConnected: messengerMessaging.messengerConnected,
    // WhatsApp specific
    waMessages: whatsappMessaging.waMessages,
    waCustomers: whatsappMessaging.waCustomers,
    waTemplates: whatsappMessaging.waTemplates,
    waWindowStatus,
    setWaWindowStatus,
    sendWhatsAppMessage: whatsappMessaging.sendWhatsAppMessage,
    sendWhatsAppTemplate: whatsappMessaging.sendWhatsAppTemplate,
    sendWhatsAppMedia: whatsappMessaging.sendWhatsAppMedia,
    sendWhatsAppCta: whatsappMessaging.sendWhatsAppCta,
    sendWhatsAppReplyButtons: whatsappMessaging.sendWhatsAppReplyButtons,
    sendWhatsAppListMessage: whatsappMessaging.sendWhatsAppListMessage,
    sendWhatsAppCarousel: whatsappMessaging.sendWhatsAppCarousel,
    retryWhatsAppMessage: whatsappMessaging.retryWhatsAppMessage,
    sendWhatsAppReaction: whatsappMessaging.sendWhatsAppReaction,
    // Instagram specific
    igMessages: instagramMessaging.igMessages,
    sendInstagramMessage: instagramMessaging.sendInstagramMessage,
    sendInstagramReaction: instagramMessaging.sendInstagramReaction,
    // Messenger specific
    msgMessages: messengerMessaging.msgMessages,
    sendMessengerMessage: messengerMessaging.sendMessengerMessage,
    // Common
    userId,
    isLoadingAccount,
    loadConversations,
    webSocketState,
    // Pagination for infinite scroll
    waHasMore,
    isLoadingMore,
    loadMoreConversations,
  }
}
