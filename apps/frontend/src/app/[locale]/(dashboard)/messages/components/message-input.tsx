import { useState, useRef, useEffect, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useTypingIndicator } from "@/hooks/use-typing-indicator"
import { useCachedSession } from "@/hooks/use-cached-session"
import { useQuickReplyAutocomplete, replaceShortcutWithContent } from "@/hooks/use-quick-reply-autocomplete"
import { QuickReplyPopover } from "@/components/messages/quick-reply-popover"
import { QuickReplyAutocomplete } from "@/components/messages/quick-reply-autocomplete"
import type { QuickReply } from "@/lib/api/quick-replies-api"
import {
    Paperclip,
    Send,
    Plus,
    FileText,
    Link,
    List,
    ListOrdered,
    PanelsTopLeft,
    X,
    FileIcon,
    AlertCircle,
    Trash2
} from "lucide-react"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import type { WindowStatus } from "@/lib/window-utils"

// WhatsApp Business API limit for text messages
const WHATSAPP_TEXT_MAX_LENGTH = 4096
const WHATSAPP_TEXT_WARNING_THRESHOLD = 3800 // Show warning when approaching limit

// Separate component to avoid closure issues with state
interface VariableInfo {
    key: string
    label: string
    type: 'body' | 'header_media' | 'button' | 'copy_code'
    placeholder: string
}

type CarouselMode = "url" | "quick_reply"

type CarouselCardForm = {
    mediaType: "image" | "video"
    mediaUrl: string
    bodyText: string
    buttonLabel: string
    buttonUrl: string
}

type CarouselSharedButtonForm = {
    title: string
}

type CarouselSubmitCard = {
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

function createEmptyCarouselCard(): CarouselCardForm {
    return {
        mediaType: "image",
        mediaUrl: "",
        bodyText: "",
        buttonLabel: "",
        buttonUrl: "",
    }
}

function createDefaultCarouselForm() {
    return {
        bodyText: "",
        mode: "url" as CarouselMode,
        cards: [createEmptyCarouselCard(), createEmptyCarouselCard()],
        sharedButtons: [{ title: "" }, { title: "" }] as CarouselSharedButtonForm[],
    }
}

function extractTemplateVariables(template: any): VariableInfo[] {
    const variables: VariableInfo[] = []
    const variableRegex = /\{\{(\d+)\}\}/g

    // 1. Header media (IMAGE, VIDEO, DOCUMENT)
    if (template.headerType && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(template.headerType.toUpperCase())) {
        const headerType = template.headerType.toLowerCase()
        variables.push({
            key: `header_${headerType}`,
            label: `Header ${template.headerType}`,
            type: 'header_media',
            placeholder: `https://example.com/${headerType}.${headerType === 'image' ? 'jpg' : headerType === 'video' ? 'mp4' : 'pdf'}`,
        })
    }

    // 2. Body variables
    const content = template.content || template.bodyText || ''
    const matches = content.match(variableRegex) || []
    const uniqueVars: string[] = Array.from(new Set(matches.map((m: string) => m.replace(/[{}]/g, ''))))
    uniqueVars.forEach(varNum => {
        variables.push({
            key: varNum,
            label: `Body Variable {{${varNum}}}`,
            type: 'body',
            placeholder: `Value for {{${varNum}}}`,
        })
    })

    // 3. Button variables (URL with {{1}} or Copy Code)
    const buttons = template.buttons || []
    let urlButtonIndex = 0
    buttons.forEach((button: any, btnIndex: number) => {
        // URL button with dynamic suffix
        const hasDynamicUrl = button.type === 'URL' && (
            (button.example && button.example.length > 0) ||
            (button.url && button.url.includes('{{1}}'))
        )
        if (hasDynamicUrl) {
            variables.push({
                key: `button_${urlButtonIndex}`,
                label: `Button URL Suffix`,
                type: 'button',
                placeholder: `URL suffix for "${button.text}" button`,
            })
            urlButtonIndex++
        }
        
        // Copy Code / OTP button
        if (button.type === 'COPY_CODE' || button.type === 'OTP') {
            variables.push({
                key: `button_${btnIndex}_copy_code`,
                label: 'Copy Code',
                type: 'copy_code',
                placeholder: 'Enter code (e.g., 123456)',
            })
        }
    })

    // Also check components structure
    const components = template.components || []
    components.forEach((comp: any) => {
        if (comp.type === 'BUTTONS' && comp.buttons) {
            let compUrlIdx = 0
            comp.buttons.forEach((button: any, btnIndex: number) => {
                const hasDynamicUrl = button.type === 'URL' && (
                    (button.example && button.example.length > 0) ||
                    (button.url && button.url.includes('{{1}}'))
                )
                if (hasDynamicUrl && !variables.find(v => v.key === `button_${compUrlIdx}`)) {
                    variables.push({
                        key: `button_${compUrlIdx}`,
                        label: `Button URL Suffix`,
                        type: 'button',
                        placeholder: `URL suffix for "${button.text}" button`,
                    })
                    compUrlIdx++
                }
                if ((button.type === 'COPY_CODE' || button.type === 'OTP') && !variables.find(v => v.key === `button_${btnIndex}_copy_code`)) {
                    variables.push({
                        key: `button_${btnIndex}_copy_code`,
                        label: 'Copy Code',
                        type: 'copy_code',
                        placeholder: 'Enter code (e.g., 123456)',
                    })
                }
            })
        }
    })

    return variables
}

function VariableInputForm({ 
    template, 
    variableValues, 
    onVariableChange 
}: { 
    template: any
    variableValues: Record<string, string>
    onVariableChange: (varNum: string, value: string) => void 
}) {
    const content = template.content || template.bodyText || ''
    const variables = extractTemplateVariables(template)
    
    // Generate preview for body
    let preview = content
    Object.entries(variableValues).forEach(([key, value]) => {
        if (/^\d+$/.test(key)) {
            preview = preview.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || `{{${key}}}`)
        }
    })

    return (
        <div className="space-y-4 py-4">
            {/* Show template preview */}
            <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm font-medium mb-2">Template: {template.templateName}</p>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {content}
                </p>
            </div>

            {/* Variable inputs */}
            {variables.length === 0 ? (
                <div className="text-sm text-muted-foreground italic">
                    No variables detected in template.
                </div>
            ) : (
                variables.map((variable) => (
                    <div key={variable.key} className="space-y-2">
                        <Label className="flex items-center gap-2">
                            {variable.label}
                            {variable.type === 'header_media' && (
                                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded">header</span>
                            )}
                            {variable.type === 'button' && (
                                <span className="text-xs bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded">button</span>
                            )}
                            {variable.type === 'copy_code' && (
                                <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">copy code</span>
                            )}
                        </Label>
                        <Input
                            type={variable.type === 'header_media' ? 'url' : 'text'}
                            placeholder={variable.placeholder}
                            value={variableValues[variable.key] || ''}
                            onChange={(e) => onVariableChange(variable.key, e.target.value)}
                        />
                        {variable.type === 'header_media' && (
                            <p className="text-xs text-muted-foreground">Enter a publicly accessible URL</p>
                        )}
                    </div>
                ))
            )}

            {/* Preview with values */}
            <div className="bg-primary/5 p-3 rounded-lg border border-primary/20">
                <p className="text-xs font-medium mb-2 text-primary">Preview:</p>
                <p className="text-sm whitespace-pre-wrap">{preview}</p>
            </div>
        </div>
    )
}

