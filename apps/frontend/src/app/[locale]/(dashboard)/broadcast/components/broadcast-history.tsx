"use client"

import React, { useEffect, useState, useCallback, useMemo } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Progress } from "@/components/ui/progress"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination"
import {
  IconCheck,
  IconX,
  IconAlertCircle,
  IconRefresh,
  IconHistory,
  IconTemplate,
  IconEye,
  IconBan,
  IconAlertTriangle,
  IconCreditCardOff,
  IconClockPause,
  IconUserOff,
  IconLockOff,
  IconShieldOff,
  IconBulb,
  IconSend,
  IconChecks,
  IconEyeCheck,
  IconFilter,
  IconDownload,
} from "@tabler/icons-react"
import { formatDistanceToNow, format } from "date-fns"
import { id, enUS } from "date-fns/locale"
import { useLocale } from "next-intl"
import {
  categorizeErrors,
  getSuccessRate,
  getEffectiveStatus,
  getErrorInfo,
  getCategoryRecoveryAction,
  ERROR_CATEGORY_INFO,
  type ErrorCategory,
  type ErrorSummary,
} from "../utils/error-categorizer"

interface BroadcastJob {
  id: string
  templateName: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
  totalRecipients: number
  successCount: number
  failedCount: number
  sentCount: number
  deliveredCount: number
  readCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

// Result item from API
interface ResultItem {
  phoneNumber: string
  success: boolean
  messageId?: string
  error?: string
  errorCode?: string
  status?: "sent" | "delivered" | "read" | "failed"
}

// CSV data row with phone number and variable values
interface CsvDataRow {
  phoneNumber: string
  [variableName: string]: string
}

// Merged result for export - combines result with CSV variable data
export interface MergedResultItem extends ResultItem {
  variables?: Record<string, string>
}

interface JobDetail extends BroadcastJob {
  results?: ResultItem[]
  csvData?: CsvDataRow[]
}

interface PaginationInfo {
  page: number
  limit: number
  total: number
  totalPages: number
}

// Filter status type for broadcast results
export type ResultFilterStatus = "all" | "sent" | "delivered" | "read" | "failed"


export function BroadcastHistory() {
  const t = useTranslations("broadcast")
  const tErrors = useTranslations("whatsappErrors")
  const locale = useLocale()
  const [jobs, setJobs] = useState<BroadcastJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pagination, setPagination] = useState<PaginationInfo>({
    page: 1,
    limit: 10,
    total: 0,
    totalPages: 0,
  })
  const [selectedJob, setSelectedJob] = useState<JobDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const dateLocale = locale === "id" ? id : enUS

