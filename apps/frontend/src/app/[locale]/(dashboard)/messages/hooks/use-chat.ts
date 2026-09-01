import { useState, useEffect, useRef } from "react"
import { messagesApi, type APIError } from "@/lib/api/messages-api"
import { useToast } from "@/hooks/use-toast"
import { useBusinessAccount } from "@/hooks/use-business-account"
import type { WindowStatus } from "@/lib/window-utils"

export interface Customer {
    id: string
    phoneNumber: string
    name?: string
}

export function useChat() {
    const [messages, setMessages] = useState<any[]>([])
    const [customers, setCustomers] = useState<Customer[]>([])
    const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null)
    const [loading, setLoading] = useState(false)
    const [sending, setSending] = useState(false)
    const [uploading, setUploading] = useState(false)
    const [templates, setTemplates] = useState<any[]>([])
    const [windowStatus, setWindowStatus] = useState<WindowStatus | null>(null)

    const {
        userId,
        isLoading: isLoadingAccount,
    } = useBusinessAccount()

    const { toast } = useToast()

    // Mark messages as read when customer is selected
    const handleSelectCustomer = async (customer: Customer | null) => {
        setSelectedCustomer(customer)
        
        // Mark messages as read when opening a chat
        if (customer) {
            try {
                await messagesApi.markAsRead(customer.id)
                console.log('✅ Marked messages as read for customer:', customer.id)
            } catch (error) {
                // Non-critical, just log
                console.error('Failed to mark as read:', error)
            }
        }
    }

    const loadMessages = async () => {
        try {
            setLoading(true)
            const response = await messagesApi.getMessages()

            // Response is always MessagesListResponse with data property
            const data = response.data || []

            setMessages(data)

            // Extract unique customers (from both INBOUND and OUTBOUND messages)
            const uniqueCustomers = data.reduce((acc: Customer[], msg: any) => {
                // Skip if no customer info
                if (!msg.customer) return acc

                // Check if customer already exists by phone number (more reliable than ID)
                const existingCustomer = acc.find(
                    (c) =>
                        c.phoneNumber === msg.customer.phoneNumber ||
                        c.id === msg.customer.id
                )

                if (!existingCustomer) {
                    acc.push({
                        id: msg.customer.id,
                        phoneNumber: msg.customer.phoneNumber,
                        name: msg.customer.name,
                    })
                }

                return acc
            }, [])

            setCustomers(uniqueCustomers)
        } catch (error: any) {
            console.error("Failed to load messages:", error)
            toast({
                variant: "destructive",
                title: "Error",
                description: "Failed to load messages",
            })
        } finally {
            setLoading(false)
        }
    }

    const loadTemplates = async () => {
        try {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
            const response = await fetch(
                `${apiUrl}/api/v1/templates?userId=${userId}`,
                {
                    credentials: "include",
                }
            )
            const result = await response.json()
            const approvedTemplates =
                result.data?.filter((t: any) => t.status === "APPROVED") || []

            // Debug: Log loaded templates to check structure
            console.log('📋 Loaded templates:', approvedTemplates.map((t: any) => ({
                name: t.templateName,
                content: t.content,
                hasVariables: !!(t.content?.match(/\{\{(\d+)\}\}/g))
            })))

            setTemplates(approvedTemplates)
        } catch (error) {
            console.error("Failed to load templates:", error)
        }
    }

    const sendMessage = async (text: string) => {
        if (!selectedCustomer || !text.trim()) {
            toast({
                variant: "destructive",
                title: "Error",
                description: "Please type a message",
            })
            return false
        }

        // Check 24-hour window for non-template messages
        if (!windowStatus?.isActive) {
            toast({
                variant: "destructive",
                title: "Window Expired",
                description: "24-hour window expired. Please use a message template.",
            })
            return "WINDOW_EXPIRED"
        }

        try {
            setSending(true)
            await messagesApi.sendMessage({
                userId: userId!,
                phoneNumber: selectedCustomer.phoneNumber,
                type: "text",
                text: {
                    body: text,
                },
            })

            // Reload messages after a short delay
            setTimeout(() => {
                loadMessages()
            }, 500)

            return true
        } catch (error: any) {
            console.error("Failed to send message:", error)

            // Check if error is WindowExpired
            if (
                error.message?.includes("window") ||
                error.message?.includes("Window") ||
                error.code === "WindowExpired"
            ) {
                toast({
                    variant: "destructive",
                    title: "Window Expired",
                    description: "24-hour window expired. Use a template instead.",
                })
                return "WINDOW_EXPIRED"
            } else {
                // Extract error message and recovery action from API error
                const apiError = error as APIError
                const errorMessage = apiError.message || "Failed to send message"
                const recoveryAction = apiError.recoveryAction
                
                // Build description with recovery action
                const description = recoveryAction 
                    ? `${errorMessage}\n\n💡 ${recoveryAction}`
                    : errorMessage
                
                toast({
                    variant: "destructive",
                    title: apiError.code || "Error",
                    description,
                })
                return false
            }
        } finally {
            setSending(false)
        }
    }

    const sendTemplate = async (template: any) => {
        console.log('🚀 sendTemplate CALLED with:', JSON.stringify(template, null, 2))

        if (!selectedCustomer) {
            console.log('❌ No selectedCustomer, returning false')
            return false
        }

        setSending(true)

        try {
            // Build template payload
            const templatePayload: any = {
                name: template.templateName,
                language: { code: template.language },
            }

            // Check if components were pre-built by message-input.tsx
            if (template.components && template.components.length > 0) {
                console.log('📤 Using pre-built components:', template.components)
                templatePayload.components = template.components
            } else {
                // Fallback: Build components from variableValues
                // This handles cases where components weren't pre-built
                const receivedVariableValues = template.variableValues
                const variableKeys = receivedVariableValues ? Object.keys(receivedVariableValues) : []

                console.log('📤 sendTemplate received:', {
                    templateName: template.templateName,
                    variableValues: receivedVariableValues,
                    variableKeys,
                    templateContent: template.content?.substring(0, 100),
                })

                if (receivedVariableValues && variableKeys.length > 0) {
                    // Sort keys numerically to ensure correct parameter order
                    // WhatsApp API requires parameters in order: {{1}}, {{2}}, {{3}}
                    const sortedKeys = variableKeys.sort((a, b) => parseInt(a) - parseInt(b))

                    // Build ALL parameters - don't filter out empty ones
                    // WhatsApp requires exact parameter count matching template
                    const bodyParameters = sortedKeys.map(key => ({
                        type: "text",
                        text: (receivedVariableValues[key] as string)?.trim() || ''
                    }))

                    console.log('📤 Built body parameters (fallback):', bodyParameters)

                    if (bodyParameters.length > 0) {
                        templatePayload.components = [{
                            type: "body",
                            parameters: bodyParameters
                        }]
                    }
                }
            }

            console.log('📤 Final template payload:', JSON.stringify(templatePayload, null, 2))

            const requestBody = {
                userId: userId!,
                phoneNumber: selectedCustomer.phoneNumber,
                type: "template" as const,
                template: templatePayload,
                variableValues: template.variableValues,
            }

            console.log('📤 FULL REQUEST BODY:', JSON.stringify(requestBody, null, 2))

            await messagesApi.sendMessage(requestBody)

            toast({
                title: "Success",
                description: `Template "${template.templateName}" sent!`,
            })

            setTimeout(() => {
                loadMessages()
            }, 500)

            return true
        } catch (error: any) {
            console.error("Failed to send template:", error)
            
            // Extract error message and recovery action from API error
            const apiError = error as APIError
            const errorMessage = apiError.message || "Failed to send template"
            const recoveryAction = apiError.recoveryAction
            
            // Build description with recovery action
            const description = recoveryAction 
                ? `${errorMessage}\n\n💡 ${recoveryAction}`
                : errorMessage
            
            toast({
                variant: "destructive",
                title: apiError.code || "Error",
                description,
            })
            return false
        } finally {
            setSending(false)
        }
    }

    const sendCta = async (ctaForm: {
        bodyText: string
        buttonLabel: string
        buttonUrl: string
        footerText: string
        headerImageUrl: string
    }) => {
        if (!selectedCustomer || !ctaForm.bodyText || !ctaForm.buttonLabel || !ctaForm.buttonUrl) {
            return false
        }

        setSending(true)

        try {
            let header;

            if (ctaForm.headerImageUrl) {
                header = {
                    type: "image",
                    image: { link: ctaForm.headerImageUrl }
                } as any
            }

            await messagesApi.sendMessage({
                userId: userId!,
                phoneNumber: selectedCustomer.phoneNumber,
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

            toast({
                title: "Success",
                description: "CTA Message sent!",
            })

            setTimeout(() => {
                loadMessages()
            }, 500)

            return true
        } catch (error: any) {
            console.error("Failed to send CTA message:", error)
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to send CTA message",
            })
            return false
        } finally {
            setSending(false)
        }
    }

    const sendReplyButtons = async (replyForm: {
        bodyText: string
        buttons: { id: string; title: string }[]
        footerText: string
        headerImage: File | null
    }) => {
        if (!selectedCustomer || !replyForm.bodyText || replyForm.buttons.some(b => !b.title)) {
            return false
        }

        setSending(true)

        try {
            let header;
            if (replyForm.headerImage) {
                // Upload header image
                const formData = new FormData()
                formData.append("file", replyForm.headerImage)
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

            await messagesApi.sendMessage({
                userId: userId!,
                phoneNumber: selectedCustomer.phoneNumber,
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

            toast({
                title: "Success",
                description: "Reply Buttons sent!",
            })

            setTimeout(() => {
                loadMessages()
            }, 500)

            return true
        } catch (error: any) {
            console.error("Failed to send Reply Buttons:", error)
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to send Reply Buttons",
            })
            return false
        } finally {
            setSending(false)
        }
    }

    const sendListMessage = async (listForm: {
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
        if (!selectedCustomer || !listForm.bodyText?.trim() || !listForm.buttonText?.trim()) {
            return false
        }

        // Check 24-hour window for interactive messages
        if (!windowStatus?.isActive) {
            toast({
                variant: "destructive",
                title: "Window Expired",
                description: "24-hour window expired. Please use a message template.",
            })
            return "WINDOW_EXPIRED"
        }

        setSending(true)

        try {
            // Build header if provided
            let header
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

            const requestPayload = {
                userId: userId!,
                phoneNumber: selectedCustomer.phoneNumber,
                type: "interactive" as const,
                interactive: interactivePayload
            }
            
            await messagesApi.sendMessage(requestPayload)

            toast({
                title: "Success",
                description: "List Message sent!",
            })

            setTimeout(() => {
                loadMessages()
            }, 500)

            return true
        } catch (error: any) {
            console.error("Failed to send List Message:", error)
            
            // Extract error message and recovery action from API error
            const apiError = error as APIError
            const errorMessage = apiError.message || "Failed to send List Message"
            const recoveryAction = apiError.recoveryAction
            
            // Build description with recovery action
            const description = recoveryAction 
                ? `${errorMessage}\n\n💡 ${recoveryAction}`
                : errorMessage
            
            toast({
                variant: "destructive",
                title: apiError.code || "Error",
                description,
            })
            return false
        } finally {
            setSending(false)
        }
    }

    const sendMedia = async (file: File, caption?: string) => {
        if (!selectedCustomer) return false

        // Check 24-hour window for media messages
        if (!windowStatus?.isActive) {
            toast({
                variant: "destructive",
                title: "Window Expired",
                description: "24-hour window expired. Please use a message template.",
            })
            return "WINDOW_EXPIRED"
        }

        try {
            setUploading(true)

            // Upload file to backend (directly to WhatsApp)
            const formData = new FormData()
            formData.append("file", file)
            formData.append("target", "whatsapp") // Request upload to WhatsApp

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
            const mediaUrl = uploadResult.data.url // Fallback if we decide to support mixed mode

            // Determine message type
            const messageType = file.type.startsWith("image/")
                ? "image"
                : "document"

            // Send media message with ID
            const mediaPayload: any = {
                caption: caption?.trim() || undefined,
            }

            if (mediaId) {
                mediaPayload.id = mediaId
            }

            if (mediaUrl) {
                mediaPayload.link = mediaUrl
            }

            if (!mediaId && !mediaUrl) {
                throw new Error("No media ID or URL returned from upload")
            }

            if (messageType === "document") {
                mediaPayload.filename = file.name
            }

            await messagesApi.sendMessage({
                userId: userId!,
                phoneNumber: selectedCustomer.phoneNumber,
                type: messageType,
                [messageType]: mediaPayload,
            })

            toast({
                title: "Success",
                description: "Media sent!",
            })

            setTimeout(() => {
                loadMessages()
            }, 500)

            return true
        } catch (error: any) {
            console.error("Failed to send media:", error)
            toast({
                variant: "destructive",
                title: "Error",
                description: error.message || "Failed to send media",
            })
            return false
        } finally {
            setUploading(false)
        }
    }

    useEffect(() => {
        // Only load data if user is authenticated and has userId
        if (!isLoadingAccount && userId) {
            loadMessages()
            loadTemplates()
            const interval = setInterval(loadMessages, 5000)
            return () => clearInterval(interval)
        }
    }, [userId, isLoadingAccount])

    return {
        messages,
        customers,
        selectedCustomer,
        setSelectedCustomer: handleSelectCustomer, // Use the new handler that marks as read
        loading,
        sending,
        uploading,
        templates,
        windowStatus,
        setWindowStatus,
        loadMessages,
        sendMessage,
        sendTemplate,
        sendCta,
        sendReplyButtons,
        sendListMessage,
        sendMedia,
        userId,
        isLoadingAccount
    }
}
