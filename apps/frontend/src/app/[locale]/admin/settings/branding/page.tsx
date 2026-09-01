"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import {
  IconRefresh,
  IconDeviceFloppy,
  IconAlertCircle,
  IconCircleCheck,
  IconInfoCircle,
  IconBrandWhatsapp,
  IconMail,
  IconPhoto,
  IconWorld,
  IconLink,
  IconPlugConnected,
  IconExternalLink,
  IconTrash,
} from "@tabler/icons-react"
import { useTranslations } from "next-intl"
import Image from "next/image"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
const DEFAULT_APP_NAME = process.env.NEXT_PUBLIC_APP_NAME || "Messaging Platform"

interface ExternalLink {
  label: string
  url: string
}

interface BrandingSettings {
  websiteName: string
  logoUrl: string
  supportEmail: string
  supportWhatsapp: string
  termsUrl: string
  privacyUrl: string
  n8nPackageName: string
  externalLinks: ExternalLink[]
}

const defaultSettings: BrandingSettings = {
  websiteName: DEFAULT_APP_NAME,
  logoUrl: "",
  supportEmail: "support@yourdomain.com",
  supportWhatsapp: "+6281234567890",
  termsUrl: "https://yourdomain.com/terms",
  privacyUrl: "https://yourdomain.com/privacy",
  n8nPackageName: "@kichat/n8n-nodes-kirimchat",
  externalLinks: [],
}

