"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { DocsLayout } from "../components/docs-layout"
import { DocsSidebar, navigation } from "../components/docs-sidebar"
import { DocsSection, DocsSubsection, DocsTip } from "../components/docs-section"
import { CodeBlock } from "../components/code-block"
import { CodeTabs } from "../components/code-tabs"
import { ParamsTable } from "../components/params-table"
import { EndpointBadge } from "../components/endpoint-badge"
import { ApiPlayground } from "../components/api-playground"
import { RoleGuard } from "@/components/auth/role-guard"
import { Link } from "@/i18n/routing"
import { useBranding } from "@/hooks/use-branding"

// Get all section IDs from navigation
const sectionIds = navigation.flatMap((group) => group.items.map((item) => item.id))

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState(sectionIds[0])
  const isScrollingRef = useRef(false)
  const { websiteName, n8nPackageName } = useBranding()

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"

  // Handle scroll-based active section using Intersection Observer
  useEffect(() => {
    const mainContent = document.getElementById("docs-content")
    if (!mainContent) return

    // Track which sections are currently intersecting
    const visibleSections = new Map<string, number>()

    const observer = new IntersectionObserver(
      (entries) => {
        // Skip updates during programmatic scrolling
        if (isScrollingRef.current) return

        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            // Store the intersection ratio for ranking
            visibleSections.set(entry.target.id, entry.intersectionRatio)
          } else {
            visibleSections.delete(entry.target.id)
          }
        })

        // Find the first visible section in document order
        if (visibleSections.size > 0) {
          for (const id of sectionIds) {
            if (visibleSections.has(id)) {
              setActiveSection(id)
              break
            }
          }
        }
      },
      {
        root: mainContent,
        // Trigger when section enters top 30% of container
        rootMargin: "-10% 0px -70% 0px",
        threshold: [0, 0.1, 0.5, 1],
      }
    )

    // Observe all section elements
    sectionIds.forEach((id) => {
      const element = document.getElementById(id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [])

  // Handle navigation click with smooth scroll
  const handleNavigate = useCallback((sectionId: string) => {
    setActiveSection(sectionId)

    // Temporarily disable observer updates during scroll
    isScrollingRef.current = true

    const mainContent = document.getElementById("docs-content")
    const element = document.getElementById(sectionId)

    if (element && mainContent) {
      const elementRect = element.getBoundingClientRect()
      const containerRect = mainContent.getBoundingClientRect()
      const relativeTop =
        elementRect.top - containerRect.top + mainContent.scrollTop

      mainContent.scrollTo({
        top: relativeTop - 24,
        behavior: "smooth",
      })

      // Re-enable observer after scroll animation completes
      setTimeout(() => {
        isScrollingRef.current = false
      }, 500)
    }
  }, [])

  return (
    <RoleGuard>
      <DocsLayout
        sidebar={
          <DocsSidebar
            activeSection={activeSection}
            onNavigate={handleNavigate}
          />
        }
        content={
          <div className="space-y-12">
            {/* Overview */}
            <DocsSection
              id="overview"
              title="Overview"
              description={`Welcome to the ${websiteName} API documentation. Learn how to integrate messaging capabilities into your applications.`}
            >
              <p className="text-muted-foreground">
                The {websiteName} API allows you to send messages via WhatsApp, Instagram, and Messenger,
                manage contacts, and receive real-time notifications through webhooks.
              </p>

              <div className="grid gap-4 md:grid-cols-2">
                <Link
                  href="/developers/api-keys"
                  className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <h4 className="font-semibold">API Keys</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Create and manage API keys for authentication
                  </p>
                </Link>
                <Link
                  href="/developers/webhooks"
                  className="block rounded-lg border p-4 hover:bg-muted/50 transition-colors"
                >
                  <h4 className="font-semibold">Webhooks</h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    Receive real-time event notifications
                  </p>
                </Link>
              </div>

              <DocsSubsection title="Base URL">
                <CodeBlock code={`${apiBaseUrl}/api/v1/public`} />
              </DocsSubsection>
            </DocsSection>

            {/* Authentication */}
            <DocsSection
              id="authentication"
              title="Authentication"
              description="All API requests require authentication using Bearer tokens."
            >
              <DocsSubsection title="Request Headers">
                <CodeBlock
                  code={`Authorization: Bearer YOUR_API_KEY
Content-Type: application/json`}
                />
              </DocsSubsection>

              <DocsTip variant="warning">
                <strong>Important:</strong> Keep your API keys secure. Never commit them to
                version control or expose them in client-side code.
              </DocsTip>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL",
                      code: `curl -X GET "${apiBaseUrl}/api/v1/public/health" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/health", {
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  }
});

const data = await response.json();`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.get(
    "${apiBaseUrl}/api/v1/public/health",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    }
)

data = response.json()`,
                    },
                  ]}
                />
              </DocsSubsection>
            </DocsSection>

            {/* List Phone Numbers */}
            <DocsSection
              id="list-phone-numbers"
              title="List Phone Numbers"
              description="Retrieve all WhatsApp phone numbers connected to your account. Use the returned ID when sending messages."
            >
              <EndpointBadge method="GET" path="/api/v1/public/phone-numbers" />

              <DocsTip>
                Use the <code className="bg-muted rounded px-1">id</code> field from the response as the{" "}
                <code className="bg-muted rounded px-1">whatsapp_phone_number_id</code> parameter when sending messages.
                If you only have one phone number, you can omit it and the API will use your primary number automatically.
              </DocsTip>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL",
                      code: `curl -X GET "${apiBaseUrl}/api/v1/public/phone-numbers" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/phone-numbers", {
  headers: {
    "Authorization": "Bearer YOUR_API_KEY"
  }
});

const { data } = await response.json();
// Use data[0].id as whatsapp_phone_number_id`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.get(
    "${apiBaseUrl}/api/v1/public/phone-numbers",
    headers={
        "Authorization": "Bearer YOUR_API_KEY"
    }
)

