/**
 * useWhatsAppMessaging Hook
 * Handles WhatsApp message sending with optimistic UI updates
 */

import { useState, useCallback, useEffect } from "react"
import {
  messagesApi,
  type Message,
  type APIError,
  type InteractiveCarouselCard,
  type InteractiveMessage,
} from "@/lib/api/messages-api"
// Note: APIError is already imported above for error handling
import { useToast } from "@/hooks/use-toast"
import type { WindowStatus } from "@/lib/window-utils"
import type { UnifiedConversation, Customer } from "./unified-inbox-types"

interface UseWhatsAppMessagingOptions {
  userId: string | null
  selectedConversation: UnifiedConversation | null
  waWindowStatus: WindowStatus | null
  loadConversations: () => Promise<void>
}

type CarouselFormCard = {
  mediaType: "image" | "video"
  mediaUrl: string
  bodyText?: string
  buttonLabel?: string
  buttonUrl?: string
  buttons?: Array<{
    id: string
    title: string
  }>
}

type CarouselForm = {
  bodyText: string
  cards: CarouselFormCard[]
}

function buildCarouselCards(cards: CarouselFormCard[]): InteractiveCarouselCard[] {
  const usesQuickReplies = Boolean(cards[0]?.buttons?.length)

  return cards.map((card, index) => {
    const baseCard: Omit<InteractiveCarouselCard, "action"> = {
      card_index: index,
      type: "cta_url",
      header: {
        type: card.mediaType,
        ...(card.mediaType === "image"
          ? { image: { link: card.mediaUrl } }
          : { video: { link: card.mediaUrl } }),
      },
      body: card.bodyText?.trim() ? { text: card.bodyText.trim() } : undefined,
    }

    if (usesQuickReplies) {
      return {
        ...baseCard,
        action: {
          buttons: (card.buttons || []).map(button => ({
            type: "quick_reply",
            quick_reply: {
              id: button.id,
              title: button.title,
            },
          })),
        },
      }
    }

    return {
      ...baseCard,
      action: {
        name: "cta_url",
        parameters: {
          display_text: card.buttonLabel!.trim(),
          url: card.buttonUrl!.trim(),
        },
      },
    }
  })
}

function buildCarouselInteractive(form: CarouselForm): InteractiveMessage | null {
  const bodyText = form.bodyText.trim()
  const cards = form.cards || []

  if (!bodyText || cards.length < 2) {
    return null
  }

  const usesQuickReplies = Boolean(cards[0]?.buttons?.length)

  const isValid = cards.every(card => {
    if (!card.mediaUrl?.trim()) {
      return false
    }

    if (usesQuickReplies) {
      return Boolean(card.buttons?.length && card.buttons.every(button => button.id?.trim() && button.title?.trim()))
    }

    return Boolean(card.buttonLabel?.trim() && card.buttonUrl?.trim())
  })

  if (!isValid) {
    return null
  }

  return {
    type: "carousel",
    body: { text: bodyText },
    action: {
      cards: buildCarouselCards(cards),
    },
  }
}