interface MessageInputProps {
    onSendMessage: (text: string) => Promise<any>
    onSendTemplate: (template: any) => Promise<any>
    onSendCta: (data: any) => Promise<any>
    onSendReplyButtons: (data: any) => Promise<any>
    onSendListMessage: (data: any) => Promise<any>
    onSendCarousel?: (data: { bodyText: string; cards: CarouselSubmitCard[] }) => Promise<any>
    onSendMedia: (file: File, caption?: string) => Promise<any>
    sending: boolean
    uploading: boolean
    templates: any[]
    windowStatus?: WindowStatus | null
    customerId?: string
    /** Customer name for variable substitution */
    customerName?: string
    /** Customer phone for variable substitution */
    customerPhone?: string
    /** Message being replied to (for quoted reply) */
    replyToMessage?: import("@/lib/api/messages-api").Message | null
    /** Cancel reply action */
    onCancelReply?: () => void
}

export function MessageInput({
    onSendMessage,
    onSendTemplate,
    onSendCta,
    onSendReplyButtons,
    onSendListMessage,
    onSendCarousel,
    onSendMedia,
    sending,
    uploading,
    templates,
    windowStatus,
    customerId,
    customerName,
    customerPhone,
    replyToMessage,
    onCancelReply
}: MessageInputProps) {
    const t = useTranslations('common')
    const { data: sessionData } = useCachedSession()
    const [messageText, setMessageText] = useState("")
    const [showTemplateMenu, setShowTemplateMenu] = useState(false)
    const [showCtaDialog, setShowCtaDialog] = useState(false)
    const [showReplyDialog, setShowReplyDialog] = useState(false)
    const [showListDialog, setShowListDialog] = useState(false)
    const [showCarouselDialog, setShowCarouselDialog] = useState(false)
    const [showVariableDialog, setShowVariableDialog] = useState(false)
    const [selectedTemplate, setSelectedTemplate] = useState<any>(null)
    const [variableValues, setVariableValues] = useState<Record<string, string>>({})
    const [selectedFile, setSelectedFile] = useState<File | null>(null)
    const [filePreview, setFilePreview] = useState<string | null>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)

    // Typing indicator - sends to customer when agent types
    const { sendTyping } = useTypingIndicator(customerId, "whatsapp")

    // Quick reply autocomplete - detects /shortcut pattern
    const quickReplyAutocomplete = useQuickReplyAutocomplete({
        inputValue: messageText,
        enabled: windowStatus?.isActive !== false || windowStatus === null,
    })

    /**
     * Resolve quick reply variables in content
     * Supports: {{customer_name}}, {{customer_phone}}, {{agent_name}}
     */
    const resolveQuickReplyVariables = useCallback((content: string): string => {
        let resolved = content
        
        // Customer variables
        if (customerName) {
            resolved = resolved.replace(/\{\{customer_name\}\}/g, customerName)
        }
        if (customerPhone) {
            resolved = resolved.replace(/\{\{customer_phone\}\}/g, customerPhone)
        }
        
        // Agent variables
        if (sessionData?.user?.name) {
            resolved = resolved.replace(/\{\{agent_name\}\}/g, sessionData.user.name)
        }
        
        return resolved
    }, [customerName, customerPhone, sessionData?.user?.name])

    /**
     * Handle quick reply selection from popover or autocomplete
     */
    const handleQuickReplySelect = useCallback((content: string) => {
        const resolvedContent = resolveQuickReplyVariables(content)
        setMessageText(resolvedContent)
        quickReplyAutocomplete.reset()
        // Focus textarea after selection
        setTimeout(() => textareaRef.current?.focus(), 0)
    }, [resolveQuickReplyVariables, quickReplyAutocomplete])

    /**
     * Handle quick reply selection from autocomplete dropdown
     */
    const handleAutocompleteSelect = useCallback((quickReply: QuickReply) => {
        const resolvedContent = resolveQuickReplyVariables(quickReply.content)
        const newText = replaceShortcutWithContent(messageText, resolvedContent)
        setMessageText(newText)
        quickReplyAutocomplete.reset()
        // Focus textarea after selection
        setTimeout(() => textareaRef.current?.focus(), 0)
    }, [messageText, resolveQuickReplyVariables, quickReplyAutocomplete])

    // Auto-focus on textarea when conversation changes or component mounts
    useEffect(() => {
        const isWindowActive = windowStatus?.isActive !== false || windowStatus === null
        const isNotDisabled = !sending && !uploading
        
        if (isWindowActive && isNotDisabled) {
            // Use requestAnimationFrame for more reliable focus after render
            requestAnimationFrame(() => {
                textareaRef.current?.focus()
            })
        }
    }, [customerId]) // Only trigger on conversation change

    // Re-focus when window becomes active
    useEffect(() => {
        if (windowStatus?.isActive === true) {
            requestAnimationFrame(() => {
                textareaRef.current?.focus()
            })
        }
    }, [windowStatus?.isActive])

    // CTA Form State
    const [ctaForm, setCtaForm] = useState({
        bodyText: "",
        buttonLabel: "",
        buttonUrl: "",
        footerText: "",
        headerImageUrl: ""
    })

    // Reply Buttons Form State
    const [replyForm, setReplyForm] = useState<{
        bodyText: string
        buttons: { id: string; title: string }[]
        footerText: string
        headerImage: File | null
    }>({
        bodyText: "",
        buttons: [{ id: "btn-1", title: "" }],
        footerText: "",
        headerImage: null
    })

    // List Message Form State
    const [listForm, setListForm] = useState<{
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
    }>({
        headerText: "",
        bodyText: "",
        footerText: "",
        buttonText: "",
        sections: [{
            title: "",
            rows: [{ id: "row-1", title: "", description: "" }]
        }]
    })

    const [carouselForm, setCarouselForm] = useState(createDefaultCarouselForm())

    const handleSendMessage = async (e: React.FormEvent) => {
        e.preventDefault()
        if (selectedFile) {
            await onSendMedia(selectedFile, messageText)
            handleCancelFile()
            setMessageText("")
            // Refocus after sending
            setTimeout(() => textareaRef.current?.focus(), 0)
        } else if (messageText.trim()) {
            const success = await onSendMessage(messageText)
            if (success === true) {
                setMessageText("")
                // Refocus after sending
                setTimeout(() => textareaRef.current?.focus(), 0)
            } else if (success === "WINDOW_EXPIRED") {
                setShowTemplateMenu(true)
            }
        }
    }

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return

        // Check file size (max 16MB for WhatsApp)
        if (file.size > 16 * 1024 * 1024) {
            // Ideally show toast here, but we can rely on parent or just ignore
            return
        }

        setSelectedFile(file)

        // Create preview for images
        if (file.type.startsWith("image/")) {
            const reader = new FileReader()
            reader.onloadend = () => {
                setFilePreview(reader.result as string)
            }
            reader.readAsDataURL(file)
        } else {
            setFilePreview(null)
        }
    }

    const handleCancelFile = () => {
        setSelectedFile(null)
        setFilePreview(null)
        if (fileInputRef.current) {
            fileInputRef.current.value = ""
        }
    }

    const resetCarouselForm = () => {
        setCarouselForm(createDefaultCarouselForm())
    }

    const trimmedSharedButtons = carouselForm.sharedButtons
        .map(button => button.title.trim())
        .filter(Boolean)

    const isCarouselValid = Boolean(
        carouselForm.bodyText.trim() &&
        carouselForm.cards.length >= 2 &&
        carouselForm.cards.length <= 10 &&
        carouselForm.cards.every(card => {
            if (!card.mediaUrl.trim()) {
                return false
            }

            if (carouselForm.mode === "quick_reply") {
                return trimmedSharedButtons.length >= 1 && trimmedSharedButtons.length <= 3
            }

            return Boolean(card.buttonLabel.trim() && card.buttonUrl.trim())
        })
    )

    const handleCarouselDialogChange = (open: boolean) => {
        setShowCarouselDialog(open)

        if (!open) {
            resetCarouselForm()
        }
    }

    const handleCarouselSubmit = async () => {
        if (!isCarouselValid) {
            return
        }

        const cards: CarouselSubmitCard[] = carouselForm.cards.map((card, cardIndex) => {
            const baseCard: CarouselSubmitCard = {
                mediaType: card.mediaType,
                mediaUrl: card.mediaUrl.trim(),
                bodyText: card.bodyText.trim(),
            }

            if (carouselForm.mode === "quick_reply") {
                return {
                    ...baseCard,
                    buttons: trimmedSharedButtons.map((title, buttonIndex) => ({
                        id: `card-${cardIndex + 1}-button-${buttonIndex + 1}`,
                        title,
                    })),
                }
            }

            return {
                ...baseCard,
                buttonLabel: card.buttonLabel.trim(),
                buttonUrl: card.buttonUrl.trim(),
            }
        })

        if (!onSendCarousel) {
            return
        }

        const result = await onSendCarousel({
            bodyText: carouselForm.bodyText.trim(),
            cards,
        })

        if (result === true) {
            handleCarouselDialogChange(false)
        }
    }

    return (
        <div className="p-4 bg-background border-t">
            {/* Window Closed Warning */}
            {windowStatus && !windowStatus.isActive && (
                <Alert className="mb-4 border-amber-500 bg-amber-50 dark:bg-amber-950/20">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-500" />
                    <AlertDescription className="text-amber-800 dark:text-amber-200">
                        24-hour window expired. You can only send <button
                            onClick={() => setShowTemplateMenu(true)}
                            className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-100"
                        >
                            message templates
                        </button>.
                    </AlertDescription>
                </Alert>
            )}

            {/* Reply Preview */}
            {replyToMessage && (
                <div className="mb-3 flex items-start gap-2 px-3 py-2 bg-muted/50 border-l-4 border-primary rounded-r-md">
                    <svg className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                    <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-primary">
                            Replying to {replyToMessage.direction === "INBOUND" 
                                ? replyToMessage.customer?.name || replyToMessage.customer?.phoneNumber || "Customer"
                                : "You"}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                            {replyToMessage.content?.length && replyToMessage.content.length > 100
                                ? replyToMessage.content.substring(0, 100) + "..."
                                : replyToMessage.content || "[Media]"}
                        </div>
                    </div>
                    {onCancelReply && (
                        <button
                            type="button"
                            onClick={onCancelReply}
                            className="p-0.5 hover:bg-muted rounded transition-colors flex-shrink-0"
                            title="Cancel reply"
                        >
                            <X className="h-4 w-4 text-muted-foreground" />
                        </button>
                    )}
                </div>
            )}

            {/* File Preview */}
            {selectedFile && (
                <div className="mb-4 p-3 bg-muted/50 rounded-lg flex items-start gap-3 relative group">
                    <button
                        onClick={handleCancelFile}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1 shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                        <X className="h-3 w-3" />
                    </button>

                    {filePreview ? (
                        <img
                            src={filePreview}
                            alt="Preview"
                            className="h-16 w-16 object-cover rounded-md border"
                        />
                    ) : (
                        <div className="h-16 w-16 bg-background rounded-md border flex items-center justify-center">
                            <FileIcon className="h-8 w-8 text-muted-foreground" />
                        </div>
                    )}

                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{selectedFile.name}</p>
                        <p className="text-xs text-muted-foreground">
                            {(selectedFile.size / 1024).toFixed(1)} KB
                        </p>
                    </div>
                </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-end gap-2">
                {/* Attachments Menu */}
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label="Attachments"
                            className="flex-shrink-0 text-muted-foreground hover:text-foreground"
                            disabled={!windowStatus?.isActive && windowStatus !== null}
                        >
                            <Plus className="h-5 w-5" />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-56">
                        <DropdownMenuLabel>Attachments</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        {windowStatus?.isActive !== false && (
                            <>
                                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                                    <Paperclip className="mr-2 h-4 w-4" />
                                    <span>File / Image</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowCtaDialog(true)}>
                                    <Link className="mr-2 h-4 w-4" />
                                    <span>CTA Link Button</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowReplyDialog(true)}>
                                    <List className="mr-2 h-4 w-4" />
                                    <span>Reply Buttons</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setShowListDialog(true)}>
                                    <ListOrdered className="mr-2 h-4 w-4" />
                                    <span>List Message</span>
                                </DropdownMenuItem>
                                {onSendCarousel && (
                                    <DropdownMenuItem onClick={() => setShowCarouselDialog(true)}>
                                        <PanelsTopLeft className="mr-2 h-4 w-4" />
                                        <span>Carousel Message</span>
                                    </DropdownMenuItem>
                                )}
                                <DropdownMenuSeparator />
                            </>
                        )}
                        <DropdownMenuItem onClick={() => setShowTemplateMenu(true)}>
                            <FileText className="mr-2 h-4 w-4" />
                            <span>Template Message</span>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>

                <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    onChange={handleFileSelect}
                />

                {/* Quick Reply Popover Button */}
                <QuickReplyPopover
                    onSelect={handleQuickReplySelect}
                    disabled={sending || uploading || (!windowStatus?.isActive && windowStatus !== null)}
                />

                {/* Textarea with Quick Reply Autocomplete */}
                <div className="relative flex-1">
                    {/* Quick Reply Autocomplete Dropdown */}
                    <QuickReplyAutocomplete
                        isOpen={quickReplyAutocomplete.isOpen}
                        results={quickReplyAutocomplete.results}
                        selectedIndex={quickReplyAutocomplete.selectedIndex}
                        onSelect={handleAutocompleteSelect}
                        isLoading={quickReplyAutocomplete.isLoading}
                        query={quickReplyAutocomplete.query}
                    />

                    <Textarea
                        ref={textareaRef}
                        value={messageText}
                        onChange={(e) => {
                            setMessageText(e.target.value)
                            // Send typing indicator to customer (debounced, fire-and-forget)
                            if (e.target.value.trim()) {
                                sendTyping()
                            }
                        }}
                        onKeyDown={(e) => {
                            // Handle quick reply autocomplete navigation
                            if (quickReplyAutocomplete.isOpen && quickReplyAutocomplete.results.length > 0) {
                                if (e.key === "ArrowUp") {
                                    e.preventDefault()
                                    quickReplyAutocomplete.moveUp()
                                    return
                                }
                                if (e.key === "ArrowDown") {
                                    e.preventDefault()
                                    quickReplyAutocomplete.moveDown()
                                    return
                                }
                                if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                                    e.preventDefault()
                                    const selectedReply = quickReplyAutocomplete.results[quickReplyAutocomplete.selectedIndex]
                                    if (selectedReply) {
                                        handleAutocompleteSelect(selectedReply)
                                    }
                                    return
                                }
                                if (e.key === "Escape") {
                                    e.preventDefault()
                                    quickReplyAutocomplete.reset()
                                    // Clear the /shortcut from input
                                    setMessageText(messageText.replace(/\/\w*$/, ""))
                                    return
                                }
                            }

                            // Enter without Shift sends the message (when autocomplete is closed)
                            if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault()
                                if ((messageText.trim() || selectedFile) && !sending && !uploading) {
                                    handleSendMessage(e)
                                }
                            }
                            // Shift+Enter allows new line (default behavior)
                        }}
                        placeholder={
                            !windowStatus?.isActive && windowStatus !== null
                                ? "Use a template to message..."
                                : selectedFile
                                    ? "Add a caption..."
                                    : "Type a message..."
                        }
                        className="flex-1 min-h-[44px] max-h-[120px] resize-none py-3 w-full"
                        rows={1}
                        maxLength={WHATSAPP_TEXT_MAX_LENGTH}
                        disabled={sending || uploading || (!windowStatus?.isActive && windowStatus !== null)}
                        autoFocus
                    />
                </div>

                <Button
                    type="submit"
                    size="icon"
                    disabled={(!messageText.trim() && !selectedFile) || sending || uploading || (!windowStatus?.isActive && windowStatus !== null) || messageText.length > WHATSAPP_TEXT_MAX_LENGTH}
                    className={sending || uploading ? "opacity-70" : ""}
                >
                    <Send className="h-5 w-5" />
                </Button>
            </form>

            {/* Character count warning */}
            {messageText.length > WHATSAPP_TEXT_WARNING_THRESHOLD && (
                <div className={`text-xs px-3 py-1.5 flex justify-between items-center ${
                    messageText.length > WHATSAPP_TEXT_MAX_LENGTH 
                        ? "text-red-600 bg-red-50 dark:bg-red-950/30 dark:text-red-400" 
                        : "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400"
                }`}>
                    <span>
                        {messageText.length > WHATSAPP_TEXT_MAX_LENGTH 
                            ? `Message too long! Reduce by ${messageText.length - WHATSAPP_TEXT_MAX_LENGTH} characters.`
                            : `Approaching character limit`
                        }
                    </span>
                    <span className="font-mono">
                        {messageText.length}/{WHATSAPP_TEXT_MAX_LENGTH}
                    </span>
                </div>
            )}

            {/* Template Selection Dialog */}
            <Dialog open={showTemplateMenu} onOpenChange={setShowTemplateMenu}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Select Template</DialogTitle>
                        <DialogDescription>
                            Choose a template to send to the customer.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                        {templates.map((template) => {
                            // Check if template has variables
                            const variables = extractTemplateVariables(template)
                            const hasVariables = variables.length > 0
                            
                            return (
                                <div
                                    key={template.id}
                                    className="border rounded-lg p-3 hover:bg-accent/50 cursor-pointer transition-colors flex flex-col h-full min-h-[120px]"
                                    onClick={() => {
                                        if (hasVariables) {
                                            setSelectedTemplate(template)
                                            setShowTemplateMenu(false)
                                            setShowVariableDialog(true)
                                        } else {
                                            onSendTemplate(template)
                                            setShowTemplateMenu(false)
                                        }
                                    }}
                                >
                                    <h4 className="font-medium text-sm mb-1 truncate" title={template.templateName}>
                                        {template.templateName}
                                    </h4>
                                    <p className="text-xs text-muted-foreground line-clamp-2 mb-auto flex-1">
                                        {template.content || template.bodyText}
                                    </p>
                                    <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border/50">
                                        <span className="text-[10px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded">
                                            {template.language}
                                        </span>
                                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                                            template.category === 'MARKETING' 
                                                ? 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400'
                                                : template.category === 'UTILITY'
                                                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400'
                                                : 'bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400'
                                        }`}>
                                            {template.category}
                                        </span>
                                        {hasVariables && (
                                            <span className="text-[10px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 px-1.5 py-0.5 rounded ml-auto flex items-center gap-0.5">
                                                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                                                </svg>
                                                {variables.length}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Variable Input Dialog */}
            <Dialog open={showVariableDialog} onOpenChange={(open) => {
                setShowVariableDialog(open)
                // Reset state when dialog closes
                if (!open) {
                    setVariableValues({})
                    setSelectedTemplate(null)
                }
            }}>
                <DialogContent className="max-w-lg max-h-[85vh] flex flex-col">
                    <DialogHeader className="flex-shrink-0">
                        <DialogTitle>Fill Template Variables</DialogTitle>
                        <DialogDescription>
                            Enter values for the template variables before sending.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto min-h-0">
                        {selectedTemplate && (
                            <VariableInputForm
                                key={selectedTemplate.id || selectedTemplate.templateName} // Force re-render on template change
                                template={selectedTemplate}
                                variableValues={variableValues}
                                onVariableChange={(varNum, value) => {
                                    setVariableValues(prev => ({
                                        ...prev,
                                        [varNum]: value
                                    }))
                                }}
                            />
                        )}
                    </div>
                    <DialogFooter className="flex-shrink-0">
                        <Button 
                            variant="outline" 
                            onClick={() => {
                                setShowVariableDialog(false)
                                setVariableValues({})
                                setSelectedTemplate(null)
                            }}
                        >
                            {t('cancel')}
                        </Button>
                        <Button 
                            onClick={() => {
                                // Extract all variables from template
                                const variables = extractTemplateVariables(selectedTemplate)
                                
                                // Build components for WhatsApp API
                                const components: any[] = []
                                
                                // 1. Header component (for media)
                                const headerVar = variables.find(v => v.type === 'header_media')
                                if (headerVar && variableValues[headerVar.key]) {
                                    const mediaType = headerVar.key.replace('header_', '') // image, video, document
                                    components.push({
                                        type: "header",
                                        parameters: [{
                                            type: mediaType,
                                            [mediaType]: { link: variableValues[headerVar.key] }
                                        }]
                                    })
                                }
                                
                                // 2. Body component
                                const bodyVars = variables.filter(v => v.type === 'body')
                                if (bodyVars.length > 0) {
                                    const sortedVars = [...bodyVars].sort((a, b) => parseInt(a.key) - parseInt(b.key))
                                    const bodyParameters = sortedVars.map(v => ({
                                        type: "text",
                                        text: variableValues[v.key]?.trim() || ''
                                    }))
                                    components.push({
                                        type: "body",
                                        parameters: bodyParameters
                                    })
                                }
                                
                                // 3. Button components (URL suffix and Copy Code)
                                const buttonVars = variables.filter(v => v.type === 'button')
                                buttonVars.forEach(v => {
                                    const idx = parseInt(v.key.replace('button_', ''))
                                    if (variableValues[v.key]) {
                                        components.push({
                                            type: "button",
                                            sub_type: "url",
                                            index: idx,
                                            parameters: [{
                                                type: "text",
                                                text: variableValues[v.key]
                                            }]
                                        })
                                    }
                                })
                                
                                const copyCodeVars = variables.filter(v => v.type === 'copy_code')
                                copyCodeVars.forEach(v => {
                                    const match = v.key.match(/button_(\d+)_copy_code/)
                                    const idx = match ? parseInt(match[1]) : 0
                                    if (variableValues[v.key]) {
                                        components.push({
                                            type: "button",
                                            sub_type: "copy_code",
                                            index: idx,
                                            parameters: [{
                                                type: "coupon_code",
                                                coupon_code: variableValues[v.key]
                                            }]
                                        })
                                    }
                                })
                                
                                // Send with both variableValues AND pre-built components
                                onSendTemplate({ ...selectedTemplate, variableValues, components: components.length > 0 ? components : undefined })
                                setShowVariableDialog(false)
                                setVariableValues({})
                                setSelectedTemplate(null)
                            }}
                            disabled={sending}
                        >
                            Send Template
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* CTA Dialog */}
            <Dialog open={showCtaDialog} onOpenChange={setShowCtaDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send CTA Message</DialogTitle>
                        <DialogDescription>
                            Send a message with a Call-to-Action button.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Header Image URL (Optional)</Label>
                            <Input
                                placeholder="https://example.com/image.jpg"
                                value={ctaForm.headerImageUrl}
                                onChange={e => setCtaForm({ ...ctaForm, headerImageUrl: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Body Text</Label>
                            <Textarea
                                placeholder="Enter your message..."
                                value={ctaForm.bodyText}
                                onChange={e => setCtaForm({ ...ctaForm, bodyText: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Footer Text (Optional)</Label>
                            <Input
                                placeholder="Footer text"
                                value={ctaForm.footerText}
                                onChange={e => setCtaForm({ ...ctaForm, footerText: e.target.value })}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Button Label</Label>
                                <Input
                                    placeholder="Visit Website"
                                    value={ctaForm.buttonLabel}
                                    onChange={e => setCtaForm({ ...ctaForm, buttonLabel: e.target.value })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Button URL</Label>
                                <Input
                                    placeholder="https://..."
                                    value={ctaForm.buttonUrl}
                                    onChange={e => setCtaForm({ ...ctaForm, buttonUrl: e.target.value })}
                                />
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCtaDialog(false)}>{t('cancel')}</Button>
                        <Button onClick={() => {
                            onSendCta(ctaForm)
                            setShowCtaDialog(false)
                        }} disabled={sending}>Send Message</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reply Buttons Dialog */}
            <Dialog open={showReplyDialog} onOpenChange={setShowReplyDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Send Reply Buttons</DialogTitle>
                        <DialogDescription>
                            Send a message with up to 3 quick reply buttons.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Header Image (Optional)</Label>
                            <Input
                                type="file"
                                accept="image/*"
                                onChange={e => setReplyForm({ ...replyForm, headerImage: e.target.files?.[0] || null })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Body Text</Label>
                            <Textarea
                                placeholder="Enter your message..."
                                value={replyForm.bodyText}
                                onChange={e => setReplyForm({ ...replyForm, bodyText: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Footer Text (Optional)</Label>
                            <Input
                                placeholder="Footer text"
                                value={replyForm.footerText}
                                onChange={e => setReplyForm({ ...replyForm, footerText: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Buttons (Max 3)</Label>
                            {replyForm.buttons.map((btn, idx) => (
                                <div key={btn.id} className="flex gap-2">
                                    <Input
                                        placeholder={`Button ${idx + 1}`}
                                        value={btn.title}
                                        onChange={e => {
                                            const newButtons = [...replyForm.buttons]
                                            newButtons[idx].title = e.target.value
                                            setReplyForm({ ...replyForm, buttons: newButtons })
                                        }}
                                    />
                                    {idx > 0 && (
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => {
                                                const newButtons = replyForm.buttons.filter((_, i) => i !== idx)
                                                setReplyForm({ ...replyForm, buttons: newButtons })
                                            }}
                                        >
                                            <X className="h-4 w-4" />
                                        </Button>
                                    )}
                                </div>
                            ))}
                            {replyForm.buttons.length < 3 && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setReplyForm({
                                        ...replyForm,
                                        buttons: [...replyForm.buttons, { id: `btn-${replyForm.buttons.length + 1}`, title: "" }]
                                    })}
                                >
                                    <Plus className="mr-2 h-4 w-4" /> Add Button
                                </Button>
                            )}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReplyDialog(false)}>{t('cancel')}</Button>
                        <Button onClick={() => {
                            onSendReplyButtons(replyForm)
                            setShowReplyDialog(false)
                        }} disabled={sending}>Send Message</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Carousel Dialog */}
            <Dialog open={showCarouselDialog} onOpenChange={handleCarouselDialogChange}>
                <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Send Carousel Message</DialogTitle>
                        <DialogDescription>
                            Build a WhatsApp carousel with 2 to 10 cards.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-5 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="carousel-body-text">Carousel Body Text</Label>
                            <Textarea
                                id="carousel-body-text"
                                placeholder="Enter carousel body text..."
                                value={carouselForm.bodyText}
                                onChange={e => setCarouselForm({ ...carouselForm, bodyText: e.target.value })}
                            />
                        </div>

                        <div className="space-y-3">
                            <Label>Button Mode</Label>
                            <RadioGroup
                                value={carouselForm.mode}
                                onValueChange={(value) => setCarouselForm({
                                    ...carouselForm,
                                    mode: value as CarouselMode,
                                })}
                                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                            >
                                <Label htmlFor="carousel-mode-url" className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                                    <RadioGroupItem value="url" id="carousel-mode-url" />
                                    <div>
                                        <div className="font-medium">URL</div>
                                        <div className="text-sm text-muted-foreground">Each card gets its own link button.</div>
                                    </div>
                                </Label>
                                <Label htmlFor="carousel-mode-quick-reply" className="flex items-center gap-3 rounded-lg border p-3 cursor-pointer">
                                    <RadioGroupItem value="quick_reply" id="carousel-mode-quick-reply" />
                                    <div>
                                        <div className="font-medium">Quick Reply</div>
                                        <div className="text-sm text-muted-foreground">All cards share the same quick reply buttons.</div>
                                    </div>
                                </Label>
                            </RadioGroup>
                        </div>

                        {carouselForm.mode === "quick_reply" && (
                            <div className="space-y-3 rounded-lg border bg-muted/20 p-4">
                                <div className="flex items-center justify-between">
                                    <Label className="text-base font-semibold">Shared Quick Reply Buttons</Label>
                                    {carouselForm.sharedButtons.length < 3 && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setCarouselForm({
                                                ...carouselForm,
                                                sharedButtons: [...carouselForm.sharedButtons, { title: "" }],
                                            })}
                                        >
                                            <Plus className="mr-2 h-4 w-4" /> Add Button
                                        </Button>
                                    )}
                                </div>
                                {carouselForm.sharedButtons.map((button, buttonIndex) => (
                                    <div key={buttonIndex} className="flex items-center gap-2">
                                        <div className="flex-1 space-y-2">
                                            <Label htmlFor={`carousel-shared-button-${buttonIndex}`}>Shared Button {buttonIndex + 1} Title</Label>
                                            <Input
                                                id={`carousel-shared-button-${buttonIndex}`}
                                                placeholder={`Button ${buttonIndex + 1}`}
                                                value={button.title}
                                                onChange={e => {
                                                    const sharedButtons = [...carouselForm.sharedButtons]
                                                    sharedButtons[buttonIndex].title = e.target.value
                                                    setCarouselForm({ ...carouselForm, sharedButtons })
                                                }}
                                            />
                                        </div>
                                        {carouselForm.sharedButtons.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="icon"
                                                onClick={() => setCarouselForm({
                                                    ...carouselForm,
                                                    sharedButtons: carouselForm.sharedButtons.filter((_, index) => index !== buttonIndex),
                                                })}
                                            >
                                                <X className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Cards</Label>
                                {carouselForm.cards.length < 10 && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setCarouselForm({
                                            ...carouselForm,
                                            cards: [...carouselForm.cards, createEmptyCarouselCard()],
                                        })}
                                    >
                                        <Plus className="mr-2 h-4 w-4" /> Add Card
                                    </Button>
                                )}
                            </div>

                            {carouselForm.cards.map((card, cardIndex) => (
                                <div key={cardIndex} className="space-y-4 rounded-lg border bg-muted/20 p-4">
                                    <div className="flex items-center justify-between">
                                        <div className="font-medium">Card {cardIndex + 1}</div>
                                        {carouselForm.cards.length > 2 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => setCarouselForm({
                                                    ...carouselForm,
                                                    cards: carouselForm.cards.filter((_, index) => index !== cardIndex),
                                                })}
                                            >
                                                <Trash2 className="mr-2 h-4 w-4" /> Remove
                                            </Button>
                                        )}
                                    </div>

                                    <div className="grid gap-4 sm:grid-cols-2">
                                        <div className="space-y-2">
                                            <Label htmlFor={`carousel-card-${cardIndex}-media-type`}>Card {cardIndex + 1} Media Type</Label>
                                            <select
                                                id={`carousel-card-${cardIndex}-media-type`}
                                                className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-2 text-sm shadow-xs"
                                                value={card.mediaType}
                                                onChange={e => {
                                                    const cards = [...carouselForm.cards]
                                                    cards[cardIndex].mediaType = e.target.value as "image" | "video"
                                                    setCarouselForm({ ...carouselForm, cards })
                                                }}
                                            >
                                                <option value="image">image</option>
                                                <option value="video">video</option>
                                            </select>
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor={`carousel-card-${cardIndex}-media-url`}>Card {cardIndex + 1} Media URL</Label>
                                            <Input
                                                id={`carousel-card-${cardIndex}-media-url`}
                                                placeholder="https://example.com/media.jpg"
                                                value={card.mediaUrl}
                                                onChange={e => {
                                                    const cards = [...carouselForm.cards]
                                                    cards[cardIndex].mediaUrl = e.target.value
                                                    setCarouselForm({ ...carouselForm, cards })
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <Label htmlFor={`carousel-card-${cardIndex}-body-text`}>Card {cardIndex + 1} Body Text</Label>
                                        <Textarea
                                            id={`carousel-card-${cardIndex}-body-text`}
                                            placeholder="Optional card body"
                                            value={card.bodyText}
                                            onChange={e => {
                                                const cards = [...carouselForm.cards]
                                                cards[cardIndex].bodyText = e.target.value
                                                setCarouselForm({ ...carouselForm, cards })
                                            }}
                                        />
                                    </div>

                                    {carouselForm.mode === "url" && (
                                        <div className="grid gap-4 sm:grid-cols-2">
                                            <div className="space-y-2">
                                                <Label htmlFor={`carousel-card-${cardIndex}-button-label`}>Card {cardIndex + 1} Button Label</Label>
                                                <Input
                                                    id={`carousel-card-${cardIndex}-button-label`}
                                                    placeholder="Open card"
                                                    value={card.buttonLabel}
                                                    onChange={e => {
                                                        const cards = [...carouselForm.cards]
                                                        cards[cardIndex].buttonLabel = e.target.value
                                                        setCarouselForm({ ...carouselForm, cards })
                                                    }}
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label htmlFor={`carousel-card-${cardIndex}-button-url`}>Card {cardIndex + 1} Button URL</Label>
                                                <Input
                                                    id={`carousel-card-${cardIndex}-button-url`}
                                                    placeholder="https://example.com/card"
                                                    value={card.buttonUrl}
                                                    onChange={e => {
                                                        const cards = [...carouselForm.cards]
                                                        cards[cardIndex].buttonUrl = e.target.value
                                                        setCarouselForm({ ...carouselForm, cards })
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => handleCarouselDialogChange(false)}>{t('cancel')}</Button>
                        <Button onClick={handleCarouselSubmit} disabled={sending || !isCarouselValid}>Send Carousel Message</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* List Message Dialog */}
            <Dialog open={showListDialog} onOpenChange={(open) => {
                setShowListDialog(open)
                if (!open) {
                    // Reset form when closing
                    setListForm({
                        headerText: "",
                        bodyText: "",
                        footerText: "",
                        buttonText: "",
                        sections: [{
                            title: "",
                            rows: [{ id: "row-1", title: "", description: "" }]
                        }]
                    })
                }
            }}>
                <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Send List Message</DialogTitle>
                        <DialogDescription>
                            Create an interactive list for customers to choose from. Max 10 sections, 10 rows per section.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Header Text (Optional, max 60 chars)</Label>
                            <Input
                                placeholder="Header text"
                                value={listForm.headerText}
                                maxLength={60}
                                onChange={e => setListForm({ ...listForm, headerText: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Body Text (Required, max 1024 chars)</Label>
                            <Textarea
                                placeholder="Enter your message..."
                                value={listForm.bodyText}
                                maxLength={1024}
                                onChange={e => setListForm({ ...listForm, bodyText: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Footer Text (Optional, max 60 chars)</Label>
                            <Input
                                placeholder="Footer text"
                                value={listForm.footerText}
                                maxLength={60}
                                onChange={e => setListForm({ ...listForm, footerText: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Button Text (Required, max 20 chars)</Label>
                            <Input
                                placeholder="View Options"
                                value={listForm.buttonText}
                                maxLength={20}
                                onChange={e => setListForm({ ...listForm, buttonText: e.target.value })}
                            />
                        </div>

                        {/* Sections */}
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <Label className="text-base font-semibold">Sections</Label>
                                {listForm.sections.length < 10 && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setListForm({
                                            ...listForm,
                                            sections: [...listForm.sections, {
                                                title: "",
                                                rows: [{ id: `row-${Date.now()}`, title: "", description: "" }]
                                            }]
                                        })}
                                    >
                                        <Plus className="mr-2 h-4 w-4" /> Add Section
                                    </Button>
                                )}
                            </div>

                            {listForm.sections.map((section, sectionIdx) => (
                                <div key={sectionIdx} className="border rounded-lg p-4 space-y-3 bg-muted/30">
                                    <div className="flex items-center justify-between">
                                        <Label className="font-medium">Section {sectionIdx + 1}</Label>
                                        {listForm.sections.length > 1 && (
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="text-destructive hover:text-destructive"
                                                onClick={() => {
                                                    const newSections = listForm.sections.filter((_, i) => i !== sectionIdx)
                                                    setListForm({ ...listForm, sections: newSections })
                                                }}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        <Label className="text-sm text-muted-foreground">
                                            Section Title {listForm.sections.length > 1 ? "(Required)" : "(Optional)"} - max 24 chars
                                        </Label>
                                        <Input
                                            placeholder="Section title"
                                            value={section.title}
                                            maxLength={24}
                                            onChange={e => {
                                                const newSections = [...listForm.sections]
                                                newSections[sectionIdx].title = e.target.value
                                                setListForm({ ...listForm, sections: newSections })
                                            }}
                                        />
                                    </div>

                                    {/* Rows */}
                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <Label className="text-sm text-muted-foreground">Rows</Label>
                                            {section.rows.length < 10 && (
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                        const newSections = [...listForm.sections]
                                                        newSections[sectionIdx].rows.push({
                                                            id: `row-${Date.now()}`,
                                                            title: "",
                                                            description: ""
                                                        })
                                                        setListForm({ ...listForm, sections: newSections })
                                                    }}
                                                >
                                                    <Plus className="mr-1 h-3 w-3" /> Add Row
                                                </Button>
                                            )}
                                        </div>

                                        {section.rows.map((row, rowIdx) => (
                                            <div key={row.id} className="flex gap-2 items-start bg-background p-2 rounded border">
                                                <div className="flex-1 space-y-2">
                                                    <Input
                                                        placeholder="Row title (max 24 chars)"
                                                        value={row.title}
                                                        maxLength={24}
                                                        onChange={e => {
                                                            const newSections = [...listForm.sections]
                                                            newSections[sectionIdx].rows[rowIdx].title = e.target.value
                                                            setListForm({ ...listForm, sections: newSections })
                                                        }}
                                                    />
                                                    <Input
                                                        placeholder="Description (optional, max 72 chars)"
                                                        value={row.description}
                                                        maxLength={72}
                                                        className="text-sm"
                                                        onChange={e => {
                                                            const newSections = [...listForm.sections]
                                                            newSections[sectionIdx].rows[rowIdx].description = e.target.value
                                                            setListForm({ ...listForm, sections: newSections })
                                                        }}
                                                    />
                                                </div>
                                                {section.rows.length > 1 && (
                                                    <Button
                                                        type="button"
                                                        variant="ghost"
                                                        size="icon"
                                                        className="flex-shrink-0"
                                                        onClick={() => {
                                                            const newSections = [...listForm.sections]
                                                            newSections[sectionIdx].rows = section.rows.filter((_, i) => i !== rowIdx)
                                                            setListForm({ ...listForm, sections: newSections })
                                                        }}
                                                    >
                                                        <X className="h-4 w-4" />
                                                    </Button>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowListDialog(false)}>{t('cancel')}</Button>
                        <Button
                            onClick={() => {
                                onSendListMessage(listForm)
                                setShowListDialog(false)
                                // Reset form
                                setListForm({
                                    headerText: "",
                                    bodyText: "",
                                    footerText: "",
                                    buttonText: "",
                                    sections: [{
                                        title: "",
                                        rows: [{ id: "row-1", title: "", description: "" }]
                                    }]
                                })
                            }}
                            disabled={sending || !listForm.bodyText.trim() || !listForm.buttonText.trim() ||
                                listForm.sections.some(s => s.rows.some(r => !r.title.trim()))}
                        >
                            Send List Message
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    )
}
