"use client"

import { Link } from "@/i18n/routing"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ArrowRight, Lock, Sparkles } from "lucide-react"
import type { SubscriptionTier } from "@/lib/api/subscription-api"
import { useBranding } from "@/hooks/use-branding"

export type FeatureType = "apiAccess" | "webhooksEnabled" | "aiChatbot" | "teamManagement"

interface UpgradePromptProps {
  feature: FeatureType
  currentTier: SubscriptionTier
  requiredTier: SubscriptionTier
}

const getFeatureDescriptions = (appName: string): Record<FeatureType, { title: string; description: string }> => ({
  apiAccess: {
    title: "API Access",
    description: `Create API keys to integrate ${appName} with your applications and automate messaging workflows.`,
  },
  webhooksEnabled: {
    title: "Webhooks",
    description: `Receive real-time notifications when events occur in your ${appName} account.`,
  },
  aiChatbot: {
    title: "AI Chatbot",
    description: "Enable AI-powered auto-replies and intelligent conversation handling.",
  },
  teamManagement: {
    title: "Team Management",
    description: "Invite team members and agents to help manage your customer conversations.",
  },
})

const tierLabels: Record<SubscriptionTier, string> = {
  FREE: "Free",
  BASIC: "Basic",
  LITE: "Lite",
  PRO: "Pro",
}

const tierColors: Record<SubscriptionTier, string> = {
  FREE: "bg-muted text-muted-foreground",
  BASIC: "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
  LITE: "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
  PRO: "bg-primary text-primary-foreground",
}

export function UpgradePrompt({ feature, currentTier, requiredTier }: UpgradePromptProps) {
  const { websiteName } = useBranding()
  const featureInfo = getFeatureDescriptions(websiteName)[feature]

  return (
    <Card className="border-dashed">
      <CardHeader className="text-center pb-2">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Lock className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle className="text-lg">{featureInfo.title}</CardTitle>
        <CardDescription>{featureInfo.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-center gap-2">
          <Badge className={tierColors[currentTier]} variant="secondary">
            {tierLabels[currentTier]}
          </Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" />
          <Badge className={tierColors[requiredTier]}>
            {tierLabels[requiredTier]}
          </Badge>
        </div>
        <p className="text-center text-sm text-muted-foreground">
          Upgrade to {tierLabels[requiredTier]} or higher to unlock this feature.
        </p>
        <div className="flex justify-center">
          <Button asChild>
            <Link href="/subscription">
              <Sparkles className="h-4 w-4" />
              Upgrade Plan
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
