"use client"

import { useEffect, useState, useCallback } from "react"
import { useTranslations } from "next-intl"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  IconPlayerPlay,
  IconClock,
  IconX,
  IconRefresh,
  IconAlertCircle,
  IconTemplate,
  IconAlertTriangle,
  IconCheck,
  IconLoader2,
} from "@tabler/icons-react"
import { formatDistanceToNow } from "date-fns"
import { id, enUS } from "date-fns/locale"
import { useLocale } from "next-intl"
import { useToast } from "@/hooks/use-toast"

interface BroadcastJob {
  id: string
  templateName: string
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED" | "CANCELLED"
  totalRecipients: number
  successCount: number
  failedCount: number
  createdAt: string
  updatedAt: string
  completedAt: string | null
}

interface RecipientResult {
  phoneNumber: string
  success: boolean
  messageId?: string
  error?: string
  status?: string
}

interface JobDetail {
  id: string
  templateName: string
  totalRecipients: number
  successCount: number
  failedCount: number
  csvData: Array<{ phoneNumber: string; [key: string]: string }>
  results: RecipientResult[] | null
}

interface ActiveJobsProps {
  onJobClick?: (jobId: string) => void
}

// Time in ms to consider a job as stuck (no progress for 2 minutes)
const STUCK_THRESHOLD_MS = 2 * 60 * 1000

