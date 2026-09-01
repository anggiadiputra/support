'use client'

/**
 * Credit Balance Section
 *
 * Displays user's credit balance with a "Top Up" button.
 * Shows loading skeleton while fetching balance data.
 */

import { Wallet } from 'lucide-react'
import { useTranslations } from 'next-intl'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useCreditBalance } from '@/hooks/use-credit'

// Format price to IDR
function formatPrice(price: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

interface CreditBalanceSectionProps {
  onTopUpClick: () => void
}

export function CreditBalanceSection({ onTopUpClick }: CreditBalanceSectionProps) {
  const t = useTranslations('credit')
  const { data: balanceData, isLoading, error } = useCreditBalance()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Wallet className="h-5 w-5" />
          {t('creditBalance')}
        </CardTitle>
        <CardDescription>{t('creditBalanceDesc')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            {isLoading ? (
              <Skeleton className="h-8 w-32" />
            ) : error ? (
              <p className="text-sm text-destructive">{t('failedToLoadBalance')}</p>
            ) : (
              <p className="text-2xl font-bold text-primary">
                {formatPrice(balanceData?.balance ?? 0)}
              </p>
            )}
          </div>
          <Button onClick={onTopUpClick} disabled={isLoading}>
            {t('topUp')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
