"use client"

/**
 * Affiliate Dashboard Page
 * Shows affiliate registration CTA for non-affiliates, or dashboard with stats/referrals for affiliates
 */
import { useState } from "react"
import {
  IconCopy,
  IconUsers,
  IconCash,
  IconClock,
  IconCheck,
  IconGift,
  IconPercentage,
  IconWallet,
} from "@tabler/icons-react"
import { AlertCircle } from "lucide-react"
import { useTranslations, useLocale } from "next-intl"
import {
  useAffiliateStatus,
  useAffiliateReferrals,
  useAffiliateEarnings,
  useRegisterAffiliate,
} from "@/hooks/use-affiliate"
import { useToast } from "@/hooks/use-toast"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { RoleGuard } from "@/components/auth/role-guard"
import { Header } from "@/components/layout/header"

// Format currency to Indonesian Rupiah
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)
}

// Format date to Indonesian locale
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
}

// Commission status badge variants
const statusVariants: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  PENDING: "secondary",
  CREDITED: "default",
  CANCELLED: "destructive",
}

export default function AffiliatePage() {
  const t = useTranslations("affiliate")
  const tCommon = useTranslations("common")
  const locale = useLocale()
  const { toast } = useToast()
  const [linkCopied, setLinkCopied] = useState(false)

  // Fetch affiliate data
  const {
    data: statusData,
    isLoading: statusLoading,
    error: statusError,
  } = useAffiliateStatus()
  const { data: referralsData, isLoading: referralsLoading } =
    useAffiliateReferrals(1, 10)
  const { data: earningsData, isLoading: earningsLoading } =
    useAffiliateEarnings(1, 10)

  // Register mutation
  const registerMutation = useRegisterAffiliate()

  // Build referral link with locale
  const referralLink = statusData?.affiliate?.referralCode
    ? `${window.location.origin}/${locale}/ref/${statusData.affiliate.referralCode}`
    : null

  const handleRegister = async () => {
    try {
      await registerMutation.mutateAsync()
      toast({
        title: t("notAffiliate.registerSuccess"),
      })
    } catch (error) {
      toast({
        variant: "destructive",
        title: t("notAffiliate.registerError"),
        description: error instanceof Error ? error.message : "Unknown error",
      })
    }
  }

  const handleCopyLink = async () => {
    if (!referralLink) return

    try {
      await navigator.clipboard.writeText(referralLink)
      setLinkCopied(true)
      toast({
        title: t("dashboard.linkCopied"),
      })
      setTimeout(() => setLinkCopied(false), 2000)
    } catch (error) {
      toast({
        variant: "destructive",
        title: tCommon("error"),
        description: "Failed to copy link",
      })
    }
  }

  // Loading state
  if (statusLoading) {
    return (
      <RoleGuard>
        <Header />
        <div className="space-y-6 p-4 sm:p-6 lg:p-8">
          <div className="flex flex-col gap-1">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-48 w-full" />
        </div>
      </RoleGuard>
    )
  }

  // Error state
  if (statusError) {
    return (
      <RoleGuard>
        <Header />
        <div className="p-4 sm:p-6 lg:p-8">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{tCommon("error")}</AlertTitle>
            <AlertDescription>{t("error")}</AlertDescription>
          </Alert>
        </div>
      </RoleGuard>
    )
  }

  // Not an affiliate - show registration CTA
  if (!statusData?.isAffiliate) {
    return (
      <RoleGuard>
        <Header />
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-2xl">
            <Card>
              <CardHeader className="text-center">
                <IconGift className="text-primary mx-auto mb-4 h-12 w-12" />
                <CardTitle className="text-2xl">
                  {t("notAffiliate.title")}
                </CardTitle>
                <CardDescription className="text-base">
                  {t("notAffiliate.description")}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <h4 className="font-medium">
                    {t("notAffiliate.benefits.title")}
                  </h4>
                  <ul className="space-y-3">
                    <li className="flex items-center gap-3">
                      <IconPercentage className="h-5 w-5 text-green-600 dark:text-green-400" />
                      <span>{t("notAffiliate.benefits.commission")}</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <IconWallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      <span>{t("notAffiliate.benefits.instant")}</span>
                    </li>
                    <li className="flex items-center gap-3">
                      <IconCash className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                      <span>{t("notAffiliate.benefits.useForSubscription")}</span>
                    </li>
                  </ul>
                </div>
                <Button
                  className="w-full"
                  size="lg"
                  onClick={handleRegister}
                  disabled={registerMutation.isPending}
                >
                  {registerMutation.isPending
                    ? t("notAffiliate.registering")
                    : t("notAffiliate.registerButton")}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </RoleGuard>
    )
  }

  // User is an affiliate - show dashboard
  const affiliate = statusData.affiliate!
  const summary = earningsData?.summary

  return (
    <RoleGuard>
      <Header />
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Page Header */}
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
            {t("title")}
          </h1>
          <p className="text-muted-foreground text-sm sm:text-base">
            {t("subtitle")}
          </p>
        </div>

        {/* Referral Link Card */}
        <Card>
          <CardHeader>
            <CardTitle>{t("dashboard.referralLink")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="bg-muted/50 flex-1 rounded-lg border px-4 py-3">
                <code className="text-sm break-all">
                  {referralLink}
                </code>
              </div>
              <Button
                variant={linkCopied ? "default" : "outline"}
                onClick={handleCopyLink}
                className="shrink-0"
              >
                {linkCopied ? (
                  <>
                    <IconCheck className="mr-2 h-4 w-4" />
                    {t("dashboard.linkCopied")}
                  </>
                ) : (
                  <>
                    <IconCopy className="mr-2 h-4 w-4" />
                    {t("dashboard.copyLink")}
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <IconCash className="h-6 w-6 text-green-600 dark:text-green-400" />
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("dashboard.stats.totalEarned")}
                </p>
                <p className="text-2xl font-bold">
                  {earningsLoading ? (
                    <Skeleton className="h-8 w-28" />
                  ) : (
                    formatCurrency(summary?.totalEarnings || 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <IconClock className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("dashboard.stats.pending")}
                </p>
                <p className="text-2xl font-bold">
                  {earningsLoading ? (
                    <Skeleton className="h-8 w-28" />
                  ) : (
                    formatCurrency(summary?.pendingEarnings || 0)
                  )}
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="flex items-center gap-4 p-6">
              <IconUsers className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              <div>
                <p className="text-muted-foreground text-sm">
                  {t("dashboard.stats.referrals")}
                </p>
                <p className="text-2xl font-bold">
                  {earningsLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : (
                    summary?.totalReferrals || affiliate.totalReferrals || 0
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referrals Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconUsers className="h-5 w-5" />
              {t("referrals.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {referralsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="flex-1 space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : !referralsData?.referrals?.length ? (
              <div className="py-8 text-center">
                <IconUsers className="text-muted-foreground/50 mx-auto h-12 w-12" />
                <p className="mt-2 text-sm font-medium">
                  {t("referrals.empty")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("referrals.emptyDescription")}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("referrals.name")}</TableHead>
                      <TableHead>{t("referrals.email")}</TableHead>
                      <TableHead>{t("referrals.joinedAt")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {referralsData.referrals.map((referral) => (
                      <TableRow key={referral.id}>
                        <TableCell className="font-medium">
                          {referral.referredUser.name}
                        </TableCell>
                        <TableCell>{referral.referredUser.email}</TableCell>
                        <TableCell>{formatDate(referral.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Earnings History Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IconCash className="h-5 w-5" />
              {t("earnings.title")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {earningsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            ) : !earningsData?.commissions?.length ? (
              <div className="py-8 text-center">
                <IconCash className="text-muted-foreground/50 mx-auto h-12 w-12" />
                <p className="mt-2 text-sm font-medium">
                  {t("earnings.empty")}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t("earnings.emptyDescription")}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("earnings.type")}</TableHead>
                      <TableHead>{t("earnings.amount")}</TableHead>
                      <TableHead>{t("earnings.commission")}</TableHead>
                      <TableHead>{t("earnings.status")}</TableHead>
                      <TableHead>{t("earnings.date")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {earningsData.commissions.map((commission) => (
                      <TableRow key={commission.id}>
                        <TableCell>
                          <Badge variant="outline">
                            {t(`earnings.types.${commission.transactionType}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatCurrency(commission.transactionAmount)}
                        </TableCell>
                        <TableCell className="font-medium text-green-600 dark:text-green-400">
                          +{formatCurrency(commission.commissionAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              statusVariants[commission.status] || "default"
                            }
                          >
                            {t(`earnings.statuses.${commission.status}`)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {formatDate(commission.createdAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </RoleGuard>
  )
}