data = response.json()["data"]
# Use data[0]["id"] as whatsapp_phone_number_id`,
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Response">
                <CodeBlock
                  code={`{
  "success": true,
  "data": [
    {
      "id": "clyyy9876543210",
      "phone_number_id": "890836697444150",
      "display_phone_number": "+62 812-3456-7890",
      "verified_name": "My Business",
      "quality_rating": "GREEN",
      "is_primary": true,
      "waba_id": "123456789",
      "business_name": "My Company"
    },
    {
      "id": "clyyy1234567890",
      "phone_number_id": "940323022498623",
      "display_phone_number": "+62 878-9012-3456",
      "verified_name": "My Business CS",
      "quality_rating": "GREEN",
      "is_primary": false,
      "waba_id": "123456789",
      "business_name": "My Company"
    }
  ]
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Response Fields">
                <ParamsTable
                  parameters={[
                    {
                      name: "id",
                      type: "string",
                      required: true,
                      description: "Phone number record ID. Use this as whatsapp_phone_number_id when sending messages.",
                    },
                    {
                      name: "phone_number_id",
                      type: "string",
                      required: true,
                      description: "Meta phone number ID (from WhatsApp Business API).",
                    },
                    {
                      name: "display_phone_number",
                      type: "string",
                      required: true,
                      description: "Formatted phone number for display.",
                    },
                    {
                      name: "verified_name",
                      type: "string",
                      required: true,
                      description: "Business name verified by Meta.",
                    },
                    {
                      name: "quality_rating",
                      type: "string",
                      required: true,
                      description: 'Phone number quality rating: "GREEN", "YELLOW", or "RED".',
                    },
                    {
                      name: "is_primary",
                      type: "boolean",
                      required: true,
                      description: "Whether this is the primary (default) phone number.",
                    },
                    {
                      name: "waba_id",
                      type: "string",
                      required: true,
                      description: "WhatsApp Business Account ID this number belongs to.",
                    },
                    {
                      name: "business_name",
                      type: "string",
                      required: true,
                      description: "WABA business name.",
                    },
                  ]}
                />
              </DocsSubsection>
            </DocsSection>

            {/* List Instagram Accounts */}
            <DocsSection
              id="list-instagram-accounts"
              title="List Instagram Accounts"
              description="Retrieve all Instagram accounts connected to your account. Use the returned ID when sending Instagram messages."
            >
              <EndpointBadge method="GET" path="/api/v1/public/instagram-accounts" />

              <DocsTip>
                Use the <code className="bg-muted rounded px-1">id</code> field from the response as the{" "}
                <code className="bg-muted rounded px-1">instagram_account_id</code> parameter when sending Instagram messages.
                If you only have one Instagram account, you can omit it.
              </DocsTip>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL",
                      code: `curl -X GET "${apiBaseUrl}/api/v1/public/instagram-accounts" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/instagram-accounts", {
  headers: {
    "Authorization": "Bearer YOUR_API_KEY"
  }
});

const { data } = await response.json();
// Use data[0].id as instagram_account_id`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.get(
    "${apiBaseUrl}/api/v1/public/instagram-accounts",
    headers={
        "Authorization": "Bearer YOUR_API_KEY"
    }
)

data = response.json()["data"]
# Use data[0]["id"] as instagram_account_id`,
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Response">
                <CodeBlock
                  code={`{
  "success": true,
  "data": [
    {
      "id": "clxxx1234567890",
      "ig_id": "17841400123456789",
      "username": "mybusiness",
      "profile_pic_url": "https://...",
      "connection_status": "connected",
      "connected_at": "2026-01-15T08:00:00.000Z"
    }
  ]
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Response Fields">
                <ParamsTable
                  parameters={[
                    {
                      name: "id",
                      type: "string",
                      required: true,
                      description: "Account record ID. Use this as instagram_account_id when sending messages.",
                    },
                    {
                      name: "ig_id",
                      type: "string",
                      required: true,
                      description: "Instagram Professional Account ID.",
                    },
                    {
                      name: "username",
                      type: "string",
                      required: true,
                      description: "Instagram username.",
                    },
                    {
                      name: "profile_pic_url",
                      type: "string",
                      required: false,
                      description: "Profile picture URL.",
                    },
                    {
                      name: "connection_status",
                      type: "string",
                      required: true,
                      description: "Connection status (connected, disconnected, requires_reauth).",
                    },
                    {
                      name: "connected_at",
                      type: "string",
                      required: true,
                      description: "When this account was connected (ISO 8601).",
                    },
                  ]}
                />
              </DocsSubsection>
            </DocsSection>

            {/* List Facebook Pages */}
            <DocsSection
              id="list-facebook-pages"
              title="List Facebook Pages"
              description="Retrieve all Facebook Pages (Messenger) connected to your account. Use the returned ID when sending Messenger messages."
            >
              <EndpointBadge method="GET" path="/api/v1/public/facebook-pages" />

              <DocsTip>
                Use the <code className="bg-muted rounded px-1">id</code> field from the response as the{" "}
                <code className="bg-muted rounded px-1">facebook_page_id</code> parameter when sending Messenger messages.
                If you only have one Facebook Page, you can omit it.
              </DocsTip>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL",
                      code: `curl -X GET "${apiBaseUrl}/api/v1/public/facebook-pages" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/facebook-pages", {
  headers: {
    "Authorization": "Bearer YOUR_API_KEY"
  }
});

const { data } = await response.json();
// Use data[0].id as facebook_page_id`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.get(
    "${apiBaseUrl}/api/v1/public/facebook-pages",
    headers={
        "Authorization": "Bearer YOUR_API_KEY"
    }
)

