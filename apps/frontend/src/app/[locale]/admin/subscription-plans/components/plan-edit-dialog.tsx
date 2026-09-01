"use client"

import { useState, useEffect } from "react"
import { RefreshCw } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Switch } from "@/components/ui/switch"
import type { PlanConfig, PlanTier, DurationConfig, ChannelLimits, NumericLimits } from "../../hooks/use-admin-subscription-plans"
import { FeaturesListEditor } from "./features-list-editor"
import { DurationConfigEditor } from "./duration-config-editor"

interface PlanEditDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tier: PlanTier
  plan: PlanConfig
  onSave: (config: PlanConfig) => Promise<void>
  onSaveDurations?: (durations: DurationConfig[]) => Promise<{ success: boolean; message: string }>
  isSaving: boolean
}

interface FormErrors {
  name?: string
  price?: string
}

// Default durations for paid tiers
const DEFAULT_DURATIONS: DurationConfig[] = [
  { months: 1, days: 30, discountPercent: 0, enabled: true, label: "1 Bulan" },
  { months: 3, days: 90, discountPercent: 10, enabled: true, label: "3 Bulan" },
  { months: 6, days: 180, discountPercent: 15, enabled: true, label: "6 Bulan" },
  { months: 12, days: 365, discountPercent: 20, enabled: true, label: "1 Tahun" },
]

// Default channel limits per tier
const DEFAULT_CHANNEL_LIMITS: Record<PlanTier, ChannelLimits> = {
  free: { maxWhatsappDevices: 1, maxInstagramAccounts: 1, maxMessengerAccounts: 1 },
  basic: { maxWhatsappDevices: 2, maxInstagramAccounts: 2, maxMessengerAccounts: 2 },
  lite: { maxWhatsappDevices: 3, maxInstagramAccounts: 3, maxMessengerAccounts: 3 },
  pro: { maxWhatsappDevices: 10, maxInstagramAccounts: 10, maxMessengerAccounts: 10 },
}

// Default numeric limits per tier
const DEFAULT_NUMERIC_LIMITS: Record<PlanTier, NumericLimits> = {
  free: { maxAgents: 0, maxKnowledgeDocs: 0, maxTeamMembers: 0, maxApiKeys: 0, maxWebhookEndpoints: 0, messageRetentionDays: 7 },
  basic: { maxAgents: 0, maxKnowledgeDocs: 0, maxTeamMembers: 2, maxApiKeys: 2, maxWebhookEndpoints: 3, messageRetentionDays: 30 },
  lite: { maxAgents: 1, maxKnowledgeDocs: 5, maxTeamMembers: 5, maxApiKeys: 5, maxWebhookEndpoints: 3, messageRetentionDays: 30 },
  pro: { maxAgents: 10, maxKnowledgeDocs: 50, maxTeamMembers: 10, maxApiKeys: 10, maxWebhookEndpoints: 20, messageRetentionDays: 30 },
}

