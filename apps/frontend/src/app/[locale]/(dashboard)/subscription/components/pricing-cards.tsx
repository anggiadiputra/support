'use client'

import { useState, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import { Check, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { SubscriptionTier } from '@/lib/api/subscription-api'
import type { PricingData, PricingDataWithDurations } from '@/lib/api/subscription-api'
import { cn } from '@/lib/utils'

interface PricingCardsProps {
  currentTier: SubscriptionTier
  pricing: PricingData | null
  pricingWithDurations: PricingDataWithDurations | null
  loading: boolean
  onUpgrade: (tier: SubscriptionTier, durationMonths: number) => void
}

export function PricingCards({
  currentTier,
  pricing,
  pricingWithDurations,
  loading,
  onUpgrade,
}: PricingCardsProps) {
  const t = useTranslations('subscription')
  const [durationMonths, setDurationMonths] = useState<number>(1) // Default to monthly

  // Filter enabled tiers only - must be called before any conditional returns
  const enabledTiers = useMemo(() => {
    if (!pricingWithDurations) return []
    
    const allTiers: { key: 'basic' | 'lite' | 'pro'; tier: SubscriptionTier }[] = [
      { key: 'basic', tier: 'BASIC' },
      { key: 'lite', tier: 'LITE' },
      { key: 'pro', tier: 'PRO' },
    ]
    
    return allTiers.filter(({ key }) => {
      const plan = pricingWithDurations[key]
      return plan.enabled !== false // Show if enabled or undefined (backward compat)
    })
  }, [pricingWithDurations])

  if (loading) {
    return (
      <div className="grid gap-6 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="flex flex-col">
            <CardHeader>
              <Skeleton className="h-6 w-24 mb-2" />
              <Skeleton className="h-4 w-full" />
            </CardHeader>
            <CardContent className="flex-1">
              <Skeleton className="h-8 w-32 mb-4" />
              <div className="space-y-2">
                {[1, 2, 3, 4].map((j) => (
                  <Skeleton key={j} className="h-4 w-full" />
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Skeleton className="h-10 w-full" />
            </CardFooter>
          </Card>
        ))}
      </div>
    )
  }

  if (!pricing || !pricingWithDurations) return null

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(price)
  }

  // Available duration options (from first enabled plan)
  const firstEnabledPlan = enabledTiers.length > 0 ? pricingWithDurations[enabledTiers[0].key] : null
  const durationOptions = firstEnabledPlan?.durations || []
  
  // If no enabled plans, show message
  if (enabledTiers.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{t('noPlansAvailable') || 'No plans available at the moment.'}</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Duration Selector */}
      {durationOptions.length > 0 && (
        <div className="flex justify-center">
          <Tabs
            value={durationMonths.toString()}
            onValueChange={(v) => setDurationMonths(parseInt(v))}
            className="w-full max-w-md"
          >
            <TabsList className="grid w-full grid-cols-4">
              {durationOptions.map((option) => (
                <TabsTrigger key={option.months} value={option.months.toString()}>
                  {option.label}
                  {option.discountPercent > 0 && (
                    <Badge variant="destructive" className="ml-1 text-[10px] px-1 py-0 h-4">
                      -{option.discountPercent}%
                    </Badge>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      )}

      <div className={cn(
        "grid gap-6",
        enabledTiers.length === 1 && "lg:grid-cols-1 max-w-md mx-auto",
        enabledTiers.length === 2 && "lg:grid-cols-2 max-w-2xl mx-auto",
        enabledTiers.length >= 3 && "lg:grid-cols-3"
      )}>
        {enabledTiers.map(({ key, tier }) => {
          const plan = pricingWithDurations[key]
          const isContactUs = plan.isContactUs === true
          const durationData = plan.durations.find((d: { months: number }) => d.months === durationMonths)

          // For Contact Us plans, we don't need duration data
          if (!isContactUs && !durationData) return null

          // Logic for disabled: 
          // Disable if current tier is "higher" or equal
          const tierOrder: Record<SubscriptionTier, number> = { FREE: 0, BASIC: 1, LITE: 2, PRO: 3 }
          const isDowngradeOrSame = tierOrder[currentTier] >= tierOrder[tier]
          const isCurrent = currentTier === tier

          // Handle Contact Us click
          const handleContactUs = () => {
            if (plan.contactUrl) {
              window.open(plan.contactUrl, '_blank', 'noopener,noreferrer')
            }
          }

          return (
            <Card key={tier} className={cn("flex flex-col relative", tier === 'PRO' && !isContactUs && "border-primary shadow-lg")}>
              {tier === 'PRO' && !isContactUs && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">{t('recommended')}</Badge>
                </div>
              )}

              <CardHeader>
                <CardTitle className="text-xl">{plan.name}</CardTitle>
                <CardDescription className="min-h-[40px]">{t(`${key}Description`) || `${key} Plan`}</CardDescription>
              </CardHeader>

              <CardContent className="flex-1 space-y-6">
                <div>
                  {isContactUs ? (
                    <div className="flex items-center gap-2">
                      <Phone className="h-6 w-6 text-primary" />
                      <span className="text-2xl font-bold text-primary">{t('contactUs') || 'Contact Us'}</span>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-bold">
                          {formatPrice(durationData!.effectiveMonthlyPrice)}
                        </span>
                        <span className="text-muted-foreground">/ {t('month')}</span>
                      </div>
                      {durationMonths > 1 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          {t('billedAs', { price: formatPrice(durationData!.totalPrice), period: durationData!.label })}
                        </p>
                      )}
                    </>
                  )}
                </div>

                <div className="space-y-2">
                  {plan.features.map((feature: string, i: number) => (
                    <div key={i} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-green-500 mt-1 shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </div>
                  ))}
                </div>
              </CardContent>

              <CardFooter>
                {isContactUs ? (
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={handleContactUs}
                  >
                    <Phone className="h-4 w-4 mr-2" />
                    {t('contactUs') || 'Contact Us'}
                  </Button>
                ) : (
                  <Button
                    className="w-full"
                    variant={isCurrent ? "outline" : "default"}
                    disabled={isDowngradeOrSame}
                    onClick={() => onUpgrade(tier, durationMonths)}
                  >
                    {isCurrent ? t('currentPlan') : t('upgrade')}
                  </Button>
                )}
              </CardFooter>
            </Card>
          )
        })}
      </div>
    </div>
  )
}