export function useWhatsAppMessaging({
  userId,
  selectedConversation,
  waWindowStatus,
  loadConversations,
}: UseWhatsAppMessagingOptions) {
  const { toast } = useToast()

  // WhatsApp specific state
  const [waMessages, setWaMessages] = useState<Message[]>([])
  const [waCustomers, setWaCustomers] = useState<Customer[]>([])
  const [waTemplates, setWaTemplates] = useState<any[]>([])
  const [whatsappConnected, setWhatsappConnected] = useState(true)

  // Sending states
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)

  // Load templates for WhatsApp.
  //
  // Templates are scoped to a specific WABA account. When a conversation is
  // selected we resolve the template list via the conversation's phone number
  // (whatsappPhoneNumberId), so the user only sees templates that actually
  // exist for THAT business number. Otherwise sending will fail with Meta
  // error 132001 ("Template name does not exist in the translation").
  //
  // If no conversation is selected (initial mount), we fall back to all
  // templates from connected accounts so the UI can render placeholders.
  const loadTemplates = useCallback(async () => {
    if (!userId) return
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const params = new URLSearchParams()
      params.set("status", "APPROVED")
      const phoneId = selectedConversation?.channel === "whatsapp"
        ? selectedConversation.whatsappPhoneNumberId
        : null
      if (phoneId) {
        params.set("whatsappPhoneNumberId", phoneId)
      }
      const response = await fetch(`${apiUrl}/api/v1/templates?${params.toString()}`, {
        credentials: "include",
      })
      const result = await response.json()
      const approvedTemplates = result.data?.filter((t: any) => t.status === "APPROVED") || []
      setWaTemplates(approvedTemplates)
    } catch (error) {
      console.error("Failed to load templates:", error)
    }
  }, [userId, selectedConversation])

  // Reload templates whenever the selected WhatsApp conversation switches to
  // a different business number. Templates are WABA-scoped, so a list cached
  // from a previous conversation would let the user pick a template that does
  // not exist on the new account (Meta error 132001).
  const activeWaPhoneId =
    selectedConversation?.channel === "whatsapp"
      ? selectedConversation.whatsappPhoneNumberId ?? null
      : null

  useEffect(() => {
    if (!userId) return
    if (!activeWaPhoneId) return
    loadTemplates()
    // We intentionally depend on the scalar phone id rather than the whole
    // selectedConversation object — switching to a different conversation on
    // the SAME number should not refetch templates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, activeWaPhoneId])

  // WhatsApp reaction sending
  const sendWhatsAppReaction = useCallback(async (messageId: string, emoji: string) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") {
      return false
    }

    try {
      await messagesApi.sendReaction(messageId, emoji)
      
      toast({
        title: emoji ? "Reaction sent" : "Reaction removed",
        description: emoji ? `Reacted with ${emoji}` : "Reaction removed",
      })
      return true
    } catch (error: any) {
      console.error("Failed to send reaction:", error)
      
      const apiError = error as APIError
      const errorMessage = apiError.message || "Failed to send reaction"
      
      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: errorMessage,
      })
      return false
    }
  }, [selectedConversation, toast])

  // WhatsApp message sending with Optimistic UI
  // replyToWamId: wamId of message being replied to (for quoted reply)
  const sendWhatsAppMessage = useCallback(async (text: string, replyToWamId?: string) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp" || !text.trim()) {
      return false
    }

    if (!waWindowStatus?.isActive) {
      toast({
        variant: "destructive",
        title: "Window Expired",
        description: "24-hour window expired. Please use a message template.",
      })
      return "WINDOW_EXPIRED"
    }

    const customer = selectedConversation.originalData as Customer
    
    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create optimistic message (appears immediately)
    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: "text",
      content: text,
      status: "PENDING", // Shows as "sending..."
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
    }

    // Add optimistic message to UI immediately
    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)
      const response = await messagesApi.sendMessage({
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: "text",
        text: { body: text },
        // Include context for reply-to-specific-message
        context: replyToWamId ? { message_id: replyToWamId } : undefined,
      })

      // Update optimistic message with real data (SENT status)
      setWaMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      return true
    } catch (error: any) {
      console.error("Failed to send WhatsApp message:", error)
      
      const apiError = error as APIError
      const errorMessage = apiError.message || "Failed to send message"
      
      // Update optimistic message to FAILED status with error details
      setWaMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              status: "FAILED",
              errorMessage: errorMessage,
              errorCode: apiError.code,
            }
          : msg
      ))
      
      if (error.message?.toLowerCase().includes("window") || apiError.code === "WindowExpired") {
        toast({
          variant: "destructive",
          title: "Window Expired",
          description: "24-hour window expired. Use a template instead.",
        })
        return "WINDOW_EXPIRED"
      }
      
      // Build description with recovery action
      const toastDescription = apiError.recoveryAction 
        ? `${errorMessage}\n\n💡 ${apiError.recoveryAction}`
        : errorMessage
      
      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, waWindowStatus, userId, toast])

  const sendWhatsAppTemplate = useCallback(async (template: any) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") return false

    const customer = selectedConversation.originalData as Customer
    
    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create optimistic message for template
    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: "template",
      content: `[Template: ${template.templateName}]`,
      status: "PENDING",
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
      template: {
        id: "",
        templateName: template.templateName,
        category: "",
      },
    }

    // Add optimistic message to UI immediately
    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)
      const response = await messagesApi.sendMessage({
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: "template",
        template: {
          name: template.templateName,
          language: { code: template.language },
          components: template.components,
        },
        variableValues: template.variableValues,
      })
      
      // Update optimistic message with real data
      setWaMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      toast({ title: "Success", description: `Template "${template.templateName}" sent!` })
      return true
    } catch (error: any) {
      console.error("Failed to send template:", error)
      
      const apiError = error as APIError
      const errorMessage = apiError.message || "Failed to send template"
      
      // Update optimistic message to FAILED status with error details
      setWaMessages(prev => prev.map(msg => 
        msg.id === tempId 
          ? {
              ...msg,
              status: "FAILED",
              errorMessage: errorMessage,
              errorCode: apiError.code,
            }
          : msg
      ))
      
      const toastDescription = apiError.recoveryAction 
        ? `${errorMessage}\n\n💡 ${apiError.recoveryAction}`
        : errorMessage
      
      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, userId, toast])

  const sendWhatsAppMedia = useCallback(async (file: File, caption?: string) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") return false

    if (!waWindowStatus?.isActive) {
      toast({
        variant: "destructive",
        title: "Window Expired",
        description: "24-hour window expired. Please use a message template.",
      })
      return "WINDOW_EXPIRED"
    }

    const customer = selectedConversation.originalData as Customer
    const messageType = file.type.startsWith("image/") ? "image" : "document"
    
    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create optimistic message for media
    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: messageType,
      content: caption || `[${messageType === "image" ? "Image" : "Document"}: ${file.name}]`,
      status: "PENDING",
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
    }

    // Add optimistic message to UI immediately
    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setUploading(true)

      // Derive phoneNumberId from customer's linked WhatsApp phone number
      const customerPhoneNumberId = (customer as any).whatsappPhoneNumber?.phoneNumberId

      const formData = new FormData()
      formData.append("file", file)
      if (customerPhoneNumberId) {
        formData.append("phoneNumberId", customerPhoneNumberId)
      }
      formData.append("target", "whatsapp")

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const uploadResponse = await fetch(`${apiUrl}/api/v1/media/upload`, {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json()
        throw new Error(errorData.error?.message || "Failed to upload media")
      }

      const uploadResult = await uploadResponse.json()
      const mediaId = uploadResult.data.id
      const mediaUrl = uploadResult.data.url

      const mediaPayload: any = { caption: caption?.trim() || undefined }

      if (mediaId) mediaPayload.id = mediaId
      if (mediaUrl) mediaPayload.link = mediaUrl
      if (messageType === "document") mediaPayload.filename = file.name

      const response = await messagesApi.sendMessage({
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: messageType,
        [messageType]: mediaPayload,
      })

      // Update optimistic message with real data
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      toast({ title: "Success", description: "Media sent!" })
      return true
    } catch (error: any) {
      console.error("Failed to send media:", error)

      const apiError = error as APIError
      const errorMessage = apiError.message || "Failed to send media"
      
      // Update optimistic message to FAILED status with error details
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              status: "FAILED",
              errorMessage: errorMessage,
              errorCode: apiError.code,
            }
          : msg
      ))

      const toastDescription = apiError.recoveryAction
        ? `${errorMessage}\n\n💡 ${apiError.recoveryAction}`
        : errorMessage

      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setUploading(false)
    }
  }, [selectedConversation, waWindowStatus, userId, toast])

  // WhatsApp CTA button sending with Optimistic UI
  const sendWhatsAppCta = useCallback(async (ctaForm: {
    bodyText: string
    buttonLabel: string
    buttonUrl: string
    footerText: string
    headerImageUrl: string
  }) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") return false
    if (!ctaForm.bodyText || !ctaForm.buttonLabel || !ctaForm.buttonUrl) return false

    if (!waWindowStatus?.isActive) {
      toast({
        variant: "destructive",
        title: "Window Expired",
        description: "24-hour window expired. Please use a message template.",
      })
      return "WINDOW_EXPIRED"
    }

    const customer = selectedConversation.originalData as Customer
    
    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Build header for optimistic message
    let header: any = undefined
    if (ctaForm.headerImageUrl) {
      header = {
        type: "image",
        image: { link: ctaForm.headerImageUrl }
      }
    }
    
    // Create optimistic message for CTA
    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: "interactive",
      content: ctaForm.bodyText,
      status: "PENDING",
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
      // Store interactive data for rendering
      interactive: {
        type: "cta_url",
        header,
        body: { text: ctaForm.bodyText },
        footer: ctaForm.footerText ? { text: ctaForm.footerText } : undefined,
        action: {
          name: "cta_url",
          parameters: {
            display_text: ctaForm.buttonLabel,
            url: ctaForm.buttonUrl
          }
        }
      }
    } as any

    // Add optimistic message to UI immediately
    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)

      const response = await messagesApi.sendMessage({
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: "interactive",
        interactive: {
          type: "cta_url",
          header,
          body: { text: ctaForm.bodyText },
          footer: ctaForm.footerText ? { text: ctaForm.footerText } : undefined,
          action: {
            name: "cta_url",
            parameters: {
              display_text: ctaForm.buttonLabel,
              url: ctaForm.buttonUrl
            }
          }
        }
      })

      // Update optimistic message with real data
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      toast({
        title: "Success",
        description: "CTA Message sent!",
      })
      return true
    } catch (error: any) {
      console.error("Failed to send CTA message:", error)
      const apiError = error as APIError
      const errorMsg = apiError.message || "Failed to send CTA message"
      
      // Update optimistic message to FAILED status with error details
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              status: "FAILED",
              errorMessage: errorMsg,
              errorCode: apiError.code,
            }
          : msg
      ))
      
      if (error.message?.toLowerCase().includes("window") || apiError.code === "WindowExpired") {
        toast({
          variant: "destructive",
          title: "Window Expired",
          description: "24-hour window expired. Use a template instead.",
        })
        return "WINDOW_EXPIRED"
      }
      
      const toastDescription = apiError.recoveryAction 
        ? `${errorMsg}\n\n💡 ${apiError.recoveryAction}`
        : errorMsg
      
      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, waWindowStatus, userId, toast])

  // WhatsApp Reply Buttons sending with Optimistic UI
  const sendWhatsAppReplyButtons = useCallback(async (replyForm: {
    bodyText: string
    buttons: { id: string; title: string }[]
    footerText: string
    headerImage: File | null
  }) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") return false
    if (!replyForm.bodyText || replyForm.buttons.some(b => !b.title)) return false

    if (!waWindowStatus?.isActive) {
      toast({
        variant: "destructive",
        title: "Window Expired",
        description: "24-hour window expired. Please use a message template.",
      })
      return "WINDOW_EXPIRED"
    }

    const customer = selectedConversation.originalData as Customer
    
    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Create optimistic message for Reply Buttons (without header image initially)
    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: "interactive",
      content: replyForm.bodyText,
      status: "PENDING",
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
      // Store interactive data for rendering
      interactive: {
        type: "button",
        body: { text: replyForm.bodyText },
        footer: replyForm.footerText ? { text: replyForm.footerText } : undefined,
        action: {
          buttons: replyForm.buttons.map(b => ({
            type: "reply",
            reply: {
              id: b.id,
              title: b.title
            }
          }))
        }
      }
    } as any

    // Add optimistic message to UI immediately
    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)

      let header
      if (replyForm.headerImage) {
        // Upload header image - derive phoneNumberId from customer
        const customerPhoneNumberId = (customer as any).whatsappPhoneNumber?.phoneNumberId
        const formData = new FormData()
        formData.append("file", replyForm.headerImage)
        if (customerPhoneNumberId) {
          formData.append("phoneNumberId", customerPhoneNumberId)
        }
        formData.append("target", "whatsapp")

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
        const uploadResponse = await fetch(`${apiUrl}/api/v1/media/upload`, {
          method: "POST",
          credentials: "include",
          body: formData,
        })

        if (!uploadResponse.ok) throw new Error("Failed to upload header image")
        const uploadResult = await uploadResponse.json()

        header = {
          type: "image",
          image: { id: uploadResult.data.id }
        } as any
      }

      const response = await messagesApi.sendMessage({
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: "interactive",
        interactive: {
          type: "button",
          header,
          body: { text: replyForm.bodyText },
          footer: replyForm.footerText ? { text: replyForm.footerText } : undefined,
          action: {
            buttons: replyForm.buttons.map(b => ({
              type: "reply",
              reply: {
                id: b.id,
                title: b.title
              }
            }))
          }
        }
      })

      // Update optimistic message with real data
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      toast({
        title: "Success",
        description: "Reply Buttons sent!",
      })
      return true
    } catch (error: any) {
      console.error("Failed to send Reply Buttons:", error)
      const apiError = error as APIError
      const errorMsg = apiError.message || "Failed to send Reply Buttons"
      
      // Update optimistic message to FAILED status with error details
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              status: "FAILED",
              errorMessage: errorMsg,
              errorCode: apiError.code,
            }
          : msg
      ))
      
      if (error.message?.toLowerCase().includes("window") || apiError.code === "WindowExpired") {
        toast({
          variant: "destructive",
          title: "Window Expired",
          description: "24-hour window expired. Use a template instead.",
        })
        return "WINDOW_EXPIRED"
      }
      
      const toastDescription = apiError.recoveryAction 
        ? `${errorMsg}\n\n💡 ${apiError.recoveryAction}`
        : errorMsg
      
      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, waWindowStatus, userId, toast])

  // WhatsApp List Message sending with Optimistic UI
  const sendWhatsAppListMessage = useCallback(async (listForm: {
    headerText: string
    bodyText: string
    footerText: string
    buttonText: string
    sections: Array<{
      title: string
      rows: Array<{
        id: string
        title: string
        description: string
      }>
    }>
  }) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") return false
    if (!listForm.bodyText?.trim() || !listForm.buttonText?.trim()) {
      return false
    }

    if (!waWindowStatus?.isActive) {
      toast({
        variant: "destructive",
        title: "Window Expired",
        description: "24-hour window expired. Please use a message template.",
      })
      return "WINDOW_EXPIRED"
    }

    const customer = selectedConversation.originalData as Customer
    
    // Generate temporary ID for optimistic message
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    // Build header if provided
    let header: any = undefined
    if (listForm.headerText.trim()) {
      header = {
        type: "text",
        text: listForm.headerText.trim()
      }
    }

    // Build sections - WhatsApp requires title if multiple sections
    const hasMultipleSections = listForm.sections.length > 1
    const sections = listForm.sections.map((section, idx) => {
      const sectionObj: { title?: string; rows: Array<{ id: string; title: string; description?: string }> } = {
        rows: section.rows.map(row => {
          const rowObj: { id: string; title: string; description?: string } = {
            id: row.id,
            title: row.title.trim()
          }
          // Only add description if not empty
          if (row.description.trim()) {
            rowObj.description = row.description.trim()
          }
          return rowObj
        })
      }
      // Add title if provided or if multiple sections (use default)
      const sectionTitle = section.title.trim()
      if (sectionTitle) {
        sectionObj.title = sectionTitle
      } else if (hasMultipleSections) {
        // WhatsApp requires title for multiple sections
        sectionObj.title = `Section ${idx + 1}`
      }
      return sectionObj
    })

    // Build the interactive payload - only include defined fields
    const interactivePayload: any = {
      type: "list",
      body: { text: listForm.bodyText.trim() },
      action: {
        button: listForm.buttonText.trim(),
        sections
      }
    }
    
    // Only add header if defined
    if (header) {
      interactivePayload.header = header
    }
    
    // Only add footer if not empty
    if (listForm.footerText.trim()) {
      interactivePayload.footer = { text: listForm.footerText.trim() }
    }

    // Create optimistic message for List Message
    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: "interactive",
      content: listForm.bodyText.trim(),
      status: "PENDING",
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
      // Store interactive data for rendering
      interactive: interactivePayload
    } as any

    // Add optimistic message to UI immediately
    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)

      const requestPayload = {
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: "interactive" as const,
        interactive: interactivePayload
      }
      
      const response = await messagesApi.sendMessage(requestPayload)

      // Update optimistic message with real data
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      toast({
        title: "Success",
        description: "List Message sent!",
      })
      return true
    } catch (error: any) {
      console.error("Failed to send List Message:", error)
      const apiError = error as APIError
      const errorMsg = apiError.message || "Failed to send List Message"
      
      // Update optimistic message to FAILED status with error details
      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              status: "FAILED",
              errorMessage: errorMsg,
              errorCode: apiError.code,
            }
          : msg
      ))
      
      if (error.message?.toLowerCase().includes("window") || apiError.code === "WindowExpired") {
        toast({
          variant: "destructive",
          title: "Window Expired",
          description: "24-hour window expired. Use a template instead.",
        })
        return "WINDOW_EXPIRED"
      }
      
      const toastDescription = apiError.recoveryAction 
        ? `${errorMsg}\n\n💡 ${apiError.recoveryAction}`
        : errorMsg
      
      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, waWindowStatus, userId, toast])

  const sendWhatsAppCarousel = useCallback(async (carouselForm: CarouselForm) => {
    if (!selectedConversation || selectedConversation.channel !== "whatsapp") return false

    if (!waWindowStatus?.isActive) {
      toast({
        variant: "destructive",
        title: "Window Expired",
        description: "24-hour window expired. Please use a message template.",
      })
      return "WINDOW_EXPIRED"
    }

    const interactivePayload = buildCarouselInteractive(carouselForm)

    if (!interactivePayload) {
      return false
    }

    const customer = selectedConversation.originalData as Customer
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

    const optimisticMessage: Message = {
      id: tempId,
      waMessageId: undefined,
      userId: userId!,
      customerId: customer.id,
      direction: "OUTBOUND",
      type: "interactive",
      content: interactivePayload.body?.text || "Carousel Message",
      status: "PENDING",
      timestamp: new Date().toISOString(),
      customer: {
        id: customer.id,
        phoneNumber: customer.phoneNumber,
        name: customer.name,
      },
      interactive: interactivePayload,
    }

    setWaMessages(prev => [...prev, optimisticMessage])

    try {
      setSending(true)

      const response = await messagesApi.sendMessage({
        userId: userId!,
        customerId: customer.id,
        phoneNumber: customer.phoneNumber,
        type: "interactive",
        interactive: interactivePayload,
      })

      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              id: response.id || tempId,
              waMessageId: response.waMessageId,
              status: "SENT",
            }
          : msg
      ))

      return true
    } catch (error: any) {
      console.error("Failed to send carousel:", error)
      const apiError = error as APIError
      const errorMessage = apiError.message || "Failed to send carousel"

      setWaMessages(prev => prev.map(msg =>
        msg.id === tempId
          ? {
              ...msg,
              status: "FAILED",
              errorMessage,
              errorCode: apiError.code,
            }
          : msg
      ))

      if (error.message?.toLowerCase().includes("window") || apiError.code === "WindowExpired") {
        toast({
          variant: "destructive",
          title: "Window Expired",
          description: "24-hour window expired. Use a template instead.",
        })
        return "WINDOW_EXPIRED"
      }

      const toastDescription = apiError.recoveryAction
        ? `${errorMessage}\n\n💡 ${apiError.recoveryAction}`
        : errorMessage

      toast({
        variant: "destructive",
        title: apiError.code || "Error",
        description: toastDescription,
      })
      return false
    } finally {
      setSending(false)
    }
  }, [selectedConversation, waWindowStatus, userId, toast])

  // Retry failed message
  const retryWhatsAppMessage = useCallback(async (failedMessage: Message) => {
    if (!failedMessage || failedMessage.status !== "FAILED") return false

    // Remove the failed message from the list
    setWaMessages(prev => prev.filter(msg => msg.id !== failedMessage.id))

    // Determine message type and resend
    const messageType = failedMessage.type?.toLowerCase()
    
    if (messageType === "text") {
      return sendWhatsAppMessage(failedMessage.content || "")
    } else if (messageType === "template" && failedMessage.template) {
      // For templates, we need to reconstruct the template object
      // This is a simplified retry - full template retry would need more data
      toast({
        variant: "default",
        title: "Info",
        description: "Silakan kirim ulang template dari panel template.",
      })
      return false
    } else if (messageType === "image" || messageType === "document") {
      // For media, user needs to re-upload
      toast({
        variant: "default",
        title: "Info",
        description: "Silakan upload ulang file untuk mengirim kembali.",
      })
      return false
    } else {
      // For other types (interactive), just show info
      toast({
        variant: "default",
        title: "Info",
        description: "Silakan kirim ulang pesan secara manual.",
      })
      return false
    }
  }, [sendWhatsAppMessage, toast])

  return {
    // State
    waMessages,
    setWaMessages,
    waCustomers,
    setWaCustomers,
    waTemplates,
    whatsappConnected,
    setWhatsappConnected,
    sending,
    uploading,
    // Actions
    loadTemplates,
    sendWhatsAppMessage,
    sendWhatsAppTemplate,
    sendWhatsAppMedia,
    sendWhatsAppCta,
    sendWhatsAppReplyButtons,
    sendWhatsAppListMessage,
    sendWhatsAppCarousel,
    retryWhatsAppMessage,
    sendWhatsAppReaction,
  }
}
