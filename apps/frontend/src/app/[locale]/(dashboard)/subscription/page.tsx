'use client'

/**
 * Subscription Page
 * Displays current subscription status and available plans with duration selection
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 2.1, 2.2
 */

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { CreditCard, Calendar, AlertCircle, Loader2 } from 'lucide-react'
import { Header } from '@/components/layout/header'
import { useTranslations } from 'next-intl'
import { useToast } from '@/hooks/use-toast'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Skeleton } from '@/components/ui/skeleton'
import { useSubscription, type SubscriptionTier } from './hooks/use-subscription'
import { PricingCards } from './components/pricing-cards'
import { PaymentHistory } from './components/payment-history'
import { CreditBalanceSection } from './components/credit-balance-section'
import { PaymentModal } from '@/components/payment/payment-modal'
import { TopUpModal } from '@/components/payment/topup-modal'
import { RoleGuard } from '@/components/auth/role-guard'
import { useCreditBalance, invalidateCreditBalance } from '@/hooks/use-credit'
import { useQueryClient } from '@tanstack/react-query'

// Status badge variants
const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  ACTIVE: 'default',
  PENDING_PAYMENT: 'secondary',
  EXPIRED: 'destructive',
  CANCELLED: 'outline',
}

// Format date to Indonesian locale
function formatDate(dateString: string | null): string {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

export default function SubscriptionPage() {
  const t = useTranslations('subscription')
  const tCredit = useTranslations('credit')
  const tCommon = useTranslations('common')
  const { subscription, pricing, pricingWithDurations, loading, error, refetch } = useSubscription()
  const { refetch: refetchCredit } = useCreditBalance()
  const queryClient = useQueryClient()
  const [selectedTier, setSelectedTier] = useState<SubscriptionTier | null>(null)
  const [selectedDurationMonths, setSelectedDurationMonths] = useState<number>(1)
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false)
  const [isTopUpModalOpen, setIsTopUpModalOpen] = useState(false)
  const [verifyingPayment, setVerifyingPayment] = useState(false)
  const [verifyingTopUp, setVerifyingTopUp] = useState(false)
  
  const searchParams = useSearchParams()
  const router = useRouter()
  const { toast } = useToast()

  // Check for payment verification param (subscription or top-up)
  useEffect(() => {
    const paymentVerification = searchParams.get('payment_verification')
    const topupVerification = searchParams.get('topup_verification')
    const orderId = searchParams.get('order_id')

    if (paymentVerification === 'true' && orderId) {
      verifyPayment(orderId)
    } else if (topupVerification === 'true' && orderId) {
      verifyTopUp(orderId)
    }
  }, [searchParams])

  const verifyPayment = async (orderId: string) => {
    setVerifyingPayment(true)
    try {
      // Poll status for 5 seconds (5 attempts)
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${API_URL}/api/v1/payment/status/${orderId}`, {
          method: 'GET',
          credentials: 'include',
        })
        
        const result = await response.json()
        
        if (result.success && result.data.status === 'COMPLETED') {
          toast({
            title: t('paymentSuccess'),
            description: t('premiumActivated'),
          })
          refetch() // Refresh subscription data
          
          // Clear query params
          const newParams = new URLSearchParams(searchParams.toString())
          newParams.delete('payment_verification')
          newParams.delete('order_id')
          router.replace(`?${newParams.toString()}`)
          
          setVerifyingPayment(false)
          return
        }
        
        // Wait 1s before next try
        await new Promise(r => setTimeout(r, 1000))
      }
      
      // If still not verified
      toast({
        variant: 'default',
        title: t('paymentPending'),
        description: t('paymentPendingDesc'),
      })
    } catch (err) {
      console.error('Verification failed', err)
    } finally {
      setVerifyingPayment(false)
    }
  }

  // Verify top-up payment after redirect
  const verifyTopUp = async (orderId: string) => {
    setVerifyingTopUp(true)
    try {
      // Poll status for 5 seconds (5 attempts)
      for (let i = 0; i < 5; i++) {
        const response = await fetch(`${API_URL}/api/v1/payment/status/${orderId}`, {
          method: 'GET',
          credentials: 'include',
        })
        
        const result = await response.json()
        
        if (result.success && result.data.status === 'COMPLETED') {
          toast({
            title: tCredit('topUpSuccess'),
            description: tCredit('topUpSuccessDesc', { amount: `Rp ${result.data.amount?.toLocaleString('id-ID') || '0'}` }),
          })
          invalidateCreditBalance(queryClient) // Refresh credit balance
          
          // Clear query params
          const newParams = new URLSearchParams(searchParams.toString())
          newParams.delete('topup_verification')
          newParams.delete('order_id')
          router.replace(`?${newParams.toString()}`)
          
          setVerifyingTopUp(false)
          return
        }
        
        // Wait 1s before next try
        await new Promise(r => setTimeout(r, 1000))
      }
      
      // If still not verified
      toast({
        variant: 'default',
        title: t('paymentPending'),
        description: t('paymentPendingDesc'),
      })
    } catch (err) {
      console.error('Top-up verification failed', err)
    } finally {
      setVerifyingTopUp(false)
    }
  }

  // Get status label from translations
  const getStatusLabel = (status: string): string => {
    const statusMap: Record<string, string> = {
      ACTIVE: t('statusActive'),
      PENDING_PAYMENT: t('pendingPayment'),
      EXPIRED: t('statusExpired'),
      CANCELLED: t('statusCancelled'),
    }
    return statusMap[status] || status
  }

  const handleUpgrade = (tier: SubscriptionTier, durationMonths: number) => {
    setSelectedTier(tier)
    setSelectedDurationMonths(durationMonths)
    setIsPaymentModalOpen(true)
  }

  const handlePaymentSuccess = () => {
    setIsPaymentModalOpen(false)
    setSelectedTier(null)
    setSelectedDurationMonths(1)
    refetch()
  }

  const handlePaymentClose = () => {
    setIsPaymentModalOpen(false)
    setSelectedTier(null)
    setSelectedDurationMonths(1)
  }

  // Top-up modal handlers
  const handleTopUpClick = () => {
    setIsTopUpModalOpen(true)
  }

  const handleTopUpSuccess = () => {
    setIsTopUpModalOpen(false)
    invalidateCreditBalance(queryClient)
  }

  const handleTopUpClose = () => {
    setIsTopUpModalOpen(false)
  }

  // Get price for selected tier and duration
  const getSelectedTierPrice = (): number => {
    if (!selectedTier) return 0
    
    // Try to get price from pricingWithDurations first
    if (pricingWithDurations) {
      const tierData = selectedTier === 'BASIC' 
        ? pricingWithDurations.basic 
        : selectedTier === 'LITE' 
          ? pricingWithDurations.lite 
          : pricingWithDurations.pro
          
      const durationData = tierData?.durations.find(d => d.months === selectedDurationMonths)
      if (durationData) {
        return durationData.totalPrice
      }
    }
    
    // Fallback to legacy pricing
    if (pricing) {
      if (selectedTier === 'BASIC') return pricing.basic.price
      return selectedTier === 'LITE' ? pricing.lite.price : pricing.pro.price
    }
    
    return 0
  }

  return (
    <RoleGuard>
      <Header />
      {/* Verifying Payment Overlay */}
      {verifyingPayment && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-medium">{t('verifyingPayment')}</p>
          </div>
        </div>
      )}
      {/* Verifying Top-Up Overlay */}
      {verifyingTopUp && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-10 w-10 animate-spin text-primary" />
            <p className="text-lg font-medium">{tCredit('processingTopUp')}</p>
          </div>
        </div>
      )}
      <div className="p-4 sm:p-6 lg:p-8 space-y-8">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{t('title')}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">
            {t('subtitle')}
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{tCommon('error')}</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Current Subscription Status */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              {t('subscriptionStatus')}
            </CardTitle>
            <CardDescription>
              {t('currentPlanInfo')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid gap-4 md:grid-cols-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-6 w-32" />
                  </div>
                ))}
              </div>
            ) : subscription ? (
              <div className="grid gap-6 md:grid-cols-3">
                <div>
                  <p className="text-sm text-muted-foreground">{t('plan')}</p>
                  <p className="text-lg font-semibold">{subscription.tier}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('status')}</p>
                  <Badge variant={statusVariants[subscription.status] || 'default'}>
                    {getStatusLabel(subscription.status)}
                  </Badge>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {t('validUntil')}
                  </p>
                  <p className="text-lg font-semibold">
                    {subscription.tier === 'FREE'
                      ? tCommon('forever')
                      : formatDate(subscription.endDate)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">
                {tCommon('noData')}
              </p>
            )}
          </CardContent>
        </Card>

        {/* Credit Balance Section */}
        <CreditBalanceSection onTopUpClick={handleTopUpClick} />

        {/* Expiry Warning */}
        {subscription?.status === 'EXPIRED' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('expiredWarning')}</AlertTitle>
            <AlertDescription>
              {t('expiredWarningDesc')}
            </AlertDescription>
          </Alert>
        )}

        {/* Pricing Cards */}
        <div>
          <h2 className="text-xl font-semibold mb-4">{t('choosePlan')}</h2>
          <PricingCards
            currentTier={subscription?.tier || 'FREE'}
            pricing={pricing}
            pricingWithDurations={pricingWithDurations}
            loading={loading}
            onUpgrade={handleUpgrade}
          />
        </div>

        {/* Payment History */}
        <PaymentHistory />

        {/* Payment Modal */}
        {selectedTier && selectedTier !== 'FREE' && (
          <PaymentModal
            isOpen={isPaymentModalOpen}
            onClose={handlePaymentClose}
            targetTier={selectedTier}
            durationMonths={selectedDurationMonths}
            onSuccess={handlePaymentSuccess}
            tierPrice={getSelectedTierPrice()}
          />
        )}

        {/* Top Up Modal */}
        <TopUpModal
          isOpen={isTopUpModalOpen}
          onClose={handleTopUpClose}
          onSuccess={handleTopUpSuccess}
        />
      </div>
    </RoleGuard>
  )
}