export function PlanEditDialog({
  open,
  onOpenChange,
  tier,
  plan,
  onSave,
  onSaveDurations,
  isSaving,
}: PlanEditDialogProps) {
  const t = useTranslations("admin")
  const tCommon = useTranslations("common")
  const tSub = useTranslations("subscription")
  const [name, setName] = useState(plan.name)
  const [description, setDescription] = useState(plan.description)
  const [price, setPrice] = useState(plan.price.toString())
  const [features, setFeatures] = useState<string[]>(plan.features)
  const [durations, setDurations] = useState<DurationConfig[]>(
    plan.durations?.length ? plan.durations : DEFAULT_DURATIONS
  )
  const [enabled, setEnabled] = useState(plan.enabled ?? true)
  const [isContactUs, setIsContactUs] = useState(plan.isContactUs ?? false)
  const [contactUrl, setContactUrl] = useState(plan.contactUrl ?? "")
  const [errors, setErrors] = useState<FormErrors>({})
  const [isSavingDurations, setIsSavingDurations] = useState(false)
  const [channelLimits, setChannelLimits] = useState<ChannelLimits>(
    plan.channelLimits || DEFAULT_CHANNEL_LIMITS[tier]
  )
  const [numericLimits, setNumericLimits] = useState<NumericLimits>(
    plan.numericLimits || DEFAULT_NUMERIC_LIMITS[tier]
  )

  // Reset form when plan changes
  useEffect(() => {
    setName(plan.name)
    setDescription(plan.description)
    setPrice(plan.price.toString())
    setFeatures([...plan.features])
    setDurations(plan.durations?.length ? [...plan.durations] : DEFAULT_DURATIONS)
    setEnabled(plan.enabled ?? true)
    setIsContactUs(plan.isContactUs ?? false)
    setContactUrl(plan.contactUrl ?? "")
    setChannelLimits(plan.channelLimits || DEFAULT_CHANNEL_LIMITS[tier])
    setNumericLimits(plan.numericLimits || DEFAULT_NUMERIC_LIMITS[tier])
    setErrors({})
  }, [plan, tier])

  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Validate name
    if (!name || name.trim() === "") {
      newErrors.name = t("planNameRequired")
    }

    // Validate price for paid tiers
    if (tier !== "free") {
      const priceNum = parseInt(price, 10)
      if (isNaN(priceNum) || priceNum <= 0) {
        newErrors.price = t("planPriceError")
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async () => {
    if (!validateForm()) return

    const config: PlanConfig = {
      name: name.trim(),
      description: description.trim(),
      price: tier === "free" ? 0 : parseInt(price, 10),
      features,
      durations: tier !== "free" ? durations : [],
      enabled: tier === "free" ? true : enabled, // FREE tier is always enabled
      isContactUs: tier === "free" ? false : isContactUs,
      contactUrl: isContactUs ? contactUrl.trim() : "",
      channelLimits,
      numericLimits,
    }

    await onSave(config)
  }

  const handleChannelLimitChange = (field: keyof ChannelLimits, value: string) => {
    const numValue = parseInt(value, 10)
    if (!isNaN(numValue) && numValue >= 0) {
      setChannelLimits(prev => ({ ...prev, [field]: numValue }))
    }
  }

  const handleNumericLimitChange = (field: keyof NumericLimits, value: string) => {
    const numValue = parseInt(value, 10)
    // Allow -1 for messageRetentionDays (unlimited)
    const minValue = field === "messageRetentionDays" ? -1 : 0
    if (!isNaN(numValue) && numValue >= minValue) {
      setNumericLimits(prev => ({ ...prev, [field]: numValue }))
    }
  }

  const tierLabels: Record<PlanTier, string> = {
    free: "FREE",
    basic: "BASIC",
    lite: "LITE",
    pro: "PRO",
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("editPlan", { tier: tierLabels[tier] })}</DialogTitle>
          <DialogDescription>
            {t("editPlanDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Availability Settings - Only for paid tiers */}
          {tier !== "free" && (
            <>
              <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
                <h4 className="font-medium text-sm">{t("planAvailability") || "Availability Settings"}</h4>
                
                {/* Enable/Disable Plan */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="enabled">{t("planEnabled") || "Plan Enabled"}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("planEnabledDesc") || "When disabled, this plan won't be shown to users"}
                    </p>
                  </div>
                  <Switch
                    id="enabled"
                    checked={enabled}
                    onCheckedChange={setEnabled}
                  />
                </div>

                {/* Contact Us Mode */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="isContactUs">{t("planContactUs") || "Contact Us Mode"}</Label>
                    <p className="text-xs text-muted-foreground">
                      {t("planContactUsDesc") || "Show 'Contact Us' instead of price"}
                    </p>
                  </div>
                  <Switch
                    id="isContactUs"
                    checked={isContactUs}
                    onCheckedChange={setIsContactUs}
                  />
                </div>

                {/* Contact URL - Only shown when Contact Us is enabled */}
                {isContactUs && (
                  <div className="space-y-2">
                    <Label htmlFor="contactUrl">{t("planContactUrl") || "Contact URL"}</Label>
                    <Input
                      id="contactUrl"
                      value={contactUrl}
                      onChange={(e) => setContactUrl(e.target.value)}
                      placeholder="https://example.com/contact"
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("planContactUrlDesc") || "URL to redirect users when they click Contact Us"}
                    </p>
                  </div>
                )}
              </div>
              <Separator />
            </>
          )}

          {/* Name Field */}
          <div className="space-y-2">
            <Label htmlFor="name">{t("planName")} *</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => {
                setName(e.target.value)
                if (errors.name) setErrors({ ...errors, name: undefined })
              }}
              placeholder={t("planNamePlaceholder")}
            />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name}</p>
            )}
          </div>

          {/* Description Field */}
          <div className="space-y-2">
            <Label htmlFor="description">{t("planDescription")}</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t("planDescriptionPlaceholder")}
              rows={2}
            />
          </div>

          {/* Price Field */}
          <div className="space-y-2">
            <Label htmlFor="price">
              {t("planPrice")} {tier !== "free" && "*"}
            </Label>
            <Input
              id="price"
              type="number"
              value={price}
              onChange={(e) => {
                setPrice(e.target.value)
                if (errors.price) setErrors({ ...errors, price: undefined })
              }}
              placeholder="99000"
              disabled={tier === "free"}
              min={tier === "free" ? 0 : 1}
            />
            {tier === "free" && (
              <p className="text-sm text-muted-foreground">
                {t("planPriceFreeNote")}
              </p>
            )}
            {errors.price && (
              <p className="text-sm text-destructive">{errors.price}</p>
            )}
          </div>

          {/* Features List */}
          <div className="space-y-2">
            <Label>{tSub("features")}</Label>
            <FeaturesListEditor
              features={features}
              onChange={setFeatures}
            />
          </div>

          {/* Duration Configuration - Only for paid tiers */}
          {tier !== "free" && (
            <>
              <Separator className="my-4" />
              <div className="space-y-2">
                <Label>{t("durationConfig")}</Label>
                <DurationConfigEditor
                  durations={durations}
                  onChange={setDurations}
                  basePrice={parseInt(price, 10) || 0}
                  onSave={onSaveDurations}
                  isSaving={isSavingDurations}
                  setIsSaving={setIsSavingDurations}
                />
              </div>
            </>
          )}

          {/* Numeric Limits Configuration */}
          <Separator className="my-4" />
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm">{t("numericLimits") || "Plan Limits"}</h4>
            <p className="text-xs text-muted-foreground">
              {t("numericLimitsDesc") || "Set the feature limits for this plan"}
            </p>
            
            {/* Max AI Agents */}
            <div className="space-y-2">
              <Label htmlFor="maxAgents">
                {t("maxAgents") || "Max AI Agents"}
              </Label>
              <Input
                id="maxAgents"
                type="number"
                min={0}
                value={numericLimits.maxAgents}
                onChange={(e) => handleNumericLimitChange("maxAgents", e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxAgentsDesc") || "Maximum number of AI agents that can be created"}
              </p>
            </div>

            {/* Max Knowledge Documents */}
            <div className="space-y-2">
              <Label htmlFor="maxKnowledgeDocs">
                {t("maxKnowledgeDocs") || "Max Knowledge Documents"}
              </Label>
              <Input
                id="maxKnowledgeDocs"
                type="number"
                min={0}
                value={numericLimits.maxKnowledgeDocs}
                onChange={(e) => handleNumericLimitChange("maxKnowledgeDocs", e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxKnowledgeDocsDesc") || "Maximum number of knowledge documents for AI agents"}
              </p>
            </div>

            {/* Max Team Members */}
            <div className="space-y-2">
              <Label htmlFor="maxTeamMembers">
                {t("maxTeamMembers") || "Max Team Members"}
              </Label>
              <Input
                id="maxTeamMembers"
                type="number"
                min={0}
                value={numericLimits.maxTeamMembers}
                onChange={(e) => handleNumericLimitChange("maxTeamMembers", e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxTeamMembersDesc") || "Maximum number of team members that can be invited"}
              </p>
            </div>

            {/* Max API Keys */}
            <div className="space-y-2">
              <Label htmlFor="maxApiKeys">
                {t("maxApiKeys") || "Max API Keys"}
              </Label>
              <Input
                id="maxApiKeys"
                type="number"
                min={0}
                value={numericLimits.maxApiKeys}
                onChange={(e) => handleNumericLimitChange("maxApiKeys", e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxApiKeysDesc") || "Maximum number of API keys that can be created"}
              </p>
            </div>

            {/* Max Webhook Endpoints */}
            <div className="space-y-2">
              <Label htmlFor="maxWebhookEndpoints">
                {t("maxWebhookEndpoints") || "Max Webhook Endpoints"}
              </Label>
              <Input
                id="maxWebhookEndpoints"
                type="number"
                min={0}
                value={numericLimits.maxWebhookEndpoints}
                onChange={(e) => handleNumericLimitChange("maxWebhookEndpoints", e.target.value)}
                placeholder="0"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxWebhookEndpointsDesc") || "Maximum number of webhook endpoints that can be configured"}
              </p>
            </div>

            {/* Message Retention Days */}
            <div className="space-y-2">
              <Label htmlFor="messageRetentionDays">
                {t("messageRetentionDays") || "Message Retention Days"}
              </Label>
              <Input
                id="messageRetentionDays"
                type="number"
                min={-1}
                value={numericLimits.messageRetentionDays}
                onChange={(e) => handleNumericLimitChange("messageRetentionDays", e.target.value)}
                placeholder="30"
              />
              <p className="text-xs text-muted-foreground">
                {t("messageRetentionDaysDesc") || "Number of days to retain messages (-1 for unlimited)"}
              </p>
            </div>
          </div>

          {/* Channel Limits Configuration */}
          <Separator className="my-4" />
          <div className="space-y-4 p-4 bg-muted/50 rounded-lg">
            <h4 className="font-medium text-sm">{t("channelLimits") || "Channel Limits"}</h4>
            <p className="text-xs text-muted-foreground">
              {t("channelLimitsDesc") || "Set the maximum number of connected channels for this plan"}
            </p>
            
            {/* WhatsApp Devices */}
            <div className="space-y-2">
              <Label htmlFor="maxWhatsappDevices">
                {t("maxWhatsappDevices") || "Max WhatsApp Devices"}
              </Label>
              <Input
                id="maxWhatsappDevices"
                type="number"
                min={0}
                value={channelLimits.maxWhatsappDevices}
                onChange={(e) => handleChannelLimitChange("maxWhatsappDevices", e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxWhatsappDevicesDesc") || "Number of WhatsApp numbers that can be connected"}
              </p>
            </div>

            {/* Instagram Accounts */}
            <div className="space-y-2">
              <Label htmlFor="maxInstagramAccounts">
                {t("maxInstagramAccounts") || "Max Instagram Accounts"}
              </Label>
              <Input
                id="maxInstagramAccounts"
                type="number"
                min={0}
                value={channelLimits.maxInstagramAccounts}
                onChange={(e) => handleChannelLimitChange("maxInstagramAccounts", e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxInstagramAccountsDesc") || "Number of Instagram accounts that can be connected"}
              </p>
            </div>

            {/* Messenger Accounts */}
            <div className="space-y-2">
              <Label htmlFor="maxMessengerAccounts">
                {t("maxMessengerAccounts") || "Max Messenger Accounts"}
              </Label>
              <Input
                id="maxMessengerAccounts"
                type="number"
                min={0}
                value={channelLimits.maxMessengerAccounts}
                onChange={(e) => handleChannelLimitChange("maxMessengerAccounts", e.target.value)}
                placeholder="1"
              />
              <p className="text-xs text-muted-foreground">
                {t("maxMessengerAccountsDesc") || "Number of Messenger pages that can be connected"}
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSaving}
          >
            {tCommon("cancel")}
          </Button>
          <Button onClick={handleSubmit} disabled={isSaving}>
            {isSaving ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                {tCommon("saving")}
              </>
            ) : (
              tCommon("save")
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