export default function BrandingSettingsPage() {
  const t = useTranslations("admin")
  const [settings, setSettings] = useState<BrandingSettings>(defaultSettings)
  const [source, setSource] = useState<"database" | "env" | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isUpdating, setIsUpdating] = useState(false)
  const [isResetting, setIsResetting] = useState(false)
  const [saveResult, setSaveResult] = useState<{ success: boolean; message: string } | null>(null)
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})


  // Fetch branding settings
  const fetchSettings = async () => {
    try {
      setIsLoading(true)
      setError(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/branding`, {
        credentials: "include",
      })

      if (!response.ok) {
        if (response.status === 403) {
          throw new Error("You don't have permission to access settings")
        }
        throw new Error("Failed to fetch settings")
      }

      const result = await response.json()

      if (result.success && result.data) {
        const data = result.data.data
        // Ensure externalLinks is always an array
        setSettings({
          ...defaultSettings,
          ...data,
          externalLinks: Array.isArray(data?.externalLinks) ? data.externalLinks : [],
        })
        setSource(result.data.source)
      } else {
        throw new Error(result.error?.message || "Failed to fetch settings")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchSettings()
  }, [])

  // Validate email format
  const validateEmail = (email: string): boolean => {
    if (!email) return true // Empty is valid (will use default)
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }

  // Validate phone format (basic validation)
  const validatePhone = (phone: string): boolean => {
    if (!phone) return true // Empty is valid (will use default)
    // Allow formats like +6281234567890, 081234567890, +62 812-3456-7890
    const phoneRegex = /^[+]?[\d\s\-()]{8,20}$/
    return phoneRegex.test(phone)
  }

  // Validate URL format
  const validateUrl = (url: string): boolean => {
    if (!url) return true // Empty is valid (will use default)
    try {
      new URL(url)
      return true
    } catch {
      return false
    }
  }

  const handleChange = (field: keyof BrandingSettings) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const value = e.target.value
    setSettings((prev) => ({ ...prev, [field]: value }))
    setSaveResult(null)

    // Clear validation error for this field
    setValidationErrors((prev) => {
      const newErrors = { ...prev }
      delete newErrors[field]
      return newErrors
    })

    // Validate on change
    if (field === "supportEmail" && value && !validateEmail(value)) {
      setValidationErrors((prev) => ({
        ...prev,
        supportEmail: t("branding.invalidEmail") || "Invalid email format",
      }))
    }
    if (field === "supportWhatsapp" && value && !validatePhone(value)) {
      setValidationErrors((prev) => ({
        ...prev,
        supportWhatsapp: t("branding.invalidPhone") || "Invalid phone format",
      }))
    }
    if ((field === "termsUrl" || field === "privacyUrl") && value && !validateUrl(value)) {
      setValidationErrors((prev) => ({
        ...prev,
        [field]: t("branding.invalidUrl") || "Invalid URL format",
      }))
    }
  }

  const handleSave = async () => {
    // Validate before saving
    const errors: Record<string, string> = {}
    if (settings.supportEmail && !validateEmail(settings.supportEmail)) {
      errors.supportEmail = t("branding.invalidEmail") || "Invalid email format"
    }
    if (settings.supportWhatsapp && !validatePhone(settings.supportWhatsapp)) {
      errors.supportWhatsapp = t("branding.invalidPhone") || "Invalid phone format"
    }
    if (settings.termsUrl && !validateUrl(settings.termsUrl)) {
      errors.termsUrl = t("branding.invalidUrl") || "Invalid URL format"
    }
    if (settings.privacyUrl && !validateUrl(settings.privacyUrl)) {
      errors.privacyUrl = t("branding.invalidUrl") || "Invalid URL format"
    }

    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }

    try {
      setIsUpdating(true)
      setSaveResult(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/branding`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(settings),
      })

      const result = await response.json()

      if (!response.ok) {
        setSaveResult({
          success: false,
          message: result.error?.message || "Failed to update settings",
        })
        return
      }

      await fetchSettings()
      setSaveResult({
        success: true,
        message: result.message || t("branding.saveSuccess") || "Settings saved successfully",
      })
    } catch (err) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsUpdating(false)
    }
  }

  const handleReset = async () => {
    try {
      setIsResetting(true)
      setSaveResult(null)

      const response = await fetch(`${API_URL}/api/v1/admin/settings/branding/reset`, {
        method: "POST",
        credentials: "include",
      })

      const result = await response.json()

      if (!response.ok) {
        setSaveResult({
          success: false,
          message: result.error?.message || "Failed to reset settings",
        })
        return
      }

      await fetchSettings()
      setSaveResult({
        success: true,
        message: result.message || t("branding.resetSuccess") || "Settings reset to defaults",
      })
    } catch (err) {
      setSaveResult({
        success: false,
        message: err instanceof Error ? err.message : "An error occurred",
      })
    } finally {
      setIsResetting(false)
    }
  }


  if (isLoading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{t("branding.title") || "Branding Settings"}</h1>
          <p className="text-muted-foreground">
            {t("branding.description") || "Configure website branding and support contact information"}
          </p>
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">{t("branding.title") || "Branding Settings"}</h1>
        <p className="text-muted-foreground">
          {t("branding.description") || "Configure website branding and support contact information"}
        </p>
      </div>

      {/* Website Branding Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconWorld className="h-5 w-5" />
            {t("branding.websiteBranding") || "Website Branding"}
          </CardTitle>
          <CardDescription>
            {t("branding.websiteBrandingDesc") || "Configure website name and logo displayed across the application"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {source && (
            <Alert variant={source === "database" ? "default" : "destructive"}>
              <IconInfoCircle className="h-4 w-4" />
              <AlertDescription>
                {source === "database"
                  ? t("branding.sourceDatabase") || "Settings loaded from database"
                  : t("branding.sourceEnv") || "Settings loaded from .env (database unavailable or empty)"}
              </AlertDescription>
            </Alert>
          )}

          {error && (
            <Alert variant="destructive">
              <IconAlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {saveResult && (
            <Alert variant={saveResult.success ? "default" : "destructive"}>
              {saveResult.success ? (
                <IconCircleCheck className="h-4 w-4" />
              ) : (
                <IconAlertCircle className="h-4 w-4" />
              )}
              <AlertDescription>{saveResult.message}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="websiteName">
                <IconWorld className="inline h-4 w-4 mr-1" />
                {t("branding.websiteName") || "Website Name"}
              </Label>
              <Input
                id="websiteName"
                value={settings.websiteName}
                onChange={handleChange("websiteName")}
                placeholder={DEFAULT_APP_NAME}
              />
              <p className="text-xs text-muted-foreground">
                {t("branding.websiteNameHint") || "Displayed in page titles, headers, and sidebar"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="logoUrl">
                <IconPhoto className="inline h-4 w-4 mr-1" />
                {t("branding.logoUrl") || "Logo URL"}
              </Label>
              <Input
                id="logoUrl"
                value={settings.logoUrl}
                onChange={handleChange("logoUrl")}
                placeholder="https://example.com/logo.png"
              />
              <p className="text-xs text-muted-foreground">
                {t("branding.logoUrlHint") || "URL to logo image. Leave empty to show website name as text"}
              </p>
            </div>
          </div>

          {/* Preview Section */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <Label className="text-sm font-medium mb-3 block">
              {t("branding.preview") || "Preview"}
            </Label>
            <div className="flex items-center gap-3 p-3 bg-background rounded-md border">
              {settings.logoUrl ? (
                <Image
                  src={settings.logoUrl}
                  alt={settings.websiteName || "Logo"}
                  width={32}
                  height={32}
                  className="h-8 w-8 object-contain"
                  onError={(e) => {
                    // Hide broken image
                    (e.target as HTMLImageElement).style.display = "none"
                  }}
                />
              ) : (
                <div className="h-8 w-8 rounded bg-primary/10 flex items-center justify-center">
                  <span className="text-primary font-bold text-sm">
                    {(settings.websiteName || "K").charAt(0).toUpperCase()}
                  </span>
                </div>
              )}
              <span className="font-semibold">{settings.websiteName || DEFAULT_APP_NAME}</span>
            </div>
          </div>
        </CardContent>
      </Card>


      {/* Support Contact Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconMail className="h-5 w-5" />
            {t("branding.supportContact") || "Support Contact"}
          </CardTitle>
          <CardDescription>
            {t("branding.supportContactDesc") || "Configure support contact information displayed on Help & Support page"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="supportEmail">
                <IconMail className="inline h-4 w-4 mr-1" />
                {t("branding.supportEmail") || "Support Email"}
              </Label>
              <Input
                id="supportEmail"
                type="email"
                value={settings.supportEmail}
                onChange={handleChange("supportEmail")}
                placeholder="support@example.com"
                className={validationErrors.supportEmail ? "border-destructive" : ""}
              />
              {validationErrors.supportEmail && (
                <p className="text-xs text-destructive">{validationErrors.supportEmail}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("branding.supportEmailHint") || "Email address for customer support inquiries"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="supportWhatsapp">
                <IconBrandWhatsapp className="inline h-4 w-4 mr-1" />
                {t("branding.supportWhatsapp") || "Support WhatsApp"}
              </Label>
              <Input
                id="supportWhatsapp"
                value={settings.supportWhatsapp}
                onChange={handleChange("supportWhatsapp")}
                placeholder="+6281234567890"
                className={validationErrors.supportWhatsapp ? "border-destructive" : ""}
              />
              {validationErrors.supportWhatsapp && (
                <p className="text-xs text-destructive">{validationErrors.supportWhatsapp}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("branding.supportWhatsappHint") || "WhatsApp number for customer support (include country code)"}
              </p>
            </div>
          </div>

          {/* Support Preview */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <Label className="text-sm font-medium mb-3 block">
              {t("branding.supportPreview") || "Support Links Preview"}
            </Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={`mailto:${settings.supportEmail || "support@yourdomain.com"}`}
                className="flex items-center gap-2 px-4 py-2 bg-background rounded-md border hover:bg-muted transition-colors"
              >
                <IconMail className="h-4 w-4 text-primary" />
                <span className="text-sm">{settings.supportEmail || "support@yourdomain.com"}</span>
              </a>
              <a
                href={`https://wa.me/${(settings.supportWhatsapp || "+6281234567890").replace(/[^0-9]/g, "")}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-background rounded-md border hover:bg-muted transition-colors"
              >
                <IconBrandWhatsapp className="h-4 w-4 text-green-600" />
                <span className="text-sm">{settings.supportWhatsapp || "+6281234567890"}</span>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Legal Pages Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconLink className="h-5 w-5" />
            {t("branding.legalPages") || "Legal Pages"}
          </CardTitle>
          <CardDescription>
            {t("branding.legalPagesDesc") || "Configure URLs for Terms of Service and Privacy Policy pages (external links)"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="termsUrl">
                <IconLink className="inline h-4 w-4 mr-1" />
                {t("branding.termsUrl") || "Terms of Service URL"}
              </Label>
              <Input
                id="termsUrl"
                value={settings.termsUrl}
                onChange={handleChange("termsUrl")}
                placeholder="https://example.com/terms"
                className={validationErrors.termsUrl ? "border-destructive" : ""}
              />
              {validationErrors.termsUrl && (
                <p className="text-xs text-destructive">{validationErrors.termsUrl}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("branding.termsUrlHint") || "External URL to your Terms of Service page"}
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="privacyUrl">
                <IconLink className="inline h-4 w-4 mr-1" />
                {t("branding.privacyUrl") || "Privacy Policy URL"}
              </Label>
              <Input
                id="privacyUrl"
                value={settings.privacyUrl}
                onChange={handleChange("privacyUrl")}
                placeholder="https://example.com/privacy"
                className={validationErrors.privacyUrl ? "border-destructive" : ""}
              />
              {validationErrors.privacyUrl && (
                <p className="text-xs text-destructive">{validationErrors.privacyUrl}</p>
              )}
              <p className="text-xs text-muted-foreground">
                {t("branding.privacyUrlHint") || "External URL to your Privacy Policy page"}
              </p>
            </div>
          </div>

          {/* Legal Links Preview */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <Label className="text-sm font-medium mb-3 block">
              {t("branding.legalPreview") || "Legal Links Preview"}
            </Label>
            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href={settings.termsUrl || "https://yourdomain.com/terms"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-background rounded-md border hover:bg-muted transition-colors"
              >
                <IconLink className="h-4 w-4 text-primary" />
                <span className="text-sm">{t("branding.termsOfService") || "Terms of Service"}</span>
              </a>
              <a
                href={settings.privacyUrl || "https://yourdomain.com/privacy"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-background rounded-md border hover:bg-muted transition-colors"
              >
                <IconLink className="h-4 w-4 text-primary" />
                <span className="text-sm">{t("branding.privacyPolicy") || "Privacy Policy"}</span>
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Developer Integrations Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconPlugConnected className="h-5 w-5" />
            {t("branding.developerIntegrations") || "Developer Integrations"}
          </CardTitle>
          <CardDescription>
            {t("branding.developerIntegrationsDesc") || "Configure package names and identifiers for third-party integrations"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="n8nPackageName">
                <IconPlugConnected className="inline h-4 w-4 mr-1" />
                {t("branding.n8nPackageName") || "n8n Package Name"}
              </Label>
              <Input
                id="n8nPackageName"
                value={settings.n8nPackageName}
                onChange={handleChange("n8nPackageName")}
                placeholder="@kichat/n8n-nodes-kirimchat"
              />
              <p className="text-xs text-muted-foreground">
                {t("branding.n8nPackageNameHint") || "NPM package name displayed in Developer Docs for n8n integration"}
              </p>
            </div>
          </div>

          {/* n8n Package Preview */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <Label className="text-sm font-medium mb-3 block">
              {t("branding.n8nPreview") || "Installation Preview"}
            </Label>
            <div className="p-3 bg-background rounded-md border font-mono text-sm">
              <code className="text-muted-foreground">{settings.n8nPackageName || "@kichat/n8n-nodes-kirimchat"}</code>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* External Sidebar Links Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <IconExternalLink className="h-5 w-5" />
            {t("branding.externalLinks") || "External Sidebar Links"}
          </CardTitle>
          <CardDescription>
            {t("branding.externalLinksDesc") || "Add up to 3 external links that will appear in the sidebar under Support section"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4">
            {[0, 1, 2].map((index) => {
              const externalLinksArray = Array.isArray(settings.externalLinks) ? settings.externalLinks : []
              const link = externalLinksArray[index] || { label: "", url: "" }
              return (
                <div key={index} className="grid gap-3 p-4 border rounded-lg">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">
                      {t("branding.externalLink") || "External Link"} {index + 1}
                    </Label>
                    {(link.label || link.url) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const newLinks = [...externalLinksArray]
                          newLinks.splice(index, 1)
                          setSettings((prev) => ({ ...prev, externalLinks: newLinks }))
                          setSaveResult(null)
                        }}
                      >
                        <IconTrash className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`linkLabel${index}`} className="text-xs text-muted-foreground">
                      {t("branding.linkLabel") || "Label"}
                    </Label>
                    <Input
                      id={`linkLabel${index}`}
                      value={link.label}
                      onChange={(e) => {
                        const newLinks = [...externalLinksArray]
                        if (!newLinks[index]) {
                          newLinks[index] = { label: "", url: "" }
                        }
                        newLinks[index].label = e.target.value
                        setSettings((prev) => ({ ...prev, externalLinks: newLinks }))
                        setSaveResult(null)
                      }}
                      placeholder={t("branding.linkLabelPlaceholder") || "e.g. Documentation"}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor={`linkUrl${index}`} className="text-xs text-muted-foreground">
                      {t("branding.linkUrl") || "URL"}
                    </Label>
                    <Input
                      id={`linkUrl${index}`}
                      value={link.url}
                      onChange={(e) => {
                        const newLinks = [...externalLinksArray]
                        if (!newLinks[index]) {
                          newLinks[index] = { label: "", url: "" }
                        }
                        newLinks[index].url = e.target.value
                        setSettings((prev) => ({ ...prev, externalLinks: newLinks }))
                        setSaveResult(null)
                        // Validate URL
                        if (e.target.value && e.target.value.trim() !== "") {
                          try {
                            new URL(e.target.value)
                            setValidationErrors((prev) => {
                              const newErrors = { ...prev }
                              delete newErrors[`linkUrl${index}`]
                              return newErrors
                            })
                          } catch {
                            setValidationErrors((prev) => ({
                              ...prev,
                              [`linkUrl${index}`]: t("branding.invalidUrl") || "Invalid URL format",
                            }))
                          }
                        } else {
                          setValidationErrors((prev) => {
                            const newErrors = { ...prev }
                            delete newErrors[`linkUrl${index}`]
                            return newErrors
                          })
                        }
                      }}
                      placeholder="https://example.com/docs"
                      className={validationErrors[`linkUrl${index}`] ? "border-destructive" : ""}
                    />
                    {validationErrors[`linkUrl${index}`] && (
                      <p className="text-xs text-destructive">{validationErrors[`linkUrl${index}`]}</p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* External Links Preview */}
          {(Array.isArray(settings.externalLinks) ? settings.externalLinks : []).filter((l) => l.label && l.url).length > 0 && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <Label className="text-sm font-medium mb-3 block">
                {t("branding.externalLinksPreview") || "Sidebar Preview"}
              </Label>
              <div className="flex flex-col gap-2">
                {(Array.isArray(settings.externalLinks) ? settings.externalLinks : [])
                  .filter((l) => l.label && l.url)
                  .map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2 bg-background rounded-md border hover:bg-muted transition-colors"
                    >
                      <IconExternalLink className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{link.label}</span>
                    </a>
                  ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isResetting || isUpdating}
        >
          <IconRefresh className="mr-2 h-4 w-4" />
          {isResetting ? (t("branding.resetting") || "Resetting...") : (t("branding.resetToDefault") || "Reset to Default")}
        </Button>
        <Button 
          onClick={handleSave} 
          disabled={isUpdating || Object.keys(validationErrors).length > 0}
        >
          <IconDeviceFloppy className="mr-2 h-4 w-4" />
          {isUpdating ? (t("branding.saving") || "Saving...") : (t("branding.saveChanges") || "Save Changes")}
        </Button>
      </div>
    </div>
  )
}