data = response.json()["data"]
# Use data[0]["id"] as facebook_page_id`,
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Response">
                <CodeBlock
                  code={`{
  "success": true,
  "data": [
    {
      "id": "clzzz1234567890",
      "page_id": "123456789012345",
      "page_name": "My Business Page",
      "page_category": "Business",
      "profile_pic_url": "https://...",
      "connection_status": "connected",
      "connected_at": "2026-01-15T08:00:00.000Z"
    }
  ]
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Response Fields">
                <ParamsTable
                  parameters={[
                    {
                      name: "id",
                      type: "string",
                      required: true,
                      description: "Page record ID. Use this as facebook_page_id when sending Messenger messages.",
                    },
                    {
                      name: "page_id",
                      type: "string",
                      required: true,
                      description: "Facebook Page ID.",
                    },
                    {
                      name: "page_name",
                      type: "string",
                      required: true,
                      description: "Facebook Page name.",
                    },
                    {
                      name: "page_category",
                      type: "string",
                      required: false,
                      description: "Page category (e.g., Business, E-commerce).",
                    },
                    {
                      name: "profile_pic_url",
                      type: "string",
                      required: false,
                      description: "Page profile picture URL.",
                    },
                    {
                      name: "connection_status",
                      type: "string",
                      required: true,
                      description: "Connection status.",
                    },
                    {
                      name: "connected_at",
                      type: "string",
                      required: true,
                      description: "When this page was connected (ISO 8601).",
                    },
                  ]}
                />
              </DocsSubsection>
            </DocsSection>

            {/* Send Message */}
            <DocsSection
              id="send-message"
              title="Send Message"
              description="Send text messages to customers via WhatsApp, Instagram, or Messenger."
            >
              <EndpointBadge method="POST" path="/api/v1/public/messages/send" />

              <DocsSubsection title="Parameters">
                <ParamsTable
                  parameters={[
                    {
                      name: "phone_number",
                      type: "string",
                      required: false,
                      description: "Customer phone number. Use this to lookup customer for any channel.",
                    },
                    {
                      name: "customer_id",
                      type: "string",
                      required: false,
                      description: "Customer ID (CUID). Alternative to phone_number.",
                    },
                    {
                      name: "instagram_username",
                      type: "string",
                      required: false,
                      description: "Instagram username. Alternative lookup method.",
                    },
                    {
                      name: "channel",
                      type: "string",
                      required: true,
                      description: '"whatsapp", "instagram", or "messenger"',
                    },
                    {
                      name: "message_type",
                      type: "string",
                      required: true,
                      description: 'WhatsApp: "text", "image", "document", "audio", "video", "template". Instagram: "text", "image", "media_share". Messenger: "text", "image", "video", "audio", "file".',
                    },
                    {
                      name: "content",
                      type: "string",
                      required: false,
                      description: "Text message content (required for text messages)",
                    },
                    {
                      name: "media_url",
                      type: "string",
                      required: false,
                      description: "Media URL for image/video/audio/file messages",
                    },
                    {
                      name: "whatsapp_phone_number_id",
                      type: "string",
                      required: false,
                      description: "WhatsApp phone number ID. Use to specify which business phone number sends the message. If not provided, auto-resolved from customer linkage or primary number.",
                    },
                    {
                      name: "instagram_account_id",
                      type: "string",
                      required: false,
                      description: "Instagram account ID. Required when customer has conversations with multiple Instagram accounts.",
                    },
                    {
                      name: "facebook_page_id",
                      type: "string",
                      required: false,
                      description: "Facebook Page ID. Required when customer has conversations with multiple Facebook Pages.",
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsTip>
                <strong>Note:</strong> At least one of <code className="bg-muted rounded px-1">phone_number</code>,{" "}
                <code className="bg-muted rounded px-1">customer_id</code>, or{" "}
                <code className="bg-muted rounded px-1">instagram_username</code> is required to identify the customer.
              </DocsTip>

              <DocsTip variant="warning">
                <strong>Multi-Account / Multi-Number:</strong> For WhatsApp, use{" "}
                <code className="bg-muted rounded px-1">whatsapp_phone_number_id</code> to specify which business phone number
                sends the message. If omitted, the API auto-resolves from the customer&apos;s linked number or your primary number.
                For Instagram/Messenger, specify{" "}
                <code className="bg-muted rounded px-1">instagram_account_id</code> or{" "}
                <code className="bg-muted rounded px-1">facebook_page_id</code> when a customer has multiple conversations.
              </DocsTip>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL",
                      code: `curl -X POST "${apiBaseUrl}/api/v1/public/messages/send" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "phone_number": "628123456789",
    "channel": "whatsapp",
    "message_type": "text",
    "content": "Hello! This is a test message.",
    "whatsapp_phone_number_id": "clyyy9876543210"
  }'`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/messages/send", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    phone_number: "628123456789",
    channel: "whatsapp",
    message_type: "text",
    content: "Hello! This is a test message.",
    whatsapp_phone_number_id: "clyyy9876543210" // optional
  })
});`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.post(
    "${apiBaseUrl}/api/v1/public/messages/send",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    },
    json={
        "phone_number": "628123456789",
        "channel": "whatsapp",
        "message_type": "text",
        "content": "Hello! This is a test message.",
        "whatsapp_phone_number_id": "clyyy9876543210"  # optional
    }
)`,
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Response">
                <CodeBlock
                  code={`{
  "success": true,
  "data": {
    "message_id": "msg_xyz789",
    "customer_id": "clxxx1234567890",
    "whatsapp_phone_number_id": "clyyy9876543210",
    "status": "sent",
    "channel": "whatsapp",
    "timestamp": "2025-01-07T10:30:00.000Z"
  }
}`}
                />
              </DocsSubsection>

              <DocsTip>
                The <code className="bg-muted rounded px-1">whatsapp_phone_number_id</code> in the response
                indicates which business phone number was used to send the message. This is useful for tracking
                which number was used when you have multiple WhatsApp phone numbers connected.
              </DocsTip>
            </DocsSection>

            {/* Send Template */}
            <DocsSection
              id="send-template"
              title="Send Template"
              description="Send pre-approved WhatsApp template messages. Templates don't require a 24-hour messaging window."
            >
              <EndpointBadge method="POST" path="/api/v1/public/messages/send" />

              <DocsSubsection title="Parameters">
                <ParamsTable
                  parameters={[
                    {
                      name: "phone_number",
                      type: "string",
                      required: true,
                      description: "Recipient phone number in E.164 format",
                    },
                    {
                      name: "channel",
                      type: "string",
                      required: true,
                      description: 'Must be "whatsapp"',
                    },
                    {
                      name: "message_type",
                      type: "string",
                      required: true,
                      description: 'Must be "template"',
                    },
                    {
                      name: "template.name",
                      type: "string",
                      required: true,
                      description: "Template name as registered in Meta",
                    },
                    {
                      name: "template.language.code",
                      type: "string",
                      required: true,
                      description: 'Language code (e.g., "en_US", "id")',
                    },
                    {
                      name: "template.components",
                      type: "array",
                      required: false,
                      description: "Template variables for header, body, buttons",
                    },
                    {
                      name: "whatsapp_phone_number_id",
                      type: "string",
                      required: false,
                      description: "Specify which business phone number to send from. If omitted, auto-resolved.",
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Example with Body Variables">
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "template",
  "whatsapp_phone_number_id": "clyyy9876543210",
  "template": {
    "name": "order_confirmation",
    "language": { "code": "id" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "John Doe" },
          { "type": "text", "text": "INV-12345" }
        ]
      }
    ]
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Template with Header Media">
                <p className="text-muted-foreground text-sm mb-3">
                  For templates with image, video, or document headers, add a header component with the media URL.
                </p>
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "template",
  "template": {
    "name": "promo_with_image",
    "language": { "code": "id" },
    "components": [
      {
        "type": "header",
        "parameters": [
          { "type": "image", "image": { "link": "https://example.com/promo.jpg" } }
        ]
      },
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "FLASH SALE" },
          { "type": "text", "text": "50%" }
        ]
      }
    ]
  }
}`}
                />
                <div className="mt-3 space-y-2 text-sm">
                  <p className="font-medium">Supported header media types:</p>
                  <div className="grid gap-1 pl-4 text-muted-foreground">
                    <div><code className="bg-muted rounded px-1">image</code> - JPEG, PNG (max 5MB)</div>
                    <div><code className="bg-muted rounded px-1">video</code> - MP4 (max 16MB)</div>
                    <div><code className="bg-muted rounded px-1">document</code> - PDF, DOC (max 100MB)</div>
                  </div>
                </div>
              </DocsSubsection>

              <DocsSubsection title="Template with Dynamic URL Button">
                <p className="text-muted-foreground text-sm mb-3">
                  For templates with dynamic URL buttons (URL contains {"{{1}}"}), add a button component.
                </p>
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "template",
  "template": {
    "name": "order_tracking",
    "language": { "code": "id" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "INV-12345" }
        ]
      },
      {
        "type": "button",
        "sub_type": "url",
        "index": 0,
        "parameters": [
          { "type": "text", "text": "tracking-abc123" }
        ]
      }
    ]
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Template with Copy Code Button">
                <p className="text-muted-foreground text-sm mb-3">
                  For marketing templates with copy code buttons (coupon codes, promo codes).
                </p>
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "template",
  "template": {
    "name": "promo_code",
    "language": { "code": "id" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "FLASH SALE" }
        ]
      },
      {
        "type": "button",
        "sub_type": "copy_code",
        "index": 0,
        "parameters": [
          { "type": "coupon_code", "coupon_code": "SAVE20OFF" }
        ]
      }
    ]
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Authentication Template (OTP)">
                <p className="text-muted-foreground text-sm mb-3">
                  For authentication templates with OTP codes. Include both body and copy code button.
                </p>
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "template",
  "template": {
    "name": "otp_verification",
    "language": { "code": "id" },
    "components": [
      {
        "type": "body",
        "parameters": [
          { "type": "text", "text": "123456" }
        ]
      },
      {
        "type": "button",
        "sub_type": "copy_code",
        "index": 0,
        "parameters": [
          { "type": "coupon_code", "coupon_code": "123456" }
        ]
      }
    ]
  }
}`}
                />
                <DocsTip variant="warning">
                  For authentication templates, always include both the OTP in body parameters
                  AND in the copy code button to ensure users can both see and copy the code.
                </DocsTip>
              </DocsSubsection>

              <DocsSubsection title="Component Parameters Reference">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Component Type</th>
                        <th className="text-left p-3 font-medium">Parameter Type</th>
                        <th className="text-left p-3 font-medium">Usage</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-3"><code>header</code></td>
                        <td className="p-3 text-muted-foreground"><code>text</code>, <code>image</code>, <code>video</code>, <code>document</code></td>
                        <td className="p-3 text-muted-foreground">Header variables or media</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3"><code>body</code></td>
                        <td className="p-3 text-muted-foreground"><code>text</code>, <code>currency</code>, <code>date_time</code></td>
                        <td className="p-3 text-muted-foreground">Body text variables</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3"><code>button</code> (url)</td>
                        <td className="p-3 text-muted-foreground"><code>text</code></td>
                        <td className="p-3 text-muted-foreground">Dynamic URL suffix</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3"><code>button</code> (copy_code)</td>
                        <td className="p-3 text-muted-foreground"><code>coupon_code</code></td>
                        <td className="p-3 text-muted-foreground">Coupon/OTP code to copy</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DocsSubsection>

              <DocsTip>
                Template must be approved by Meta before use. The{" "}
                <code className="bg-muted rounded px-1">components</code> field is optional
                and only needed if your template has variables.
              </DocsTip>
            </DocsSection>

            {/* Send Media */}
            <DocsSection
              id="send-media"
              title="Send Media"
              description="Send images, documents, audio, or video files."
            >
              <EndpointBadge method="POST" path="/api/v1/public/messages/send" />

              <DocsSubsection title="Supported Media Types by Channel">
                <div className="space-y-4">
                  <div>
                    <h5 className="font-medium mb-2">WhatsApp</h5>
                    <div className="grid gap-2 text-sm pl-4">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">image</code>
                        <span className="text-muted-foreground">JPEG, PNG (max 5MB)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">document</code>
                        <span className="text-muted-foreground">PDF, DOC, DOCX (max 100MB)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">audio</code>
                        <span className="text-muted-foreground">MP3, OGG (max 16MB)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">video</code>
                        <span className="text-muted-foreground">MP4 (max 16MB)</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h5 className="font-medium mb-2">Instagram</h5>
                    <div className="grid gap-2 text-sm pl-4">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">image</code>
                        <span className="text-muted-foreground">JPEG, PNG</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">media_share</code>
                        <span className="text-muted-foreground">Share existing media</span>
                      </div>
                    </div>
                  </div>
                  <div>
                    <h5 className="font-medium mb-2">Messenger</h5>
                    <div className="grid gap-2 text-sm pl-4">
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">image</code>
                        <span className="text-muted-foreground">JPEG, PNG, GIF</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">video</code>
                        <span className="text-muted-foreground">MP4</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">audio</code>
                        <span className="text-muted-foreground">MP3, WAV</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <code className="bg-muted rounded px-2 py-1">file</code>
                        <span className="text-muted-foreground">Any file type</span>
                      </div>
                    </div>
                  </div>
                </div>
              </DocsSubsection>

              <DocsSubsection title="Example">
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "image",
  "media_url": "https://example.com/image.jpg",
  "caption": "Check out this image!",
  "whatsapp_phone_number_id": "clyyy9876543210"
}`}
                />
              </DocsSubsection>
            </DocsSection>

            {/* Send Interactive */}
            <DocsSection
              id="send-interactive"
              title="Send Interactive"
              description="Send WhatsApp interactive messages with CTA URL buttons, Reply buttons, or List Menu."
            >
              <EndpointBadge method="POST" path="/api/v1/public/messages/send" />

              <DocsTip>
                <strong>WhatsApp Only:</strong> Interactive messages are only available for WhatsApp channel.
                They require an active 24-hour messaging window.
              </DocsTip>

              <DocsSubsection title="Interactive Types">
                <div className="space-y-4">
                  <div>
                    <h5 className="font-medium mb-2">CTA URL Button</h5>
                    <p className="text-sm text-muted-foreground mb-2">
                      Send a message with a clickable URL button. Great for directing customers to your website,
                      tracking links, or external resources.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-medium mb-2">Reply Buttons</h5>
                    <p className="text-sm text-muted-foreground mb-2">
                      Send a message with up to 3 quick reply buttons. Perfect for surveys, confirmations,
                      or guiding customer choices.
                    </p>
                  </div>
                  <div>
                    <h5 className="font-medium mb-2">List Menu</h5>
                    <p className="text-sm text-muted-foreground mb-2">
                      Send a message with a list menu containing up to 10 sections and 10 items per section.
                      Ideal for product catalogs, service menus, or any scenario requiring organized selection options.
                    </p>
                  </div>
                </div>
              </DocsSubsection>

              <DocsSubsection title="CTA URL Button Example">
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "interactive",
  "whatsapp_phone_number_id": "clyyy9876543210",
  "interactive": {
    "type": "cta_url",
    "body": {
      "text": "Check out our latest products!"
    },
    "footer": {
      "text": "Tap the button below"
    },
    "action": {
      "name": "cta_url",
      "parameters": {
        "display_text": "Visit Store",
        "url": "https://example.com/store"
      }
    }
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Reply Buttons Example">
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "interactive",
  "whatsapp_phone_number_id": "clyyy9876543210",
  "interactive": {
    "type": "button",
    "body": {
      "text": "How would you rate our service?"
    },
    "footer": {
      "text": "Your feedback helps us improve"
    },
    "action": {
      "buttons": [
        {
          "type": "reply",
          "reply": { "id": "rating_good", "title": "Good" }
        },
        {
          "type": "reply",
          "reply": { "id": "rating_ok", "title": "Okay" }
        },
        {
          "type": "reply",
          "reply": { "id": "rating_bad", "title": "Bad" }
        }
      ]
    }
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="List Menu Example">
                <CodeBlock
                  code={`{
  "phone_number": "628123456789",
  "channel": "whatsapp",
  "message_type": "interactive",
  "whatsapp_phone_number_id": "clyyy9876543210",
  "interactive": {
    "type": "list",
    "body": {
      "text": "Please select a service from our menu"
    },
    "header": {
      "type": "text",
      "text": "Our Services"
    },
    "footer": {
      "text": "Tap the button to see options"
    },
    "action": {
      "button": "View Menu",
      "sections": [
        {
          "title": "Hair Services",
          "rows": [
            {
              "id": "haircut",
              "title": "Haircut",
              "description": "Basic haircut service"
            },
            {
              "id": "hair_coloring",
              "title": "Hair Coloring",
              "description": "Full hair coloring service"
            }
          ]
        },
        {
          "title": "Spa Services",
          "rows": [
            {
              "id": "massage",
              "title": "Massage",
              "description": "60-minute relaxing massage"
            },
            {
              "id": "facial",
              "title": "Facial Treatment",
              "description": "Deep cleansing facial"
            }
          ]
        }
      ]
    }
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Parameters">
                <ParamsTable
                  parameters={[
                    {
                      name: "interactive.type",
                      type: "string",
                      required: true,
                      description: '"cta_url" for URL button, "button" for reply buttons, or "list" for list menu',
                    },
                    {
                      name: "interactive.body.text",
                      type: "string",
                      required: true,
                      description: "Main message text (max 1024 characters)",
                    },
                    {
                      name: "interactive.header",
                      type: "object",
                      required: false,
                      description: "Optional header. For list type: text only (max 60 chars). For others: text, image, video, or document",
                    },
                    {
                      name: "interactive.footer.text",
                      type: "string",
                      required: false,
                      description: "Optional footer text (max 60 characters)",
                    },
                    {
                      name: "interactive.action",
                      type: "object",
                      required: true,
                      description: "Action configuration (CTA URL params, buttons array, or list sections)",
                    },
                    {
                      name: "interactive.action.button",
                      type: "string",
                      required: false,
                      description: 'For list type: Button text to open the list menu (max 20 characters)',
                    },
                    {
                      name: "interactive.action.sections",
                      type: "array",
                      required: false,
                      description: 'For list type: Array of sections (1-10 sections)',
                    },
                    {
                      name: "sections[].title",
                      type: "string",
                      required: false,
                      description: "Section title (max 24 characters)",
                    },
                    {
                      name: "sections[].rows",
                      type: "array",
                      required: true,
                      description: "Array of row items in the section (1-10 rows)",
                    },
                    {
                      name: "rows[].id",
                      type: "string",
                      required: true,
                      description: "Unique identifier for the row (max 200 characters). Returned in webhook when user selects this item",
                    },
                    {
                      name: "rows[].title",
                      type: "string",
                      required: true,
                      description: "Row title displayed to user (max 24 characters)",
                    },
                    {
                      name: "rows[].description",
                      type: "string",
                      required: false,
                      description: "Row description (max 72 characters)",
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Limits">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Element</th>
                        <th className="text-left p-3 font-medium">Limit</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-3">Body text</td>
                        <td className="p-3 text-muted-foreground">1024 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Header text</td>
                        <td className="p-3 text-muted-foreground">60 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Footer text</td>
                        <td className="p-3 text-muted-foreground">60 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Button title</td>
                        <td className="p-3 text-muted-foreground">20 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">CTA display text</td>
                        <td className="p-3 text-muted-foreground">20 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Reply buttons</td>
                        <td className="p-3 text-muted-foreground">Maximum 3 buttons</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Button ID</td>
                        <td className="p-3 text-muted-foreground">256 characters</td>
                      </tr>
                      <tr className="border-t bg-muted/30">
                        <td className="p-3 font-medium" colSpan={2}>List Menu Limits</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">List button text</td>
                        <td className="p-3 text-muted-foreground">20 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">List sections</td>
                        <td className="p-3 text-muted-foreground">1-10 sections</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Rows per section</td>
                        <td className="p-3 text-muted-foreground">1-10 rows</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Section title</td>
                        <td className="p-3 text-muted-foreground">24 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Row ID</td>
                        <td className="p-3 text-muted-foreground">200 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Row title</td>
                        <td className="p-3 text-muted-foreground">24 characters</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Row description</td>
                        <td className="p-3 text-muted-foreground">72 characters</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DocsSubsection>
            </DocsSection>

            {/* Typing Indicator */}
            <DocsSection
              id="typing-indicator"
              title="Typing Indicator"
              description='Send typing indicator ("sedang mengetik...") to customers before sending a message.'
            >
              <EndpointBadge method="POST" path="/api/v1/public/conversations/:customerIdentifier/typing" />

              <DocsSubsection title="URL Parameters">
                <ParamsTable
                  parameters={[
                    {
                      name: "customerIdentifier",
                      type: "string",
                      required: true,
                      description: "Customer ID (CUID), phone number, or Instagram username",
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Request Body (Optional)">
                <ParamsTable
                  parameters={[
                    {
                      name: "channel",
                      type: "string",
                      required: false,
                      description: '"whatsapp" or "instagram". Auto-detected if not provided.',
                    },
                    {
                      name: "whatsapp_phone_number_id",
                      type: "string",
                      required: false,
                      description: "WhatsApp phone number ID. Specify which business number sends the typing indicator.",
                    },
                    {
                      name: "instagram_account_id",
                      type: "string",
                      required: false,
                      description: "Instagram account ID. Required when customer has conversations with multiple Instagram accounts.",
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsTip>
                <strong>Rate Limit:</strong> Maximum 1 request per 3 seconds per customer.
                If exceeded, the API returns 429 with <code className="bg-muted rounded px-1">Retry-After</code> header.
              </DocsTip>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL (Phone)",
                      code: `curl -X POST "${apiBaseUrl}/api/v1/public/conversations/628123456789/typing" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "channel": "whatsapp",
    "whatsapp_phone_number_id": "clyyy9876543210"
  }'`,
                    },
                    {
                      language: "curl",
                      label: "cURL (Simple)",
                      code: `curl -X POST "${apiBaseUrl}/api/v1/public/conversations/628123456789/typing" \\
  -H "Authorization: Bearer YOUR_API_KEY"`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/conversations/628123456789/typing", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({
    channel: "whatsapp",
    whatsapp_phone_number_id: "clyyy9876543210" // optional
  })
});`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.post(
    "${apiBaseUrl}/api/v1/public/conversations/628123456789/typing",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    },
    json={
        "channel": "whatsapp",
        "whatsapp_phone_number_id": "clyyy9876543210"  # optional
    }
)`,
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Instagram Example">
                <CodeBlock
                  code={`// Send typing to Instagram customer
POST /api/v1/public/conversations/ig_username/typing
Content-Type: application/json

{
  "channel": "instagram",
  "instagram_account_id": "your_ig_account_id"
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Response">
                <CodeBlock
                  code={`{
  "success": true,
  "data": {
    "customer_id": "clxxx1234567890",
    "channel": "whatsapp",
    "typing_sent": true,
    "timestamp": "2026-01-26T10:30:00.000Z"
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Error Codes">
                <div className="space-y-2">
                  {[
                    { code: "NotFound", desc: "Customer not found" },
                    { code: "WindowClosed", desc: "24-hour messaging window expired" },
                    { code: "RateLimitExceeded", desc: "Max 1 request per 3 seconds per customer" },
                    { code: "ConfigurationError", desc: "Channel not available for customer" },
                    { code: "ConnectionError", desc: "WhatsApp/Instagram account disconnected" },
                    { code: "AmbiguousAccount", desc: "Customer has multiple IG accounts, specify instagram_account_id" },
                  ].map((item) => (
                    <div key={item.code} className="flex items-start gap-3">
                      <code className="bg-muted rounded px-2 py-1 text-sm shrink-0">
                        {item.code}
                      </code>
                      <span className="text-muted-foreground text-sm">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </DocsSubsection>
            </DocsSection>

            {/* Mark as Read */}
            <DocsSection
              id="mark-as-read"
              title="Mark as Read"
              description="Mark a message as read and send read receipt to the customer."
            >
              <EndpointBadge method="POST" path="/api/v1/public/messages/:messageId/read" />

              <DocsSubsection title="URL Parameters">
                <ParamsTable
                  parameters={[
                    {
                      name: "messageId",
                      type: "string",
                      required: true,
                      description: "Message ID (CUID) to mark as read",
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsTip>
                <strong>Important:</strong> Only inbound messages can be marked as read. Attempting to mark an outbound message as read will return a validation error.
              </DocsTip>

              <DocsTip variant="warning">
                <strong>WhatsApp:</strong> Requires connected WhatsApp Business Account. The message must have a valid <code className="bg-muted rounded px-1">wamId</code>.
              </DocsTip>

              <DocsTip>
                <strong>Multi-Number:</strong> The read receipt is automatically sent via the same WhatsApp phone number
                that received the message. No additional parameters needed.
              </DocsTip>

              <DocsSubsection title="Supported Channels">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">WhatsApp:</span>
                    <span className="text-muted-foreground">Sends read receipt via WhatsApp API</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Instagram:</span>
                    <span className="text-muted-foreground">Sends mark_seen via Instagram API</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">Messenger:</span>
                    <span className="text-muted-foreground">Not supported via Public API</span>
                  </div>
                </div>
              </DocsSubsection>

              <DocsSubsection title="Example Request">
                <CodeTabs
                  examples={[
                    {
                      language: "curl",
                      label: "cURL",
                      code: `curl -X POST "${apiBaseUrl}/api/v1/public/messages/msg_xyz789/read" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json"`,
                    },
                    {
                      language: "javascript",
                      label: "JavaScript",
                      code: `const response = await fetch("${apiBaseUrl}/api/v1/public/messages/msg_xyz789/read", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  }
});`,
                    },
                    {
                      language: "python",
                      label: "Python",
                      code: `import requests

response = requests.post(
    "${apiBaseUrl}/api/v1/public/messages/msg_xyz789/read",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    }
)`,
                    },
                  ]}
                />
              </DocsSubsection>

              <DocsSubsection title="Success Response">
                <CodeBlock
                  code={`{
  "success": true,
  "data": {
    "message_id": "msg_xyz789",
    "status": "read",
    "channel": "whatsapp",
    "updated_at": "2026-01-27T10:30:00.000Z"
  }
}`}
                />
              </DocsSubsection>

              <DocsSubsection title="Error Responses">
                <div className="space-y-3">
                  <div>
                    <p className="font-medium text-sm mb-1">404 - Message Not Found</p>
                    <CodeBlock
                      code={`{
  "error": {
    "code": "NotFound",
    "message": "Message not found"
  }
}`}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm mb-1">400 - Validation Error (Outbound Message)</p>
                    <CodeBlock
                      code={`{
  "error": {
    "code": "ValidationError",
    "message": "Only inbound messages can be marked as read"
  }
}`}
                    />
                  </div>
                  <div>
                    <p className="font-medium text-sm mb-1">400 - Configuration Error (WhatsApp Not Connected)</p>
                    <CodeBlock
                      code={`{
  "error": {
    "code": "ConfigurationError",
    "message": "Cannot send read receipt: missing configuration"
  }
}`}
                    />
                  </div>
                </div>
              </DocsSubsection>
            </DocsSection>

            {/* Webhooks Overview */}
            <DocsSection
              id="webhooks-overview"
              title="Webhooks Overview"
              description={`Receive real-time notifications when events occur in ${websiteName}.`}
            >
              <p className="text-muted-foreground">
                When an event happens (like receiving a message), we&apos;ll send an HTTP POST
                request to your configured URL with the event data.
              </p>

              <DocsSubsection title="How It Works">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Configure a webhook URL in your dashboard</li>
                  <li>Select which events you want to receive</li>
                  <li>We send POST requests to your URL when events occur</li>
                  <li>Your server processes the event and responds with 200 OK</li>
                </ol>
              </DocsSubsection>

              <Link
                href="/developers/webhooks"
                className="inline-flex items-center text-primary hover:underline text-sm"
              >
                Manage webhooks →
              </Link>
            </DocsSection>

            {/* Webhook Events */}
            <DocsSection
              id="webhook-events"
              title="Webhook Events"
              description="Available webhook events you can subscribe to."
            >
              <div className="space-y-3">
                {[
                  { event: "message.received", desc: "New incoming message" },
                  { event: "message.sent", desc: "Message sent successfully" },
                  { event: "message.delivered", desc: "Message delivered to recipient" },
                  { event: "message.read", desc: "Message read by recipient" },
                  { event: "message.failed", desc: "Message delivery failed" },
                ].map((item) => (
                  <div key={item.event} className="flex items-start gap-3">
                    <code className="bg-muted rounded px-2 py-1 text-sm shrink-0">
                      {item.event}
                    </code>
                    <span className="text-muted-foreground text-sm">{item.desc}</span>
                  </div>
                ))}
              </div>

              <DocsSubsection title="Payload Format">
                <CodeBlock
                  code={`{
  "event": "message.received",
  "timestamp": "2025-01-07T10:30:00Z",
  "data": {
    "message_id": "msg_xyz789",
    "customer_id": "clxxx1234567890",
    "customer_phone": "628123456789",
    "channel": "whatsapp",
    "direction": "inbound",
    "message_type": "text",
    "content": "Hello, I need help!",
    "media_url": null
  }
}`}
                />
              </DocsSubsection>
            </DocsSection>

            {/* Webhook Security */}
            <DocsSection
              id="webhook-security"
              title="Webhook Security"
              description={`Verify webhook signatures to ensure requests are from ${websiteName}.`}
            >
              <p className="text-muted-foreground">
                All webhook requests include an HMAC-SHA256 signature in the{" "}
                <code className="bg-muted rounded px-1">X-Webhook-Signature</code> header.
              </p>

              <DocsTip variant="warning">
                <strong>Important:</strong> Always verify the webhook signature before
                processing events to ensure they came from {websiteName}.
              </DocsTip>

              <DocsSubsection title="Verification Example">
                <CodeBlock
                  language="javascript"
                  code={`const crypto = require('crypto');

function verifyWebhookSignature(body, signature, secret) {
  const hash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(hash),
    Buffer.from(signature)
  );
}

// Express.js example
app.post('/webhook', express.raw({ type: 'application/json' }), (req, res) => {
  const signature = req.headers['x-webhook-signature'];
  const body = req.body.toString();

  if (!verifyWebhookSignature(body, signature, process.env.WEBHOOK_SECRET)) {
    return res.status(403).send('Invalid signature');
  }

  const event = JSON.parse(body);
  // Process the event...

  res.status(200).send('OK');
});`}
                />
              </DocsSubsection>
            </DocsSection>

            {/* n8n Integration */}
            <DocsSection
              id="n8n"
              title="n8n Integration"
              description={`Connect ${websiteName} with n8n for powerful workflow automation.`}
            >
              <DocsSubsection title="Installation">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>
                    Go to <strong>Settings → Community Nodes</strong>
                  </li>
                  <li>
                    Select <strong>Install</strong>
                  </li>
                  <li>
                    Enter{" "}
                    <code className="bg-muted rounded px-1">{n8nPackageName}</code>{" "}
                    and confirm
                  </li>
                </ol>
              </DocsSubsection>

              <DocsSubsection title="Credentials Setup">
                <ol className="list-decimal list-inside space-y-2 text-muted-foreground">
                  <li>Log in to your {websiteName} dashboard</li>
                  <li>
                    Go to{" "}
                    <Link href="/developers/api-keys" className="text-primary hover:underline">
                      Developers → API Keys
                    </Link>
                  </li>
                  <li>Create an API key and copy it</li>
                  <li>
                    In n8n, create new credentials for <strong>{websiteName} API</strong>
                  </li>
                  <li>Paste your API key</li>
                </ol>
              </DocsSubsection>
            </DocsSection>

            {/* Error Handling */}
            <DocsSection
              id="error-handling"
              title="Error Codes"
              description="The API uses standard HTTP status codes and returns JSON error responses."
            >
              <DocsSubsection title="HTTP Status Codes">
                <div className="space-y-2">
                  {[
                    { code: "400", desc: "Bad Request - Validation error" },
                    { code: "401", desc: "Unauthorized - Invalid API key" },
                    { code: "403", desc: "Forbidden - Permission denied" },
                    { code: "404", desc: "Not Found - Resource not found" },
                    { code: "429", desc: "Too Many Requests - Rate limit exceeded" },
                    { code: "500", desc: "Internal Server Error" },
                  ].map((item) => (
                    <div key={item.code} className="flex items-center gap-3">
                      <code className="bg-muted rounded px-2 py-1 text-sm w-12 text-center">
                        {item.code}
                      </code>
                      <span className="text-muted-foreground text-sm">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </DocsSubsection>

              <DocsSubsection title="Error Response Format">
                <CodeBlock
                  code={`{
  "error": {
    "code": "ValidationError",
    "message": "phone_number is required",
    "details": [
      {
        "field": "phone_number",
        "message": "phone_number is required"
      }
    ]
  }
}`}
                />
              </DocsSubsection>
            </DocsSection>

            {/* Rate Limits */}
            <DocsSection
              id="rate-limits"
              title="Rate Limits"
              description="API rate limits based on Meta's official limits (2026) and your subscription tier."
            >
              <DocsSubsection title="Channel-Specific Limits">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Channel</th>
                        <th className="text-left p-3 font-medium">Limit</th>
                        <th className="text-left p-3 font-medium">Window</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-3">WhatsApp</td>
                        <td className="p-3">60 messages</td>
                        <td className="p-3 text-muted-foreground">per minute</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Instagram</td>
                        <td className="p-3">180 messages</td>
                        <td className="p-3 text-muted-foreground">per hour</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Messenger</td>
                        <td className="p-3">180 messages</td>
                        <td className="p-3 text-muted-foreground">per hour</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DocsSubsection>

              <DocsSubsection title="Subscription Tier Limits">
                <div className="rounded-lg border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Tier</th>
                        <th className="text-left p-3 font-medium">Requests/Day</th>
                        <th className="text-left p-3 font-medium">API Keys</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-3">Free</td>
                        <td className="p-3 text-muted-foreground">—</td>
                        <td className="p-3 text-muted-foreground">Cannot create</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Basic</td>
                        <td className="p-3">100</td>
                        <td className="p-3">1</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Lite</td>
                        <td className="p-3">1,000</td>
                        <td className="p-3">3</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3">Pro</td>
                        <td className="p-3">10,000</td>
                        <td className="p-3">Unlimited</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </DocsSubsection>

              <DocsTip>
                Rate limit headers are included in API responses:{" "}
                <code className="bg-muted rounded px-1">X-RateLimit-Remaining</code>,{" "}
                <code className="bg-muted rounded px-1">X-RateLimit-Reset</code>, and{" "}
                <code className="bg-muted rounded px-1">X-RateLimit-Channel</code> for channel-specific limits.
              </DocsTip>
            </DocsSection>
          </div>
        }
        playground={
          <ApiPlayground activeSection={activeSection} />
        }
      />
    </RoleGuard>
  )
}
