"use client"

import { BookOpen, Copy, Check } from "lucide-react"
import { useState } from "react"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useBranding } from "@/hooks/use-branding"

function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative">
      <pre className="bg-muted overflow-x-auto rounded-md p-4 text-xs">
        <code>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
      </Button>
    </div>
  )
}

export function WebhookDocs() {
  const { websiteName } = useBranding()
  
  return (
    <Card className="mt-6">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" />
          How to Use Webhooks
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="overview">
            <AccordionTrigger>Overview</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                Webhooks allow you to receive real-time notifications when events occur in {websiteName}. 
                When an event happens (like receiving a message), we&apos;ll send an HTTP POST request 
                to your configured URL with the event data.
              </p>
              <div className="space-y-2">
                <p className="font-medium">Available Events:</p>
                <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                  <li><code className="bg-muted rounded px-1">message.received</code> - New incoming message</li>
                  <li><code className="bg-muted rounded px-1">message.sent</code> - Message sent successfully</li>
                  <li><code className="bg-muted rounded px-1">message.delivered</code> - Message delivered to recipient</li>
                  <li><code className="bg-muted rounded px-1">message.read</code> - Message read by recipient</li>
                  <li><code className="bg-muted rounded px-1">message.failed</code> - Message delivery failed</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="payload">
            <AccordionTrigger>Webhook Payload Format</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                Each webhook request includes the following structure:
              </p>
              <CodeBlock
                code={`{
  "id": "evt_abc123",
  "type": "message.received",
  "timestamp": "2024-01-15T10:30:00Z",
  "data": {
    "messageId": "msg_xyz789",
    "conversationId": "conv_123",
    "channel": "whatsapp",
    "direction": "inbound",
    "content": {
      "type": "text",
      "text": "Hello, I need help!"
    },
    "contact": {
      "id": "contact_456",
      "phoneNumber": "+6281234567890",
      "name": "John Doe"
    }
  }
}`}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="headers">
            <AccordionTrigger>Request Headers</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                Each webhook request includes these headers:
              </p>
              <CodeBlock
                code={`Content-Type: application/json
X-Webhook-ID: evt_abc123
X-Webhook-Timestamp: 1705315800
X-Webhook-Signature: sha256=abc123...`}
              />
              <p className="text-muted-foreground text-sm">
                Use the signature to verify the request authenticity.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="signature">
            <AccordionTrigger>Verifying Signatures</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                To verify webhook authenticity, compute HMAC-SHA256 of the raw request body 
                using your webhook secret and compare with the signature header.
              </p>
              <p className="font-medium text-sm">Node.js Example:</p>
              <CodeBlock
                code={`const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const timestamp = signature.split(',')[0].split('=')[1];
  const sig = signature.split(',')[1].split('=')[1];
  
  const signedPayload = timestamp + '.' + payload;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(sig),
    Buffer.from(expectedSig)
  );
}`}
              />
              <p className="font-medium text-sm mt-4">Python Example:</p>
              <CodeBlock
                code={`import hmac
import hashlib

def verify_webhook(payload, signature, secret):
    parts = dict(p.split('=') for p in signature.split(','))
    timestamp = parts['t']
    sig = parts['v1']
    
    signed_payload = f"{timestamp}.{payload}"
    expected_sig = hmac.new(
        secret.encode(),
        signed_payload.encode(),
        hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(sig, expected_sig)`}
              />
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="response">
            <AccordionTrigger>Response Requirements</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                Your endpoint must respond within <strong>30 seconds</strong> with a 2xx status code.
              </p>
              <div className="space-y-2">
                <p className="font-medium text-sm">Success Response:</p>
                <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                  <li>Return HTTP 200, 201, or 204</li>
                  <li>Response body is optional</li>
                </ul>
              </div>
              <div className="space-y-2">
                <p className="font-medium text-sm">Retry Behavior:</p>
                <ul className="text-muted-foreground list-inside list-disc space-y-1 text-sm">
                  <li>Failed deliveries are retried up to 5 times</li>
                  <li>Retry intervals: 1min, 5min, 30min, 2hr, 24hr</li>
                  <li>After 10 consecutive failures, endpoint is auto-disabled</li>
                </ul>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="n8n">
            <AccordionTrigger>Integration with n8n</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                To receive webhooks in n8n:
              </p>
              <ol className="text-muted-foreground list-inside list-decimal space-y-2 text-sm">
                <li>Create a new workflow in n8n</li>
                <li>Add a <strong>Webhook</strong> trigger node</li>
                <li>Set HTTP Method to <code className="bg-muted rounded px-1">POST</code></li>
                <li>Copy the webhook URL from n8n</li>
                <li>Create a webhook endpoint in {websiteName} with that URL</li>
                <li>Select the events you want to receive</li>
                <li>Use the &quot;Test&quot; button to verify the connection</li>
              </ol>
              <p className="text-muted-foreground text-sm mt-2">
                💡 Tip: In n8n, you can access the webhook data using <code className="bg-muted rounded px-1">{"{{ $json }}"}</code>
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="reply-message">
            <AccordionTrigger>Replying to Messages</AccordionTrigger>
            <AccordionContent className="space-y-3">
              <p className="text-muted-foreground">
                To reply to incoming messages, use the Public API with your API key. 
                The flow is: <strong>Webhook</strong> (receive) → <strong>Your Logic</strong> → <strong>Public API</strong> (send).
              </p>
              <p className="font-medium text-sm">Send Message API:</p>
              <CodeBlock
                code={`POST /api/v1/public/messages
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "to": "+6281234567890",
  "channel": "whatsapp",
  "type": "text",
  "content": {
    "text": "Thanks for your message! We'll get back to you soon."
  }
}`}
              />
              <p className="font-medium text-sm mt-4">n8n Example Flow:</p>
              <ol className="text-muted-foreground list-inside list-decimal space-y-2 text-sm">
                <li>Webhook Trigger receives <code className="bg-muted rounded px-1">message.received</code></li>
                <li>Extract phone number: <code className="bg-muted rounded px-1">{"{{ $json.data.contact.phoneNumber }}"}</code></li>
                <li>Add HTTP Request node to call Public API</li>
                <li>Set Authorization header with your API key</li>
                <li>Send reply message to the extracted phone number</li>
              </ol>
              <p className="text-muted-foreground text-sm mt-2">
                💡 Get your API key from <strong>Developers → API Keys</strong> page.
              </p>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="best-practices">
            <AccordionTrigger>Best Practices</AccordionTrigger>
            <AccordionContent>
              <ul className="text-muted-foreground list-inside list-disc space-y-2 text-sm">
                <li>Always verify webhook signatures to ensure authenticity</li>
                <li>Respond quickly (under 5 seconds) and process asynchronously</li>
                <li>Handle duplicate events using the event ID for idempotency</li>
                <li>Use HTTPS endpoints only (HTTP is not supported)</li>
                <li>Monitor your delivery logs for failed deliveries</li>
                <li>Set up alerts for when endpoints are auto-disabled</li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </CardContent>
    </Card>
  )
}
