"use client"

import { useState, useEffect } from "react"
import { cn } from "@/lib/utils"

// API key prefix from environment - used for placeholder
const API_KEY_PREFIX = `${process.env.NEXT_PUBLIC_API_KEY_PREFIX || 'kc'}_live_`
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  IconPlayerPlay,
  IconTrash,
  IconCheck,
  IconX,
  IconLoader2,
  IconKey,
  IconChevronDown,
  IconEye,
  IconEyeOff,
} from "@tabler/icons-react"
import { Link } from "@/i18n/routing"

interface Endpoint {
  id: string
  method: "GET" | "POST" | "PUT" | "DELETE"
  path: string
  label: string
  defaultBody?: string
}

const endpoints: Endpoint[] = [
  {
    id: "list-phone-numbers",
    method: "GET",
    path: "/api/v1/public/phone-numbers",
    label: "List Phone Numbers",
  },
  {
    id: "list-instagram-accounts",
    method: "GET",
    path: "/api/v1/public/instagram-accounts",
    label: "List Instagram Accounts",
  },
  {
    id: "list-facebook-pages",
    method: "GET",
    path: "/api/v1/public/facebook-pages",
    label: "List Facebook Pages",
  },
  {
    id: "send-message",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send WhatsApp Text",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "whatsapp",
        message_type: "text",
        content: "Hello from API Playground!",
        whatsapp_phone_number_id: "",
      },
      null,
      2
    ),
  },
  {
    id: "send-template",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send WhatsApp Template",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "whatsapp",
        message_type: "template",
        whatsapp_phone_number_id: "",
        template: {
          name: "hello_world",
          language: { code: "en_US" },
        },
      },
      null,
      2
    ),
  },
  {
    id: "send-instagram-text",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send Instagram Text",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "instagram",
        message_type: "text",
        content: "Hello from API Playground!",
      },
      null,
      2
    ),
  },
  {
    id: "send-instagram-image",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send Instagram Image",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "instagram",
        message_type: "image",
        media_url: "https://example.com/image.jpg",
      },
      null,
      2
    ),
  },
  {
    id: "send-messenger-text",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send Messenger Text",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "messenger",
        message_type: "text",
        content: "Hello from API Playground!",
      },
      null,
      2
    ),
  },
  {
    id: "send-messenger-image",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send Messenger Image",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "messenger",
        message_type: "image",
        media_url: "https://example.com/image.jpg",
      },
      null,
      2
    ),
  },
  {
    id: "send-interactive",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send WhatsApp CTA URL",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "whatsapp",
        message_type: "interactive",
        whatsapp_phone_number_id: "",
        interactive: {
          type: "cta_url",
          body: {
            text: "Check out our latest products!",
          },
          footer: {
            text: "Tap the button below",
          },
          action: {
            name: "cta_url",
            parameters: {
              display_text: "Visit Store",
              url: "https://example.com/store",
            },
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: "send-reply-buttons",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send WhatsApp Reply Buttons",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "whatsapp",
        message_type: "interactive",
        whatsapp_phone_number_id: "",
        interactive: {
          type: "button",
          body: {
            text: "How would you rate our service?",
          },
          footer: {
            text: "Your feedback helps us improve",
          },
          action: {
            buttons: [
              {
                type: "reply",
                reply: { id: "rating_good", title: "Good" },
              },
              {
                type: "reply",
                reply: { id: "rating_ok", title: "Okay" },
              },
              {
                type: "reply",
                reply: { id: "rating_bad", title: "Bad" },
              },
            ],
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: "send-carousel-url",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send WhatsApp Carousel URL",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "whatsapp",
        message_type: "interactive",
        whatsapp_phone_number_id: "",
        interactive: {
          type: "carousel",
          body: {
            text: "Featured products",
          },
          action: {
            cards: [
              {
                card_index: 0,
                type: "cta_url",
                header: {
                  type: "image",
                  image: {
                    link: "https://example.com/card-1.jpg",
                  },
                },
                body: {
                  text: "Card 1 description",
                },
                action: {
                  name: "cta_url",
                  parameters: {
                    display_text: "Open Card 1",
                    url: "https://example.com/card-1",
                  },
                },
              },
              {
                card_index: 1,
                type: "cta_url",
                header: {
                  type: "video",
                  video: {
                    link: "https://example.com/card-2.mp4",
                  },
                },
                body: {
                  text: "Card 2 description",
                },
                action: {
                  name: "cta_url",
                  parameters: {
                    display_text: "Open Card 2",
                    url: "https://example.com/card-2",
                  },
                },
              },
            ],
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: "send-carousel-quick-reply",
    method: "POST",
    path: "/api/v1/public/messages/send",
    label: "Send WhatsApp Carousel Quick Reply",
    defaultBody: JSON.stringify(
      {
        phone_number: "628123456789",
        channel: "whatsapp",
        message_type: "interactive",
        whatsapp_phone_number_id: "",
        interactive: {
          type: "carousel",
          body: {
            text: "Choose a product",
          },
          action: {
            cards: [
              {
                card_index: 0,
                type: "cta_url",
                header: {
                  type: "image",
                  image: {
                    link: "https://example.com/card-a.jpg",
                  },
                },
                body: {
                  text: "Card A",
                },
                action: {
                  buttons: [
                    {
                      type: "quick_reply",
                      quick_reply: {
                        id: "card-a-buy",
                        title: "Buy",
                      },
                    },
                    {
                      type: "quick_reply",
                      quick_reply: {
                        id: "card-a-later",
                        title: "Later",
                      },
                    },
                  ],
                },
              },
              {
                card_index: 1,
                type: "cta_url",
                header: {
                  type: "video",
                  video: {
                    link: "https://example.com/card-b.mp4",
                  },
                },
                body: {
                  text: "Card B",
                },
                action: {
                  buttons: [
                    {
                      type: "quick_reply",
                      quick_reply: {
                        id: "card-b-buy",
                        title: "Buy",
                      },
                    },
                    {
                      type: "quick_reply",
                      quick_reply: {
                        id: "card-b-later",
                        title: "Later",
                      },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
      null,
      2
    ),
  },
  {
    id: "typing-indicator",
    method: "POST",
    path: "/api/v1/public/conversations/628123456789/typing",
    label: "Send Typing Indicator",
    defaultBody: JSON.stringify(
      {
        channel: "whatsapp",
        whatsapp_phone_number_id: "",
      },
      null,
      2
    ),
  },
  {
    id: "mark-as-read",
    method: "POST",
    path: "/api/v1/public/messages/msg_xyz789/read",
    label: "Mark Message as Read",
    defaultBody: JSON.stringify({}, null, 2),
  },
]

interface HistoryItem {
  id: string
  endpoint: string
  method: string
  status: number
  timestamp: Date
  success: boolean
}

interface ApiPlaygroundProps {
  activeSection: string
}

export function ApiPlayground({ activeSection }: ApiPlaygroundProps) {
  const [selectedEndpoint, setSelectedEndpoint] = useState(endpoints[0].id)
  const [requestBody, setRequestBody] = useState(endpoints[0].defaultBody || "")
  const [response, setResponse] = useState<string | null>(null)
  const [responseStatus, setResponseStatus] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<HistoryItem[]>([])
  
  // API Key state
  const [apiKey, setApiKey] = useState("")
  const [showApiKey, setShowApiKey] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(true)

  // Load API key and history from localStorage
  useEffect(() => {
    const savedKey = localStorage.getItem("api-playground-key")
    if (savedKey) {
      setApiKey(savedKey)
      setSettingsOpen(false)
    }

    const savedHistory = localStorage.getItem("api-playground-history")
    if (savedHistory) {
      try {
        const parsed = JSON.parse(savedHistory)
        setHistory(parsed.slice(0, 10))
      } catch {
        // Ignore
      }
    }
  }, [])

  // Save API key to localStorage
  const handleSaveApiKey = () => {
    if (apiKey.trim()) {
      localStorage.setItem("api-playground-key", apiKey.trim())
      setSettingsOpen(false)
    }
  }

  const handleClearApiKey = () => {
    setApiKey("")
    localStorage.removeItem("api-playground-key")
    setSettingsOpen(true)
  }

  // Sync endpoint with active section
  useEffect(() => {
    const matchingEndpoint = endpoints.find((e) => e.id === activeSection)
    if (matchingEndpoint) {
      setSelectedEndpoint(matchingEndpoint.id)
      setRequestBody(matchingEndpoint.defaultBody || "")
      setResponse(null)
      setResponseStatus(null)
    }
  }, [activeSection])

  const currentEndpoint = endpoints.find((e) => e.id === selectedEndpoint)

  const handleEndpointChange = (endpointId: string) => {
    setSelectedEndpoint(endpointId)
    const endpoint = endpoints.find((e) => e.id === endpointId)
    if (endpoint) {
      setRequestBody(endpoint.defaultBody || "")
      setResponse(null)
      setResponseStatus(null)
    }
  }

  const handleSendRequest = async () => {
    if (!currentEndpoint) return

    if (!apiKey.trim()) {
      setResponse(JSON.stringify({ error: "Please enter your API key first" }, null, 2))
      setResponseStatus(401)
      setSettingsOpen(true)
      return
    }

    setLoading(true)
    setResponse(null)
    setResponseStatus(null)

    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const res = await fetch(`${apiUrl}${currentEndpoint.path}`, {
        method: currentEndpoint.method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey.trim()}`,
        },
        ...(currentEndpoint.method !== "GET" && { body: requestBody }),
      })

      const data = await res.json()
      setResponse(JSON.stringify(data, null, 2))
      setResponseStatus(res.status)

      // Add to history
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        endpoint: currentEndpoint.path,
        method: currentEndpoint.method,
        status: res.status,
        timestamp: new Date(),
        success: res.ok,
      }
      const newHistory = [newItem, ...history].slice(0, 10)
      setHistory(newHistory)
      localStorage.setItem("api-playground-history", JSON.stringify(newHistory))
    } catch (_error) {
      setResponse(JSON.stringify({ error: "Request failed. Check your network connection." }, null, 2))
      setResponseStatus(500)
    } finally {
      setLoading(false)
    }
  }

  const clearHistory = () => {
    setHistory([])
    localStorage.removeItem("api-playground-history")
  }

  const formatTime = (date: Date) => {
    const now = new Date()
    const diff = now.getTime() - new Date(date).getTime()
    const seconds = Math.floor(diff / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    if (seconds < 60) return `${seconds}s ago`
    if (minutes < 60) return `${minutes}m ago`
    return `${hours}h ago`
  }

  const hasApiKey = apiKey.trim().length > 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b p-4">
        <h3 className="font-semibold">API Playground</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Test API endpoints in real-time
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* API Key Settings */}
        <Collapsible open={settingsOpen} onOpenChange={setSettingsOpen}>
          <CollapsibleTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "w-full justify-between",
                hasApiKey ? "border-green-500/50" : "border-amber-500/50"
              )}
            >
              <span className="flex items-center gap-2">
                <IconKey className="h-4 w-4" />
                {hasApiKey ? "API Key Configured" : "Set API Key"}
              </span>
              <IconChevronDown className={cn(
                "h-4 w-4 transition-transform",
                settingsOpen && "rotate-180"
              )} />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3 space-y-3">
            <div className="space-y-2">
              <Label htmlFor="api-key">API Key</Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="api-key"
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={`${API_KEY_PREFIX}...`}
                    className="pr-10 font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowApiKey(!showApiKey)}
                  >
                    {showApiKey ? (
                      <IconEyeOff className="h-4 w-4" />
                    ) : (
                      <IconEye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSaveApiKey} disabled={!apiKey.trim()}>
                  Save Key
                </Button>
                {hasApiKey && (
                  <Button size="sm" variant="outline" onClick={handleClearApiKey}>
                    Clear
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Get your API key from{" "}
                <Link href="/developers/api-keys" className="text-primary hover:underline">
                  API Keys page
                </Link>
                . Key is stored locally in your browser.
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Endpoint Selector */}
        <div className="space-y-2">
          <Label>Endpoint</Label>
          <Select value={selectedEndpoint} onValueChange={handleEndpointChange}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {endpoints.map((endpoint) => (
                <SelectItem key={endpoint.id} value={endpoint.id}>
                  <span className="flex items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn(
                        "text-[10px] px-1",
                        endpoint.method === "POST" && "border-green-500 text-green-600",
                        endpoint.method === "GET" && "border-blue-500 text-blue-600"
                      )}
                    >
                      {endpoint.method}
                    </Badge>
                    {endpoint.label}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {currentEndpoint && (
            <code className="block text-xs text-muted-foreground bg-muted rounded px-2 py-1">
              {currentEndpoint.path}
            </code>
          )}
        </div>

        {/* Request Body */}
        <div className="space-y-2">
          <Label>Request Body</Label>
          <textarea
            value={requestBody}
            onChange={(e) => setRequestBody(e.target.value)}
            className="w-full h-40 font-mono text-xs bg-muted rounded-lg p-3 resize-none border-0 focus:ring-1 focus:ring-primary"
            placeholder="Enter JSON body..."
          />
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSendRequest}
          disabled={loading}
          className="w-full"
        >
          {loading ? (
            <IconLoader2 className="h-4 w-4 animate-spin mr-2" />
          ) : (
            <IconPlayerPlay className="h-4 w-4 mr-2" />
          )}
          Send Request
        </Button>

        {/* Response */}
        {response && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Response</Label>
              <Badge
                variant={responseStatus && responseStatus < 400 ? "default" : "destructive"}
                className="text-xs"
              >
                {responseStatus && responseStatus < 400 ? (
                  <IconCheck className="h-3 w-3 mr-1" />
                ) : (
                  <IconX className="h-3 w-3 mr-1" />
                )}
                {responseStatus}
              </Badge>
            </div>
            <pre className="bg-muted rounded-lg p-3 text-xs font-mono overflow-x-auto max-h-48">
              {response}
            </pre>
          </div>
        )}

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>History ({history.length})</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={clearHistory}
                className="h-6 text-xs"
              >
                <IconTrash className="h-3 w-3 mr-1" />
                Clear
              </Button>
            </div>
            <div className="space-y-1">
              {history.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between text-xs bg-muted rounded px-2 py-1.5"
                >
                  <div className="flex items-center gap-2">
                    {item.success ? (
                      <IconCheck className="h-3 w-3 text-green-500" />
                    ) : (
                      <IconX className="h-3 w-3 text-red-500" />
                    )}
                    <span className="font-mono truncate max-w-[180px]">
                      {item.method} {item.endpoint}
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatTime(item.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
