'use client'

/**
 * Top Up Modal Component
 *
 * Modal for selecting top-up amount and initiating payment.
 * Flow:
 * 1. User selects amount from fixed packages
 * 2. User clicks "Proceed to Payment"
 * 3. Redirect to Xendit payment page
 * 4. After payment, callback updates credit balance
 */

import { useState, useEffect, useCallback } from 'react'
import { useTranslations, useLocale } from 'next-intl'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Wallet, CheckCircle2, XCircle } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useTopUpPackages, useCreateTopUp, invalidateCreditBalance } from '@/hooks/use-credit'
import { cn } from '@/lib/utils'

// Format price to IDR
function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

// Format price compact (50rb, 100rb, etc)
function formatPriceCompact(price: number): string {
  if (price >= 1000000) {
    const jt = price / 1000000
    return `${jt % 1 === 0 ? jt.toFixed(0) : jt.toFixed(1)}jt`
  }
  return `${(price / 1000).toFixed(0)}rb`
}

type ModalStep = 'select' | 'loading' | 'success' | 'error'

interface TopUpModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess?: () => void
}

export function TopUpModal({ isOpen, onClose, onSuccess }: TopUpModalProps) {
  const t = useTranslations('credit')
  const tCommon = useTranslations('common')
  const locale = useLocale()
  const queryClient = useQueryClient()

  const [step, setStep] = useState<ModalStep>('select')
  const [selectedAmount, setSelectedAmount] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: packagesData, isLoading: packagesLoading } = useTopUpPackages()
  const createTopUpMutation = useCreateTopUp()

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setStep('select')
      setSelectedAmount(null)
      setError(null)
    }
  }, [isOpen])

  // Handle close
  const handleClose = useCallback(() => {
    if (step === 'loading') return // Prevent closing during loading
    onClose()
  }, [step, onClose])

  // Handle proceed to payment
  const handleProceedToPayment = useCallback(async () => {
    if (!selectedAmount) return

    setStep('loading')
    setError(null)

    try {
      const result = await createTopUpMutation.mutateAsync({
        amount: selectedAmount,
        paymentMethod: 'QRIS', // Default, Xendit will show all options
        locale,
      })

      // If we have a payment URL, redirect to it
      if (result.paymentUrl) {
        window.location.href = result.paymentUrl
      } else if (result.qrUrl) {
        // Fallback to QR URL if available
        window.location.href = result.qrUrl
      } else {
        // No redirect URL available, show error
        throw new Error(t('noPaymentUrl'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('failedToCreateTopUp'))
      setStep('error')
    }
  }, [selectedAmount, locale, createTopUpMutation, t])

  // Handle retry
  const handleRetry = useCallback(() => {
    setStep('select')
    setError(null)
  }, [])

  // Handle success close
  const handleSuccessClose = useCallback(() => {
    invalidateCreditBalance(queryClient)
    onSuccess?.()
    handleClose()
  }, [queryClient, onSuccess, handleClose])

  // Render select step
  const renderSelect = () => {
    const packages = packagesData?.packages || []

    return (
      <>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wallet className="h-5 w-5" />
            {t('topUpCredit')}
          </DialogTitle>
          <DialogDescription>{t('selectTopUpAmount')}</DialogDescription>
        </DialogHeader>

        <div className="py-4">
          {packagesLoading ? (
            <div className="grid grid-cols-2 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg border bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          ) : packages.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground">
              {t('noPackagesAvailable')}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {packages.map((pkg) => (
                <button
                  key={pkg.amount}
                  type="button"
                  onClick={() => setSelectedAmount(pkg.amount)}
                  className={cn(
                    'flex flex-col items-center justify-center p-4 rounded-lg border-2 transition-all',
                    'hover:border-primary hover:bg-primary/5',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                    selectedAmount === pkg.amount
                      ? 'border-primary bg-primary/10'
                      : 'border-border'
                  )}
                >
                  <span className="text-lg font-bold">
                    {formatPriceCompact(pkg.amount)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {formatPrice(pkg.amount)}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Selected Amount Summary */}
          {selectedAmount && (
            <div className="mt-4 p-3 rounded-lg bg-muted/50 border">
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">
                  {t('topUpAmount')}
                </span>
                <span className="font-semibold">
                  {formatPrice(selectedAmount)}
                </span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleClose}>
            {tCommon('cancel')}
          </Button>
          <Button
            onClick={handleProceedToPayment}
            disabled={!selectedAmount || packagesLoading}
          >
            {t('proceedToPayment')}
          </Button>
        </DialogFooter>
      </>
    )
  }

  // Render loading step
  const renderLoading = () => (
    <>
      <DialogHeader>
        <DialogTitle>{t('processingTopUp')}</DialogTitle>
        <DialogDescription>
          {formatPrice(selectedAmount || 0)}
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col items-center py-8 space-y-4">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">
          {t('redirectingToPayment')}
        </p>
      </div>

      <DialogFooter>
        <Button variant="outline" disabled>
          {tCommon('cancel')}
        </Button>
      </DialogFooter>
    </>
  )

  // Render success step
  const renderSuccess = () => (
    <>
      <DialogHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
          <CheckCircle2 className="h-10 w-10 text-green-600 dark:text-green-400" />
        </div>
        <DialogTitle>{t('topUpSuccess')}</DialogTitle>
        <DialogDescription>
          {t('topUpSuccessDesc', { amount: formatPrice(selectedAmount || 0) })}
        </DialogDescription>
      </DialogHeader>

      <DialogFooter>
        <Button onClick={handleSuccessClose} className="w-full">
          {tCommon('done')}
        </Button>
      </DialogFooter>
    </>
  )

  // Render error step
  const renderError = () => (
    <>
      <DialogHeader className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
          <XCircle className="h-10 w-10 text-red-600 dark:text-red-400" />
        </div>
        <DialogTitle>{t('topUpFailed')}</DialogTitle>
        <DialogDescription>{error || t('failedToCreateTopUp')}</DialogDescription>
      </DialogHeader>

      <DialogFooter className="gap-2 sm:gap-0">
        <Button variant="outline" onClick={handleClose}>
          {tCommon('close')}
        </Button>
        <Button onClick={handleRetry}>{t('tryAgain')}</Button>
      </DialogFooter>
    </>
  )

  // Render content based on step
  const renderContent = () => {
    switch (step) {
      case 'select':
        return renderSelect()
      case 'loading':
        return renderLoading()
      case 'success':
        return renderSuccess()
      case 'error':
        return renderError()
      default:
        return renderSelect()
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md">{renderContent()}</DialogContent>
    </Dialog>
  )
}