export function ActiveJobs({ onJobClick }: ActiveJobsProps) {
  const t = useTranslations("broadcast")
  const locale = useLocale()
  const { toast } = useToast()
  const [jobs, setJobs] = useState<BroadcastJob[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)
  const [resumingJobId, setResumingJobId] = useState<string | null>(null)
  const [jobToCancel, setJobToCancel] = useState<BroadcastJob | null>(null)
  const [jobToResume, setJobToResume] = useState<BroadcastJob | null>(null)
  const [jobDetail, setJobDetail] = useState<JobDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const dateLocale = locale === "id" ? id : enUS
  
  // Check if a job is stuck based on updatedAt timestamp
  // A job is stuck if it's PROCESSING but hasn't been updated in 2+ minutes
  const isJobStuck = useCallback((job: BroadcastJob): boolean => {
    if (job.status !== "PROCESSING") return false
    
    // Check if updatedAt is older than threshold
    const updatedAt = new Date(job.updatedAt).getTime()
    const timeSinceUpdate = Date.now() - updatedAt
    
    return timeSinceUpdate > STUCK_THRESHOLD_MS
  }, [])


  const loadJobs = useCallback(async () => {
    try {
      setError(null)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/broadcast/jobs?status=PENDING&status=PROCESSING`,
        { credentials: "include" }
      )

      if (response.ok) {
        const result = await response.json()
        // Filter only PENDING and PROCESSING jobs
        const activeJobs = (result.data || []).filter(
          (job: BroadcastJob) => job.status === "PENDING" || job.status === "PROCESSING"
        )
        setJobs(activeJobs)
      } else {
        setError("Failed to load jobs")
      }
    } catch (err) {
      console.error("Error loading jobs:", err)
      setError("Failed to load jobs")
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial load and polling for real-time updates
  useEffect(() => {
    loadJobs()
    
    // Poll every 3 seconds for real-time progress
    const interval = setInterval(loadJobs, 3000)
    
    return () => clearInterval(interval)
  }, [loadJobs])

  const handleCancelJob = async (job: BroadcastJob) => {
    setJobToCancel(job)
  }

  const confirmCancelJob = async () => {
    if (!jobToCancel) return

    try {
      setCancellingJobId(jobToCancel.id)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/broadcast/jobs/${jobToCancel.id}/cancel`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      if (response.ok) {
        // Refresh jobs list
        await loadJobs()
      } else {
        const result = await response.json()
        setError(result.error?.message || "Failed to cancel job")
      }
    } catch (err) {
      console.error("Error cancelling job:", err)
      setError("Failed to cancel job")
    } finally {
      setCancellingJobId(null)
      setJobToCancel(null)
    }
  }

  // Open resume dialog and fetch job details
  const handleResumeJob = async (job: BroadcastJob) => {
    setJobToResume(job)
    setLoadingDetail(true)
    setJobDetail(null)
    
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/broadcast/jobs/${job.id}`,
        { credentials: "include" }
      )

      if (response.ok) {
        const result = await response.json()
        setJobDetail(result.data)
      }
    } catch (err) {
      console.error("Error fetching job details:", err)
    } finally {
      setLoadingDetail(false)
    }
  }

  // Confirm and execute resume
  const confirmResumeJob = async () => {
    if (!jobToResume) return

    try {
      setResumingJobId(jobToResume.id)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3005"
      const response = await fetch(
        `${apiUrl}/api/v1/broadcast/jobs/${jobToResume.id}/resume`,
        {
          method: "POST",
          credentials: "include",
        }
      )

      const result = await response.json()

      if (response.ok) {
        toast({
          title: t("jobCard.resumeSuccess") || "Broadcast resumed",
          description: t("jobCard.resumeSuccessDesc") || "The broadcast will continue shortly",
        })
        
        // Refresh jobs list
        await loadJobs()
      } else {
        toast({
          title: t("jobCard.resumeFailed") || "Resume failed",
          description: result.error?.message || "Failed to resume broadcast",
          variant: "destructive",
        })
      }
    } catch (err) {
      console.error("Error resuming job:", err)
      toast({
        title: t("jobCard.resumeFailed") || "Resume failed",
        description: "Failed to resume broadcast",
        variant: "destructive",
      })
    } finally {
      setResumingJobId(null)
      setJobToResume(null)
      setJobDetail(null)
    }
  }

  const getProgressPercentage = (job: BroadcastJob) => {
    if (job.totalRecipients === 0) return 0
    const processed = job.successCount + job.failedCount
    return Math.round((processed / job.totalRecipients) * 100)
  }

  const getStatusBadge = (job: BroadcastJob, isStuck: boolean) => {
    if (isStuck) {
      return (
        <Badge variant="destructive" className="gap-1 bg-amber-500">
          <IconAlertTriangle className="h-3 w-3" />
          {t("status.stuck") || "Stuck"}
        </Badge>
      )
    }
    
    switch (job.status) {
      case "PENDING":
        return (
          <Badge variant="secondary" className="gap-1">
            <IconClock className="h-3 w-3" />
            {t("status.pending")}
          </Badge>
        )
      case "PROCESSING":
        return (
          <Badge variant="default" className="gap-1 bg-blue-500">
            <IconPlayerPlay className="h-3 w-3" />
            {t("status.processing")}
          </Badge>
        )
      default:
        return <Badge variant="outline">{job.status}</Badge>
    }
  }


  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2].map((i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-5 w-20" />
                </div>
                <Skeleton className="h-2 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                </div>
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
          onClick={() => {
            setLoading(true)
            loadJobs()
          }}
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
        <IconPlayerPlay className="mb-4 h-12 w-12 text-muted-foreground" />
        <p className="text-muted-foreground">{t("activeJobs.noJobs")}</p>
      </div>
    )
  }

  return (
    <>
      <div className="space-y-4">
        {jobs.map((job) => {
          const progress = getProgressPercentage(job)
          const processed = job.successCount + job.failedCount
          const stuck = isJobStuck(job)

          return (
            <Card
              key={job.id}
              className={`cursor-pointer transition-shadow hover:shadow-md ${stuck ? "border-amber-500 border-2" : ""}`}
              onClick={() => onJobClick?.(job.id)}
            >
              <CardContent className="p-4">
                <div className="space-y-3">
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <IconTemplate className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{job.templateName}</span>
                    </div>
                    {getStatusBadge(job, stuck)}
                  </div>

                  {/* Stuck Warning */}
                  {stuck && (
                    <div className="flex items-center gap-2 rounded-md bg-amber-50 p-2 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">
                      <IconAlertTriangle className="h-4 w-4" />
                      <span>{t("jobCard.stuckWarning") || "Broadcast terhenti. Klik Resume untuk melanjutkan."}</span>
                    </div>
                  )}

                  {/* Progress Bar */}
                  <div className="space-y-1">
                    <Progress value={progress} className={`h-2 ${stuck ? "[&>div]:bg-amber-500" : ""}`} />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>
                        {t("jobCard.progress")}: {progress}%
                      </span>
                      <span>
                        {processed} / {job.totalRecipients}
                      </span>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex gap-4">
                      <span className="text-muted-foreground">
                        {t("jobCard.recipients")}: {job.totalRecipients}
                      </span>
                      {job.successCount > 0 && (
                        <span className="text-green-600">
                          {t("jobCard.success")}: {job.successCount}
                        </span>
                      )}
                      {job.failedCount > 0 && (
                        <span className="text-destructive">
                          {t("jobCard.failed")}: {job.failedCount}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(job.createdAt), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 pt-2">
                    {/* Resume button - only show for stuck jobs */}
                    {stuck && (
                      <Button
                        variant="default"
                        size="sm"
                        className="gap-1 bg-amber-500 hover:bg-amber-600"
                        disabled={resumingJobId === job.id}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleResumeJob(job)
                        }}
                      >
                        <IconRefresh className="h-4 w-4" />
                        {resumingJobId === job.id
                          ? "..."
                          : t("jobCard.resume") || "Resume"}
                      </Button>
                    )}
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                      disabled={cancellingJobId === job.id}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleCancelJob(job)
                      }}
                    >
                      <IconX className="h-4 w-4" />
                      {cancellingJobId === job.id
                        ? "..."
                        : t("jobCard.cancelJob")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Cancel Confirmation Dialog */}
      <AlertDialog open={!!jobToCancel} onOpenChange={() => setJobToCancel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("jobCard.cancelJob")}?</AlertDialogTitle>
            <AlertDialogDescription>
              {jobToCancel?.templateName}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("form.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmCancelJob}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t("jobCard.cancelJob")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Resume Dialog with recipient details */}
      <Dialog open={!!jobToResume} onOpenChange={() => {
        setJobToResume(null)
        setJobDetail(null)
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconRefresh className="h-5 w-5 text-amber-500" />
              {t("jobCard.resumeTitle") || "Resume Broadcast"}
            </DialogTitle>
            <DialogDescription>
              {jobToResume?.templateName}
            </DialogDescription>
          </DialogHeader>

          {loadingDetail ? (
            <div className="flex items-center justify-center py-8">
              <IconLoader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : jobDetail ? (
            <div className="space-y-4">
              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 rounded-lg bg-muted p-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{jobDetail.totalRecipients}</div>
                  <div className="text-xs text-muted-foreground">
                    {t("jobCard.totalRecipients") || "Total"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {jobDetail.results?.length || 0}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("jobCard.sent") || "Terkirim"}
                  </div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-amber-600">
                    {jobDetail.totalRecipients - (jobDetail.results?.length || 0)}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {t("jobCard.pending") || "Belum Terkirim"}
                  </div>
                </div>
              </div>

              {/* Recipients lists */}
              <div className="grid grid-cols-2 gap-4">
                {/* Sent recipients */}
                <div>
                  <h4 className="mb-2 flex items-center gap-1 text-sm font-medium text-green-600">
                    <IconCheck className="h-4 w-4" />
                    {t("jobCard.sentRecipients") || "Sudah Terkirim"} ({jobDetail.results?.length || 0})
                  </h4>
                  <ScrollArea className="h-48 rounded-md border p-2">
                    {jobDetail.results && jobDetail.results.length > 0 ? (
                      <div className="space-y-1">
                        {jobDetail.results.map((result, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between rounded px-2 py-1 text-xs ${
                              result.success 
                                ? "bg-green-50 dark:bg-green-950" 
                                : "bg-red-50 dark:bg-red-950"
                            }`}
                          >
                            <span className="font-mono">{result.phoneNumber}</span>
                            {result.success ? (
                              <IconCheck className="h-3 w-3 text-green-600" />
                            ) : (
                              <span className="text-red-600" title={result.error}>✗</span>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {t("jobCard.noSentYet") || "Belum ada yang terkirim"}
                      </div>
                    )}
                  </ScrollArea>
                </div>

                {/* Pending recipients */}
                <div>
                  <h4 className="mb-2 flex items-center gap-1 text-sm font-medium text-amber-600">
                    <IconClock className="h-4 w-4" />
                    {t("jobCard.pendingRecipients") || "Belum Terkirim"} (
                    {jobDetail.totalRecipients - (jobDetail.results?.length || 0)})
                  </h4>
                  <ScrollArea className="h-48 rounded-md border p-2">
                    {(() => {
                      const sentPhones = new Set(
                        jobDetail.results?.map((r) => r.phoneNumber) || []
                      )
                      const pendingRecipients = jobDetail.csvData?.filter(
                        (row) => !sentPhones.has(row.phoneNumber)
                      ) || []

                      if (pendingRecipients.length === 0) {
                        return (
                          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                            {t("jobCard.allSent") || "Semua sudah terkirim"}
                          </div>
                        )
                      }

                      return (
                        <div className="space-y-1">
                          {pendingRecipients.map((row, idx) => (
                            <div
                              key={idx}
                              className="flex items-center justify-between rounded bg-amber-50 px-2 py-1 text-xs dark:bg-amber-950"
                            >
                              <span className="font-mono">{row.phoneNumber}</span>
                              <IconClock className="h-3 w-3 text-amber-600" />
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </ScrollArea>
                </div>
              </div>
            </div>
          ) : (
            <div className="py-4 text-center text-muted-foreground">
              {t("jobCard.failedLoadDetail") || "Gagal memuat detail broadcast"}
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setJobToResume(null)
                setJobDetail(null)
              }}
            >
              {t("form.cancel") || "Batal"}
            </Button>
            <Button
              className="gap-1 bg-amber-500 hover:bg-amber-600"
              disabled={resumingJobId === jobToResume?.id || !jobDetail}
              onClick={confirmResumeJob}
            >
              <IconRefresh className="h-4 w-4" />
              {resumingJobId === jobToResume?.id
                ? "..."
                : t("jobCard.resumeConfirm") || "Lanjutkan Broadcast"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default ActiveJobs