  const loadJobs = useCallback(async (page: number = 1) => {
    try {
      setError(null)
      setLoading(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/broadcast/jobs?page=${page}&limit=10`,
        { credentials: "include" }
      )

      if (response.ok) {
        const result = await response.json()
        // Filter out PENDING and PROCESSING jobs (those are shown in Active Jobs)
        const historyJobs = (result.data || []).filter(
          (job: BroadcastJob) =>
            job.status === "COMPLETED" ||
            job.status === "FAILED" ||
            job.status === "CANCELLED"
        )
        setJobs(historyJobs)
        setPagination(result.pagination || {
          page: 1,
          limit: 10,
          total: historyJobs.length,
          totalPages: 1,
        })
      } else {
        setError("Failed to load history")
      }
    } catch (err) {
      console.error("Error loading history:", err)
      setError("Failed to load history")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadJobs()
  }, [loadJobs])

  const loadJobDetail = async (jobId: string) => {
    try {
      setLoadingDetail(true)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/broadcast/jobs/${jobId}`,
        { credentials: "include" }
      )

      if (response.ok) {
        const result = await response.json()
        setSelectedJob(result.data)
      }
    } catch (err) {
      console.error("Error loading job detail:", err)
    } finally {
      setLoadingDetail(false)
    }
  }

  const handlePageChange = (page: number) => {
    loadJobs(page)
  }

  // Get category icon component
  const getCategoryIcon = (category: ErrorCategory) => {
    switch (category) {
      case 'PAYMENT':
        return <IconCreditCardOff className="h-4 w-4" />
      case 'RATE_LIMIT':
        return <IconClockPause className="h-4 w-4" />
      case 'TEMPLATE':
        return <IconTemplate className="h-4 w-4" />
      case 'RECIPIENT':
        return <IconUserOff className="h-4 w-4" />
      case 'AUTHORIZATION':
        return <IconLockOff className="h-4 w-4" />
      case 'INTEGRITY':
        return <IconShieldOff className="h-4 w-4" />
      default:
        return <IconAlertCircle className="h-4 w-4" />
    }
  }

  const getStatusBadge = (job: BroadcastJob) => {
    const effectiveStatus = getEffectiveStatus(
      job.status,
      job.successCount,
      job.failedCount,
      job.totalRecipients
    )

    switch (effectiveStatus) {
      case "SUCCESS":
        return (
          <Badge variant="default" className="gap-1 bg-green-500">
            <IconCheck className="h-3 w-3" />
            {t("status.completed")}
          </Badge>
        )
      case "PARTIAL":
        return (
          <Badge variant="default" className="gap-1 bg-amber-500">
            <IconAlertTriangle className="h-3 w-3" />
            {t("status.partialSuccess")}
          </Badge>
        )
      case "MOSTLY_FAILED":
        return (
          <Badge variant="destructive" className="gap-1 bg-orange-500">
            <IconAlertTriangle className="h-3 w-3" />
            {t("status.mostlyFailed")}
          </Badge>
        )
      case "FAILED":
        return (
          <Badge variant="destructive" className="gap-1">
            <IconX className="h-3 w-3" />
            {t("status.failed")}
          </Badge>
        )
      case "CANCELLED":
        return (
          <Badge variant="secondary" className="gap-1">
            <IconBan className="h-3 w-3" />
            {t("status.cancelled")}
          </Badge>
        )
      default:
        return <Badge variant="outline">{job.status}</Badge>
    }
  }


  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-4 w-48" />
                </div>
                <Skeleton className="h-8 w-24" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <IconAlertCircle className="mb-2 h-8 w-8 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-4 gap-2"
          onClick={() => loadJobs()}
        >
          <IconRefresh className="h-4 w-4" />
          {t("customerSelector.retry")}
        </Button>
      </div>
    )
  }

  if (jobs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <IconHistory className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t("history.noHistory")}</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {jobs.map((job) => (
          <Card
            key={job.id}
            className="cursor-pointer transition-shadow hover:shadow-md"
            onClick={() => loadJobDetail(job.id)}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <IconTemplate className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{job.templateName}</span>
                    {getStatusBadge(job)}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      {t("jobCard.recipients")}: {job.totalRecipients}
                    </span>
                    <span className="text-green-600">
                      {t("jobCard.sent")}: {job.sentCount ?? job.successCount}
                    </span>
                    <span className="text-blue-600">
                      {t("jobCard.delivered")}: {job.deliveredCount ?? 0}
                    </span>
                    <span className="text-purple-600">
                      {t("jobCard.read")}: {job.readCount ?? 0}
                    </span>
                    <span className="text-destructive">
                      {t("jobCard.failed")}: {job.failedCount}
                    </span>
                    {job.totalRecipients > 0 && (
                      <span className="text-xs">
                        ({getSuccessRate(job.successCount, job.totalRecipients)}% {t("jobCard.successRate")})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {job.completedAt
                      ? format(new Date(job.completedAt), "PPp", { locale: dateLocale })
                      : formatDistanceToNow(new Date(job.createdAt), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                  </p>
                </div>
                <Button variant="ghost" size="sm" className="gap-1">
                  <IconEye className="h-4 w-4" />
                  {t("jobCard.viewDetails")}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <Pagination className="mt-4">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  onClick={() => handlePageChange(pagination.page - 1)}
                  className={
                    pagination.page <= 1
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                .filter(
                  (page) =>
                    page === 1 ||
                    page === pagination.totalPages ||
                    Math.abs(page - pagination.page) <= 1
                )
                .map((page, index, arr) => (
                  <PaginationItem key={page}>
                    {index > 0 && arr[index - 1] !== page - 1 && (
                      <span className="px-2">...</span>
                    )}
                    <PaginationLink
                      onClick={() => handlePageChange(page)}
                      isActive={page === pagination.page}
                      className="cursor-pointer"
                    >
                      {page}
                    </PaginationLink>
                  </PaginationItem>
                ))}
              <PaginationItem>
                <PaginationNext
                  onClick={() => handlePageChange(pagination.page + 1)}
                  className={
                    pagination.page >= pagination.totalPages
                      ? "pointer-events-none opacity-50"
                      : "cursor-pointer"
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        )}
      </div>


      {/* Job Detail Dialog */}
      <Dialog open={!!selectedJob} onOpenChange={() => setSelectedJob(null)}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconTemplate className="h-5 w-5" />
              {selectedJob?.templateName}
            </DialogTitle>
            <DialogDescription>
              {selectedJob?.completedAt &&
                format(new Date(selectedJob.completedAt), "PPpp", {
                  locale: dateLocale,
                })}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="space-y-4 py-4">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : selectedJob ? (
            <JobDetailContent
              job={selectedJob}
              t={t}
              tErrors={tErrors}
              getCategoryIcon={getCategoryIcon}
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

// Separate component for job detail content with error summary
function JobDetailContent({
  job,
  t,
  tErrors,
  getCategoryIcon,
}: {
  job: JobDetail
  t: (key: string, values?: Record<string, any>) => string
  tErrors: (key: string, values?: Record<string, any>) => string
  getCategoryIcon: (category: ErrorCategory) => React.ReactNode
}) {
  // Filter state for detailed results
  const [filterStatus, setFilterStatus] = useState<ResultFilterStatus>("all")

  // Categorize errors
  const errorSummary = useMemo(() => {
    if (!job.results) return null
    return categorizeErrors(job.results)
  }, [job.results])

  // Filter results based on selected status
  const filteredResults = useMemo((): ResultItem[] => {
    if (!job.results) return []

    if (filterStatus === "all") {
      return job.results
    }

    if (filterStatus === "failed") {
      // Include both API call failures and webhook failures
      return job.results.filter((result) => !result.success || result.status === 'failed')
    }

    // For sent/delivered/read: filter where success === true AND status matches
    return job.results.filter(
      (result) => result.success && result.status === filterStatus
    )
  }, [job.results, filterStatus])

  // Merge filtered results with csvData to get variable values
  const mergedResults = useMemo((): MergedResultItem[] => {
    if (!filteredResults.length) return []

    // Create a map of csvData by phoneNumber for quick lookup
    const csvMap = new Map<string, Record<string, string>>()
    if (job.csvData) {
      job.csvData.forEach((row) => {
        const { phoneNumber, ...variables } = row
        csvMap.set(phoneNumber, variables)
      })
    }

    // Merge results with CSV data
    return filteredResults.map((result) => ({
      ...result,
      variables: csvMap.get(result.phoneNumber),
    }))
  }, [filteredResults, job.csvData])

  // Get unique variable column names from csvData (excluding phoneNumber)
  const variableColumns = useMemo(() => {
    if (!job.csvData || job.csvData.length === 0) return []
    const firstRow = job.csvData[0]
    return Object.keys(firstRow).filter((key) => key !== "phoneNumber")
  }, [job.csvData])

  // Generate and download CSV file
  const generateCSV = () => {
    const headers = ["phoneNumber", ...variableColumns]

    // Escape CSV values that contain commas, quotes, or newlines
    const escapeCSV = (value: string) => {
      if (value.includes(",") || value.includes('"') || value.includes("\n")) {
        return `"${value.replace(/"/g, '""')}"`
      }
      return value
    }

    const csvContent = [
      headers.join(","),
      ...mergedResults.map((row) =>
        headers
          .map((h) =>
            escapeCSV(
              h === "phoneNumber"
                ? row.phoneNumber
                : row.variables?.[h] || ""
            )
          )
          .join(",")
      ),
    ].join("\n")

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `broadcast_${job.templateName}_${filterStatus}_${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const successRate = getSuccessRate(job.successCount, job.totalRecipients)

  return (
    <div className="space-y-4 py-4">
      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span>{t("jobDetail.deliveryRate")}</span>
          <span className={successRate >= 80 ? "text-green-600" : successRate >= 50 ? "text-amber-600" : "text-destructive"}>
            {successRate}%
          </span>
        </div>
        <Progress
          value={successRate}
          className={`h-2 ${
            successRate >= 80
              ? "[&>div]:bg-green-500"
              : successRate >= 50
              ? "[&>div]:bg-amber-500"
              : "[&>div]:bg-destructive"
          }`}
        />
      </div>

      {/* Summary Cards - 5 cards */}
      <div className="grid grid-cols-5 gap-3">
        <Card className="border-gray-200 dark:border-gray-700">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-gray-700 dark:text-gray-300">
              {job.totalRecipients}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("jobCard.recipients")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-green-600">
              {job.sentCount ?? job.successCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("jobCard.sent")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-blue-200 dark:border-blue-800">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-blue-600">
              {job.deliveredCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("jobCard.delivered")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-purple-200 dark:border-purple-800">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-purple-600">
              {job.readCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("jobCard.read")}
            </p>
          </CardContent>
        </Card>
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-3 text-center">
            <p className="text-xl font-bold text-destructive">
              {job.failedCount}
            </p>
            <p className="text-xs text-muted-foreground">
              {t("jobCard.failed")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Error Summary - Critical Issues Alert */}
      {errorSummary && errorSummary.hasCriticalErrors && (
        <Alert variant="destructive">
          <IconAlertTriangle className="h-4 w-4" />
          <AlertTitle>{t("jobDetail.criticalIssues")}</AlertTitle>
          <AlertDescription>
            {errorSummary.primaryIssue === 'PAYMENT' && t("jobDetail.paymentIssueDesc")}
            {errorSummary.primaryIssue === 'TEMPLATE' && t("jobDetail.templateIssueDesc")}
            {errorSummary.primaryIssue === 'AUTHORIZATION' && t("jobDetail.authIssueDesc")}
            {errorSummary.primaryIssue === 'INTEGRITY' && t("jobDetail.integrityIssueDesc")}
          </AlertDescription>
        </Alert>
      )}

      {/* Error Categories Summary */}
      {errorSummary && errorSummary.categories.length > 0 && (
        <div className="space-y-3">
          <h4 className="font-medium">{t("jobDetail.errorSummary")}</h4>
          <div className="space-y-2">
            {errorSummary.categories.map((cat) => {
              const info = ERROR_CATEGORY_INFO[cat.category]
              const recoveryAction = getCategoryRecoveryAction(cat.category, t)
              return (
                <div
                  key={cat.category}
                  className={`rounded-lg border p-3 ${
                    info.severity === 'critical'
                      ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30'
                      : info.severity === 'warning'
                      ? 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30'
                      : 'border-gray-200 bg-gray-50 dark:border-gray-800 dark:bg-gray-900/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`${
                        info.severity === 'critical'
                          ? 'text-red-600'
                          : info.severity === 'warning'
                          ? 'text-amber-600'
                          : 'text-gray-600'
                      }`}>
                        {getCategoryIcon(cat.category)}
                      </div>
                      <div>
                        <p className="font-medium text-sm">
                          {t(`errors.categories.${cat.category.toLowerCase()}`)}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {t(`errors.categories.${cat.category.toLowerCase()}Desc`)}
                        </p>
                      </div>
                    </div>
                    <Badge variant={info.severity === 'critical' ? 'destructive' : 'secondary'}>
                      {cat.count} {t("jobDetail.recipients")}
                    </Badge>
                  </div>
                  {/* Recovery Action */}
                  <div className="mt-2 flex items-start gap-2 rounded-md bg-white/50 dark:bg-black/20 p-2">
                    <IconBulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{t("jobDetail.recoveryAction")}:</span>{" "}
                      {recoveryAction}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Detailed Results List */}
      {job.results && job.results.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium flex items-center gap-2">
              <IconFilter className="h-4 w-4 text-muted-foreground" />
              {t("jobDetail.detailedResults")}
            </h4>
          </div>

          {/* Filter Tabs */}
          <Tabs
            value={filterStatus}
            onValueChange={(value) => setFilterStatus(value as ResultFilterStatus)}
            className="w-full"
          >
            <TabsList className="w-full grid grid-cols-5 h-auto p-1">
              <TabsTrigger
                value="all"
                className="text-xs px-2 py-1.5 data-[state=active]:bg-background"
              >
                {t("jobDetail.filter.all")}
              </TabsTrigger>
              <TabsTrigger
                value="sent"
                className="text-xs px-2 py-1.5 gap-1 data-[state=active]:bg-green-100 data-[state=active]:text-green-700 dark:data-[state=active]:bg-green-950 dark:data-[state=active]:text-green-400"
              >
                <IconSend className="h-3 w-3" />
                {t("jobDetail.sent")}
              </TabsTrigger>
              <TabsTrigger
                value="delivered"
                className="text-xs px-2 py-1.5 gap-1 data-[state=active]:bg-blue-100 data-[state=active]:text-blue-700 dark:data-[state=active]:bg-blue-950 dark:data-[state=active]:text-blue-400"
              >
                <IconChecks className="h-3 w-3" />
                {t("jobDetail.delivered")}
              </TabsTrigger>
              <TabsTrigger
                value="read"
                className="text-xs px-2 py-1.5 gap-1 data-[state=active]:bg-purple-100 data-[state=active]:text-purple-700 dark:data-[state=active]:bg-purple-950 dark:data-[state=active]:text-purple-400"
              >
                <IconEyeCheck className="h-3 w-3" />
                {t("jobDetail.read")}
              </TabsTrigger>
              <TabsTrigger
                value="failed"
                className="text-xs px-2 py-1.5 gap-1 data-[state=active]:bg-red-100 data-[state=active]:text-red-700 dark:data-[state=active]:bg-red-950 dark:data-[state=active]:text-red-400"
              >
                <IconX className="h-3 w-3" />
                {t("jobDetail.failedBadge")}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {/* Export CSV Button */}
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={generateCSV}
              disabled={mergedResults.length === 0}
            >
              <IconDownload className="h-4 w-4" />
              {t("jobDetail.exportCSV", {
                filter:
                  filterStatus === "all"
                    ? t("jobDetail.filter.all")
                    : filterStatus === "sent"
                    ? t("jobDetail.sent")
                    : filterStatus === "delivered"
                    ? t("jobDetail.delivered")
                    : filterStatus === "read"
                    ? t("jobDetail.read")
                    : t("jobDetail.failedBadge"),
                count: mergedResults.length,
              })}
            </Button>
          </div>

          <div className="max-h-60 space-y-2 overflow-y-auto rounded-md border p-2">
            {filteredResults.length === 0 ? (
              // Empty state when filter has no results
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <IconFilter className="mb-2 h-6 w-6 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  {t("jobDetail.noResultsForFilter")}
                </p>
              </div>
            ) : (
              filteredResults.map((result, index) => {
                // Check if this result is failed (either at API call or via webhook)
                const isFailed = !result.success || result.status === 'failed'
                
                // Get structured error info for failed results
                const errorInfo = isFailed && result.error
                  ? getErrorInfo(result.error, result.errorCode, tErrors)
                  : null

                // Determine the display status and badge color
                const getStatusBadge = () => {
                  if (isFailed) {
                    return (
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="destructive" className="bg-red-500">
                          <IconX className="mr-1 h-3 w-3" />
                          {t("jobDetail.failedBadge")}
                        </Badge>
                      </div>
                    )
                  }

                  // Success case - show status-based badge
                  const status = result.status || "sent"
                  switch (status) {
                    case "read":
                      return (
                        <Badge variant="default" className="bg-purple-500">
                          <IconCheck className="mr-1 h-3 w-3" />
                          {t("jobDetail.read")}
                        </Badge>
                      )
                    case "delivered":
                      return (
                        <Badge variant="default" className="bg-blue-500">
                          <IconCheck className="mr-1 h-3 w-3" />
                          {t("jobDetail.delivered")}
                        </Badge>
                      )
                    case "sent":
                    default:
                      return (
                        <Badge variant="default" className="bg-green-500">
                          <IconCheck className="mr-1 h-3 w-3" />
                          {t("jobDetail.sent")}
                        </Badge>
                      )
                  }
                }

                return (
                  <div
                    key={index}
                    className={`rounded-md bg-muted/50 p-2 text-sm ${
                      errorInfo ? 'space-y-2' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono">{result.phoneNumber}</span>
                      {getStatusBadge()}
                    </div>
                    {/* Structured error display for failed results */}
                    {errorInfo && (
                      <div className="rounded-md bg-red-50 dark:bg-red-950/30 p-2 space-y-1">
                        <div className="flex items-center gap-2">
                          {errorInfo.code && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 font-mono">
                              {errorInfo.code}
                            </Badge>
                          )}
                          <span className="text-xs text-red-700 dark:text-red-400">
                            {errorInfo.message}
                          </span>
                        </div>
                        <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
                          <IconBulb className="h-3 w-3 text-amber-500 flex-shrink-0 mt-0.5" />
                          <span>{errorInfo.recoveryAction}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default BroadcastHistory
