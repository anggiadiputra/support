"use client"

import { useState } from "react"
import { RefreshCw, Zap, Sparkles, Crown, Pencil, Check, Phone, EyeOff } from "lucide-react"
import { useTranslations } from "next-intl"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { useToast } from "@/hooks/use-toast"
import {
  useAdminSubscriptionPlans,
  type PlanConfig,
  type PlanTier,
} from "../hooks/use-admin-subscription-plans"
import { PlanEditDialog } from "./components/plan-edit-dialog"

// Format price to IDR
function formatPrice(price: number, freeLabel: string): string {
  if (price === 0) return freeLabel
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

const tierConfig = {
  free: {
    icon: Zap,
    color: "text-gray-500",
    badgeClass: "bg-gray-100 text-gray-800 border-gray-200",
  },
  basic: {
    icon: Zap,
    color: "text-green-500",
    badgeClass: "bg-green-100 text-green-800 border-green-200",
  },
  lite: {
    icon: Sparkles,
    color: "text-blue-500",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200",
  },
  pro: {
    icon: Crown,
    color: "text-purple-500",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200",
  },
}

function PlanCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-8" />
        </div>
        <Skeleton className="h-4 w-40 mt-2" />
        <Skeleton className="h-8 w-32 mt-3" />
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface PlanCardProps {
  tier: PlanTier
  plan: PlanConfig
  onEdit: () => void
  translations: {
    free: string
    perMonth: string
    features: string
    noFeatures: string
  }
}

function PlanCard({ tier, plan, onEdit, translations }: PlanCardProps) {
  const config = tierConfig[tier]
  const Icon = config.icon
  const isDisabled = plan.enabled === false
  const isContactUs = plan.isContactUs === true

  return (
    <Card className={`flex flex-col ${isDisabled ? "opacity-60" : ""}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className={`h-5 w-5 ${config.color}`} />
            <CardTitle className="text-lg">{plan.name}</CardTitle>
          </div>
          <Button variant="ghost" size="icon" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription>{plan.description}</CardDescription>
        <div className="mt-3">
          {isContactUs ? (
            <div className="flex items-center gap-2">
              <Phone className="h-5 w-5 text-primary" />
              <span className="text-xl font-bold text-primary">Contact Us</span>
            </div>
          ) : (
            <>
              <span className="text-2xl font-bold">{formatPrice(plan.price, translations.free)}</span>
              {plan.price > 0 && (
                <span className="text-muted-foreground text-sm">{translations.perMonth}</span>
              )}
            </>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground mb-2">
            {translations.features} ({plan.features.length})
          </p>
          <ul className="space-y-2">
            {plan.features.map((feature, index) => (
              <li key={index} className="flex items-start gap-2">
                <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                <span className="text-sm">{feature}</span>
              </li>
            ))}
          </ul>
          {plan.features.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              {translations.noFeatures}
            </p>
          )}
        </div>
      </CardContent>
      <div className="p-4 pt-0 flex flex-wrap gap-2">
        <Badge variant="outline" className={config.badgeClass}>
          {tier.toUpperCase()} Tier
        </Badge>
        {isDisabled && (
          <Badge variant="secondary" className="bg-red-100 text-red-800 border-red-200">
            <EyeOff className="h-3 w-3 mr-1" />
            Disabled
          </Badge>
        )}
        {isContactUs && (
          <Badge variant="secondary" className="bg-blue-100 text-blue-800 border-blue-200">
            <Phone className="h-3 w-3 mr-1" />
            Contact Us
          </Badge>
        )}
      </div>
    </Card>
  )
}

export default function AdminSubscriptionPlansPage() {
  const t = useTranslations("admin")
  const tCommon = useTranslations("common")
  const tSub = useTranslations("subscription")
  const { toast } = useToast()
  const { plans, isLoading, error, updatePlan, updateDurations, refetch, isUpdating } =
    useAdminSubscriptionPlans()

  const [editDialog, setEditDialog] = useState<{
    tier: PlanTier
    plan: PlanConfig
  } | null>(null)

  const planCardTranslations = {
    free: tSub("free"),
    perMonth: tSub("perMonth"),
    features: tSub("features"),
    noFeatures: tSub("noFeatures"),
  }

  const handleSave = async (config: PlanConfig) => {
    if (!editDialog) return

    const result = await updatePlan(editDialog.tier, config)

    if (result.success) {
      toast({
        title: tCommon("success"),
        description: result.message,
      })
      setEditDialog(null)
    } else {
      toast({
        title: tCommon("failed"),
        description: result.message,
        variant: "destructive",
      })
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
            {t("subscriptionPlans")}
          </h1>
          <p className="text-muted-foreground">
            {t("subscriptionPlansDesc")}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <RefreshCw
            className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`}
          />
          {tCommon("refresh")}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          <>
            <PlanCardSkeleton />
            <PlanCardSkeleton />
            <PlanCardSkeleton />
            <PlanCardSkeleton />
          </>
        ) : plans ? (
          <>
            <PlanCard
              tier="free"
              plan={plans.free}
              onEdit={() => setEditDialog({ tier: "free", plan: plans.free })}
              translations={planCardTranslations}
            />
            <PlanCard
              tier="basic"
              plan={plans.basic}
              onEdit={() => setEditDialog({ tier: "basic", plan: plans.basic })}
              translations={planCardTranslations}
            />
            <PlanCard
              tier="lite"
              plan={plans.lite}
              onEdit={() => setEditDialog({ tier: "lite", plan: plans.lite })}
              translations={planCardTranslations}
            />
            <PlanCard
              tier="pro"
              plan={plans.pro}
              onEdit={() => setEditDialog({ tier: "pro", plan: plans.pro })}
              translations={planCardTranslations}
            />
          </>
        ) : null}
      </div>

      {editDialog && (
        <PlanEditDialog
          open={!!editDialog}
          onOpenChange={(open) => !open && setEditDialog(null)}
          tier={editDialog.tier}
          plan={editDialog.plan}
          onSave={handleSave}
          onSaveDurations={(durations) => updateDurations(editDialog.tier, durations)}
          isSaving={isUpdating}
        />
      )}
    </div>
  )
}
