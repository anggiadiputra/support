"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { 
  IconBrandWhatsapp, 
  IconShieldCheck, 
  IconCertificate, 
  IconCircleCheck,
  IconKey, 
  IconWebhook, 
  IconCopy, 
  IconCheck,
  IconAlertCircle,
  IconLoader2,
  IconExternalLink
} from "@tabler/icons-react"
import { WABAConnectionButton } from "@/components/waba/waba-connection-button"
import { wabaApi, type ManualConnectResponse } from "@/lib/api/waba-api"
import { useTranslations } from "next-intl"
import { useToast } from "@/hooks/use-toast"
import { useBranding } from "@/hooks/use-branding"

interface Props {
  hasWABA: boolean
  onSuccess?: () => void
}

export function WABAConnectCard({ hasWABA, onSuccess }: Props) {
  const t = useTranslations("waba")
  const { toast } = useToast()
  const { websiteName } = useBranding()
  
  // Manual login state
  const [accessToken, setAccessToken] = useState("")
  const [wabaId, setWabaId] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ManualConnectResponse | null>(null)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = async (text: string, field: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(field)
      toast({ title: "Copied to clipboard" })
      setTimeout(() => setCopiedField(null), 2000)
    } catch {
      toast({ title: "Failed to copy", variant: "destructive" })
    }
  }

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const response = await wabaApi.manualConnect(accessToken, wabaId)
      setResult(response)
      toast({ title: "Success", description: "WhatsApp Business Account connected successfully!" })
      // Don't call onSuccess yet - let user see webhook info first
    } catch (err: any) {
      setError(err.message || "Failed to connect WABA")
      toast({ title: "Error", description: err.message || "Failed to connect WABA", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  // Show connected state
  if (hasWABA && !result) {
    return (
      <Card className="border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
              <IconBrandWhatsapp className="h-5 w-5 text-emerald-600" />
              {t("connectedTitle")}
            </CardTitle>
            <Badge variant="outline" className="border-emerald-500 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300">
              <IconShieldCheck className="mr-1 h-3 w-3" />
              {t("officialApi.badge")}
            </Badge>
          </div>
          <CardDescription className="text-emerald-700 dark:text-emerald-300">
            {t("connectedDescription")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-emerald-800 dark:text-emerald-200 text-sm">
            {t("connectedInfo")}
          </p>
        </CardContent>
      </Card>
    )
  }

  // Show webhook configuration after successful manual connection
  if (result) {
    return (
      <Card className="border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-emerald-900 dark:text-emerald-100">
              <IconCheck className="h-5 w-5 text-emerald-600" />
              Connected Successfully
            </CardTitle>
            <Badge variant="outline" className="border-emerald-500 bg-emerald-100 text-emerald-700">
              Manual Login
            </Badge>
          </div>
          <CardDescription className="text-emerald-700 dark:text-emerald-300">
            WABA: {result.waba.name || result.waba.wabaId}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert>
            <IconWebhook className="h-4 w-4" />
            <AlertTitle>Configure Webhook in Meta Dashboard</AlertTitle>
            <AlertDescription className="mt-2">
              {result.webhook.instructions}
            </AlertDescription>
          </Alert>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Webhook URL</Label>
              <div className="flex gap-2">
                <Input 
                  value={result.webhook.url} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => handleCopy(result.webhook.url, 'url')}
                >
                  {copiedField === 'url' ? (
                    <IconCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm font-medium">Verify Token</Label>
              <div className="flex gap-2">
                <Input 
                  value={result.webhook.verifyToken} 
                  readOnly 
                  className="font-mono text-sm"
                />
                <Button 
                  variant="outline" 
                  size="icon"
                  onClick={() => handleCopy(result.webhook.verifyToken, 'token')}
                >
                  {copiedField === 'token' ? (
                    <IconCheck className="h-4 w-4 text-emerald-600" />
                  ) : (
                    <IconCopy className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

          <div className="rounded-lg border bg-muted/50 p-3">
            <p className="text-muted-foreground text-xs">
              <strong>Phone Numbers:</strong> {result.phoneNumbers.map(pn => pn.displayPhoneNumber).join(', ')}
            </p>
          </div>

          <div className="flex gap-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => window.open('https://developers.facebook.com/apps/', '_blank')}
            >
              <IconExternalLink className="mr-2 h-4 w-4" />
              Open Meta Dashboard
            </Button>
            <Button 
              className="flex-1"
              onClick={() => {
                setResult(null)
                onSuccess?.()
              }}
            >
              <IconCheck className="mr-2 h-4 w-4" />
              Done
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-2xl">
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="flex items-center gap-2">
            <IconBrandWhatsapp className="h-5 w-5 text-emerald-600" />
            {t("connectTitle")}
          </CardTitle>
        </div>
        <CardDescription>
          {t("connectDescription")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Tabs defaultValue="embedded" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="embedded" className="gap-2">
              <IconShieldCheck className="h-4 w-4" />
              Embedded Signup
            </TabsTrigger>
            <TabsTrigger value="manual" className="gap-2">
              <IconKey className="h-4 w-4" />
              Manual Login
            </TabsTrigger>
          </TabsList>

          {/* Embedded Signup Tab */}
          <TabsContent value="embedded" className="space-y-4 mt-4">
            {/* Official API Info Banner */}
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-800 dark:bg-emerald-950/30">
              <div className="flex items-start gap-3">
                <div className="rounded-full bg-emerald-100 p-2 dark:bg-emerald-900/50">
                  <IconShieldCheck className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="font-medium text-emerald-900 dark:text-emerald-100 text-sm">
                      {t("officialApi.title")}
                    </h4>
                    <Badge variant="outline" className="border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300 text-xs">
                      Recommended
                    </Badge>
                  </div>
                  <p className="text-emerald-700 dark:text-emerald-300 text-xs">
                    {t("officialApi.description", { websiteName: websiteName || "Platform" })}
                  </p>
                  <div className="flex flex-col gap-1.5 mt-3">
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <IconCertificate className="h-3.5 w-3.5" />
                      <span>{t("officialApi.benefits.official")}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                      <IconCircleCheck className="h-3.5 w-3.5" />
                      <span>{t("officialApi.benefits.compliant")}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm">
                {t("connectIntro")}
              </p>
              <ul className="text-muted-foreground ml-6 list-disc space-y-1 text-sm">
                <li>{t("features.sendReceive")}</li>
                <li>{t("features.templates")}</li>
                <li>{t("features.conversations")}</li>
                <li>{t("features.quality")}</li>
              </ul>
            </div>

            <WABAConnectionButton
              onSuccess={(waba) => {
                if (onSuccess) {
                  onSuccess()
                }
              }}
              onError={(error) => {
                console.error("WABA connection error:", error)
              }}
              enableCoexistence={true}
              className="w-full"
            >
              <IconBrandWhatsapp className="mr-2 h-5 w-5" />
              {t("connectButton")}
            </WABAConnectionButton>

            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs">
                <strong>Note:</strong> {t("note")}
              </p>
            </div>
          </TabsContent>

          {/* Manual Login Tab */}
          <TabsContent value="manual" className="space-y-4 mt-4">
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3 dark:border-amber-800 dark:bg-amber-950/30">
              <div className="flex items-center gap-2 mb-1">
                <Badge variant="outline" className="border-amber-500 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 text-xs">
                  Advanced
                </Badge>
              </div>
              <p className="text-amber-800 dark:text-amber-200 text-xs">
                <strong>For developers:</strong> Use this option if you have your own Meta App and want to manage webhook configuration yourself.
              </p>
            </div>

            <form onSubmit={handleManualSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="wabaId">WABA ID</Label>
                <Input
                  id="wabaId"
                  placeholder="e.g., 123456789012345"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Find this in your Meta Business Suite under WhatsApp Accounts
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <Input
                  id="accessToken"
                  type="password"
                  placeholder="Your permanent or system user access token"
                  value={accessToken}
                  onChange={(e) => setAccessToken(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Use a System User token with whatsapp_business_messaging permission
                </p>
              </div>

              {error && (
                <Alert variant="destructive">
                  <IconAlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full"
                disabled={isLoading || !accessToken || !wabaId}
              >
                {isLoading ? (
                  <>
                    <IconLoader2 className="mr-2 h-4 w-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <IconBrandWhatsapp className="mr-2 h-4 w-4" />
                    Connect WABA
                  </>
                )}
              </Button>
            </form>

            <div className="rounded-lg border bg-muted/50 p-3">
              <p className="text-muted-foreground text-xs">
                <strong>Note:</strong> After connecting, you will receive a Webhook URL and Verify Token to configure in your Meta App Dashboard.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
