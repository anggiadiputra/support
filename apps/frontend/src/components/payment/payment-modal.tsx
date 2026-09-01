'use client'

/**
 * Payment Modal Component
 * 
 * Flow:
 * 1. Modal opens → show loading
 * 2. Fetch prorate info → show price breakdown (with proration if applicable)
 * 3. User clicks "Lanjut Bayar" → Create Xendit Invoice
 * 4. Redirect to Xendit payment page
 * 5. User pays on Xendit → callback updates subscription
 * 
 * No method selection needed - Xendit handles all payment methods.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, XCircle, Loader2, AlertCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { invalidateSubscriptionCache } from '@/hooks/use-subscription-query'
import { useCreditBalance, invalidateCreditBalance } from '@/hooks/use-credit'
import { subscriptionApi, type ProrateInfo } from '@/lib/api/subscription-api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005'

// Types
export type SubscriptionTier = 'BASIC' | 'LITE' | 'PRO'
export type PaymentStatus = 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' | 'CANCELLED'

type ModalStep = 'loading' | 'prorate' | 'success' | 'error' | 'expired'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  targetTier: SubscriptionTier
  durationMonths: number
  onSuccess: () => void
  tierPrice?: number
}

interface PaymentData {
  orderId: string
  paymentUrl: string
  amount: number
  expiresAt: string
  subscriptionEndDate?: string
}

// Format price to IDR
function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

// Format date to locale string
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export function PaymentModal({
  isOpen,
  onClose,
  targetTier,
  durationMonths,
  onSuccess,
  tierPrice = 0,
}: PaymentModalProps) {
  const t = useTranslations('payment')
  const tCredit = useTranslations('credit')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<ModalStep>('loading')
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null)
  const [prorateInfo, setProrateInfo] = useState<ProrateInfo | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Credit balance for showing credit usage info
  const { data: creditData } = useCreditBalance()
  const creditBalance = creditData?.balance ?? 0

  const pollingRef = useRef<NodeJS.Timeout | null>(null)
  const hasFetchedProrate = useRef(false)

  // Create payment and redirect
  const createPaymentAndRedirect = useCallback(async () => {
    setStep('loading')
    setError(null)

    try {
      const response = await fetch(`${API_URL}/api/v1/payment/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          targetTier, 
          durationMonths, 
          paymentMethod: 'QRIS', // Default, Xendit will show all options
          locale, // Pass locale for correct redirect
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error?.message || t('failedToCreatePayment'))
      }

      // Calculate subscription end date
      const subscriptionEndDate = new Date()
      subscriptionEndDate.setDate(subscriptionEndDate.getDate() + (durationMonths === 12 ? 365 : durationMonths * 30))

      // Must have paymentUrl from Xendit Invoice
      if (!result.data.paymentUrl) {
        throw new Error('Payment URL not received')
      }

      setPaymentData({
        orderId: result.data.orderId,
        paymentUrl: result.data.paymentUrl,
        amount: result.data.amount,
        expiresAt: result.data.expiresAt,
        subscriptionEndDate: subscriptionEndDate.toISOString(),
      })

      // Redirect to Xendit payment page
      window.location.href = result.data.paymentUrl

    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreatePayment'))
      setStep('error')
    }
  }, [targetTier, durationMonths, locale, t])

  // Handle close
  const handleClose = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current)
    onClose()
  }, [onClose])

  // Fetch prorate info
  const fetchProrateInfo = useCallback(async () => {
    setStep('loading')
    setError(null)

    try {
      const info = await subscriptionApi.getProrate(targetTier, durationMonths)
      setProrateInfo(info)
      setStep('prorate')
    } catch (err) {
      // If prorate fetch fails, still allow payment but without prorate info
      setProrateInfo({
        hasProration: false,
        targetTier,
        originalPrice: tierPrice,
        effectivePrice: tierPrice,
      })
      setStep('prorate')
    }
  }, [targetTier, durationMonths, tierPrice])

  // Auto-fetch prorate when modal opens
  useEffect(() => {
    if (isOpen && !hasFetchedProrate.current) {
      hasFetchedProrate.current = true
      setStep('loading')
      setPaymentData(null)
      setProrateInfo(null)
      setError(null)
      fetchProrateInfo()
    } else if (!isOpen) {
      hasFetchedProrate.current = false
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [isOpen, fetchProrateInfo])

  // Handle proceed to payment
  const handleProceedToPayment = useCallback(() => {
    createPaymentAndRedirect()
  }, [createPaymentAndRedirect])

  // Handle success completion
  const handleSuccessClose = useCallback(() => {
    invalidateSubscriptionCache(queryClient)
    invalidateCreditBalance(queryClient) // Also refresh credit balance
    onSuccess()
    handleClose()
  }, [queryClient, onSuccess, handleClose])

  // Handle retry
  const handleRetry = () => {
    hasFetchedProrate.current = false
    setPaymentData(null)
    setProrateInfo(null)
    setError(null)
    fetchProrateInfo()
  }

  // Get duration label
  const getDurationLabel = (months: number): string => {
    switch (months) {
      case 1: return t('duration1Month')
      case 3: return t('duration3Months')
      case 6: return t('duration6Months')
      case 12: return t('duration12Months')
      default: return `${months} ${t('duration1Month').split(' ')[1]}`
    }
  }

  // Render loading step
  const renderLoading = () => (
    <>
      <DialogHeader>
        <DialogTitle>
          {t('processingPayment')} - {getDurationLabel(durationMonths)}
        </DialogTitle>
        <DialogDescription>
          {t('upgradeTo', { tier: targetTier })} - {formatPrice(tierPrice)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center py-8 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {t('redirectingToPayment')}
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" onClick={handleClose}>
          {tCommon('cancel')}
        </Button>
      </DialogFooter>
    </>
  )

  // Render prorate info step
  const renderProrate = () => {
    const info = prorateInfo
    const originalPrice = info?.originalPrice ?? tierPrice
    const priceAfterProrate = info?.effectivePrice ?? tierPrice
    const hasProration = info?.hasProration && info.prorateCredit && info.prorateCredit > 0
    
    // Credit calculation
    const creditToUse = Math.min(creditBalance, priceAfterProrate)
    const amountToPay = priceAfterProrate - creditToUse
    const hasCredit = creditBalance > 0
    const isFullyCoveredByCredit = amountToPay === 0 && priceAfterProrate > 0

    return (
      <>
        <DialogHeader>
          <DialogTitle>
            Upgrade ke {targetTier} - {getDurationLabel(durationMonths)}
          </DialogTitle>
          <DialogDescription>
            Konfirmasi detail pembayaran
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          {/* Price Breakdown */}
          <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
            {/* Original Price */}
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Harga Normal</span>
              <span className="text-sm font-medium">{formatPrice(originalPrice)}</span>
            </div>

            {/* Prorate Credit - only show if applicable */}
            {hasProration && (
              <div className="flex justify-between items-center text-green-600 dark:text-green-400">
                <span className="text-sm">
                  Kredit Prorata
                  {info?.daysRemaining !== undefined && (
                    <span className="text-xs text-muted-foreground ml-1">
                      ({info.daysRemaining} hari tersisa dari {info.currentTier})
                    </span>
                  )}
                </span>
                <span className="text-sm font-medium">-{formatPrice(info?.prorateCredit ?? 0)}</span>
              </div>
            )}

            {/* Credit Balance Used - show if user has credit */}
            {hasCredit && creditToUse > 0 && (
              <div className="flex justify-between items-center text-blue-600 dark:text-blue-400">
                <span className="text-sm">
                  {tCredit('creditUsed')}
                  <span className="text-xs text-muted-foreground ml-1">
                    (Saldo: {formatPrice(creditBalance)})
                  </span>
                </span>
                <span className="text-sm font-medium">-{formatPrice(creditToUse)}</span>
              </div>
            )}

            {/* Divider before total */}
            {(hasProration || hasCredit) && (
              <div className="border-t border-dashed" />
            )}

            {/* Total */}
            <div className="flex justify-between items-center">
              <span className="font-semibold">{tCredit('amountToPay')}</span>
              <span className="text-lg font-bold text-primary">{formatPrice(amountToPay)}</span>
            </div>

            {/* Fully covered by credit badge */}
            {isFullyCoveredByCredit && (
              <div className="flex justify-center">
                <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-1 rounded-full">
                  {tCredit('fullyCoveredByCredit')}
                </span>
              </div>
            )}

            {/* Remaining credit after payment */}
            {hasCredit && creditToUse > 0 && (
              <div className="flex justify-between items-center text-xs text-muted-foreground">
                <span>{tCredit('remainingCredit')}</span>
                <span>{formatPrice(creditBalance - creditToUse)}</span>
              </div>
            )}

            {/* Savings */}
            {hasProration && info?.savings && info.savings > 0 && (
              <div className="flex justify-center">
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                  Hemat {formatPrice(info.savings)}
                </span>
              </div>
            )}
          </div>

          {/* Info text */}
          <p className="text-xs text-muted-foreground text-center">
            {isFullyCoveredByCredit
              ? tCredit('noPaymentNeeded')
              : 'Anda akan diarahkan ke halaman pembayaran Xendit'}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
          <Button onClick={handleProceedToPayment}>
            {isFullyCoveredByCredit ? tCredit('payWithCredit') : 'Lanjut Bayar'}
          </Button>
        </DialogFooter>
      </>
    )
  }

  // Render success state
  const renderSuccess = () => (
    <>
      <DialogHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <DialogTitle>{t('paymentSuccess')}</DialogTitle>
        <DialogDescription>{t('paymentSuccessDesc', { tier: targetTier })}</DialogDescription>
      </DialogHeader>

      <div className="py-4 text-center space-y-2">
        <p className="text-sm text-muted-foreground">{t('premiumActivated')}</p>
        {paymentData?.subscriptionEndDate && (
          <p className="text-sm font-medium">
            {t('subscriptionValidUntil', { date: formatDate(paymentData.subscriptionEndDate) })}
          </p>
        )}
      </div>

      <DialogFooter>
        <Button onClick={handleSuccessClose} className="w-full">
          {tCommon('done')}
        </Button>
      </DialogFooter>
    </>
  )

  // Render error state
  const renderError = () => (
    <>
      <DialogHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
          <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
        </div>
        <DialogTitle>{t('paymentFailedTitle')}</DialogTitle>
        <DialogDescription>{error || t('paymentFailedDesc')}</DialogDescription>
      </DialogHeader>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={handleClose}>
          {tCommon('close')}
        </Button>
        <Button onClick={handleRetry}>{t('tryAgain')}</Button>
      </DialogFooter>
    </>
  )

  // Render expired state
  const renderExpired = () => (
    <>
      <DialogHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900">
          <AlertCircle className="h-10 w-10 text-amber-600 dark:text-amber-400" />
        </div>
        <DialogTitle>{t('paymentExpired')}</DialogTitle>
        <DialogDescription>{t('paymentExpiredDesc')}</DialogDescription>
      </DialogHeader>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={handleClose}>
          {tCommon('close')}
        </Button>
        <Button onClick={handleRetry}>{t('createNewTransaction')}</Button>
      </DialogFooter>
    </>
  )

  // Render content based on step
  const renderContent = () => {
    switch (step) {
      case 'loading': return renderLoading()
      case 'prorate': return renderProrate()
      case 'success': return renderSuccess()
      case 'error': return renderError()
      case 'expired': return renderExpired()
      default: return renderLoading()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">{renderContent()}</DialogContent>
    </Dialog>
  )
}
