"use client"

import {
  RefreshCw,
  Database,
  Server,
  Activity,
  Webhook,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Zap,
  Users,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { useAdminHealth, useFailedJobs, type SystemHealth } from "../hooks/use-admin-health"

function getStatusIcon(status: "healthy" | "unhealthy" | "degraded") {
  switch (status) {
    case "healthy":
      return <CheckCircle className="h-5 w-5 text-green-500" />
    case "degraded":
      return <AlertTriangle className="h-5 w-5 text-yellow-500" />
    case "unhealthy":
      return <XCircle className="h-5 w-5 text-red-500" />
  }
}

function getStatusBadge(status: "healthy" | "unhealthy" | "degraded") {
  switch (status) {
    case "healthy":
      return <Badge className="bg-green-100 text-green-800 border-green-200">Healthy</Badge>
    case "degraded":
      return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Degraded</Badge>
    case "unhealthy":
      return <Badge className="bg-red-100 text-red-800 border-red-200">Unhealthy</Badge>
  }
}

function OverallStatusCard({
  status,
  isLoading,
}: {
  status?: "healthy" | "degraded" | "unhealthy"
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Skeleton className="h-6 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-10 w-24" />
        </CardContent>
      </Card>
    )
  }

  const bgColor = status === "healthy"
    ? "bg-green-50 border-green-200"
    : status === "degraded"
    ? "bg-yellow-50 border-yellow-200"
    : "bg-red-50 border-red-200"

  return (
    <Card className={`col-span-full ${bgColor}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-lg font-semibold">System Status</CardTitle>
        {status && getStatusIcon(status)}
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold capitalize">{status}</span>
          {status && getStatusBadge(status)}
        </div>
      </CardContent>
    </Card>
  )
}


function HealthStatusCard({
  title,
  status,
  latencyMs,
  error,
  icon: Icon,
  isLoading,
}: {
  title: string
  status?: "healthy" | "unhealthy"
  latencyMs?: number
  error?: string
  icon: typeof Database
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-24" />
        </CardContent>
      </Card>
    )
  }

  const isHealthy = status === "healthy"

  return (
    <Card className={!isHealthy ? "border-red-200 bg-red-50" : ""}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${isHealthy ? "text-muted-foreground" : "text-red-500"}`} />
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 mb-1">
          {isHealthy ? (
            <CheckCircle className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-red-500" />
          )}
          <span className="text-lg font-semibold capitalize">{status}</span>
        </div>
        {latencyMs !== undefined && (
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            Latency: {latencyMs}ms
          </p>
        )}
        {error && (
          <p className="text-xs text-red-600 mt-1">{error}</p>
        )}
      </CardContent>
    </Card>
  )
}

function WebsocketCard({
  activeConnections,
  onlineUsers,
  isLoading,
}: {
  activeConnections?: number
  onlineUsers?: number
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-4" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-16 mb-2" />
          <Skeleton className="h-3 w-32" />
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">WebSocket</CardTitle>
        <Zap className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{activeConnections?.toLocaleString() || 0}</div>
        <p className="text-xs text-muted-foreground">Active connections</p>
        <div className="flex items-center gap-1 mt-2 text-xs text-muted-foreground">
          <Users className="h-3 w-3" />
          {onlineUsers?.toLocaleString() || 0} online users
        </div>
      </CardContent>
    </Card>
  )
}


function QueueMonitorCard({
  queue,
  isLoading,
}: {
  queue?: SystemHealth["queue"]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card className="col-span-full lg:col-span-2">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const totalJobs = (queue?.pending || 0) + (queue?.active || 0) + (queue?.completed || 0) + (queue?.failed || 0)
  const failedPercentage = totalJobs > 0 ? ((queue?.failed || 0) / totalJobs) * 100 : 0

  return (
    <Card className="col-span-full lg:col-span-2">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Queue Monitor
        </CardTitle>
        <CardDescription>BullMQ job statistics across all queues</CardDescription>
      </CardHeader>
      <CardContent>
        {/* Overall Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 mb-6">
          <div className="text-center p-3 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{queue?.pending || 0}</div>
            <div className="text-xs text-muted-foreground break-words">Pending</div>
          </div>
          <div className="text-center p-3 bg-yellow-50 rounded-lg">
            <div className="text-2xl font-bold text-yellow-600">{queue?.active || 0}</div>
            <div className="text-xs text-muted-foreground break-words">Active</div>
          </div>
          <div className="text-center p-3 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{queue?.completed || 0}</div>
            <div className="text-xs text-muted-foreground break-words">Completed</div>
          </div>
          <div className="text-center p-3 bg-red-50 rounded-lg">
            <div className="text-2xl font-bold text-red-600">{queue?.failed || 0}</div>
            <div className="text-xs text-muted-foreground break-words">Failed</div>
          </div>
          <div className="text-center p-3 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">{queue?.delayed || 0}</div>
            <div className="text-xs text-muted-foreground break-words">Delayed</div>
          </div>
        </div>

        {/* Failed Jobs Warning */}
        {(queue?.failed || 0) > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">Failed Jobs Rate</span>
              <span className="text-sm text-red-600">{failedPercentage.toFixed(1)}%</span>
            </div>
            <Progress value={failedPercentage} className="h-2" />
          </div>
        )}

        {/* Per-Queue Breakdown */}
        <div className="space-y-4">
          <h4 className="text-sm font-semibold">Queue Breakdown</h4>
          
          <QueueRow
            name="Webhook Inbound"
            stats={queue?.byQueue.webhook}
          />
          <QueueRow
            name="Message Processing"
            stats={queue?.byQueue.message}
          />
          <QueueRow
            name="Webhook Outbound"
            stats={queue?.byQueue.webhookOutbound}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function QueueRow({
  name,
  stats,
}: {
  name: string
  stats?: { pending: number; active: number; completed: number; failed: number }
}) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between p-3 bg-muted/50 rounded-lg">
      <span className="text-sm font-medium break-words">{name}</span>
      <div className="flex flex-wrap items-center gap-2 sm:gap-4 text-xs">
        <span className="text-blue-600">{stats?.pending || 0} pending</span>
        <span className="text-yellow-600">{stats?.active || 0} active</span>
        <span className="text-green-600">{stats?.completed || 0} done</span>
        <span className="text-red-600">{stats?.failed || 0} failed</span>
      </div>
    </div>
  )
}


function WebhookStatsCard({
  webhooks,
  isLoading,
}: {
  webhooks?: SystemHealth["webhooks"]
  isLoading?: boolean
}) {
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    )
  }

  const successRate = webhooks?.successRate24h || 0
  const isHealthy = successRate >= 95
  const isDegraded = successRate >= 80 && successRate < 95

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Webhook className="h-5 w-5" />
          Webhook Delivery
        </CardTitle>
        <CardDescription>Last 24 hours delivery statistics</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 mb-4">
          <div className="text-4xl font-bold">
            {successRate.toFixed(1)}%
          </div>
          <div>
            {isHealthy ? (
              <Badge className="bg-green-100 text-green-800 border-green-200">Healthy</Badge>
            ) : isDegraded ? (
              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200">Degraded</Badge>
            ) : (
              <Badge className="bg-red-100 text-red-800 border-red-200">Critical</Badge>
            )}
          </div>
        </div>

        <Progress
          value={successRate}
          className={`h-2 mb-4 ${
            isHealthy ? "[&>div]:bg-green-500" : isDegraded ? "[&>div]:bg-yellow-500" : "[&>div]:bg-red-500"
          }`}
        />

        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-lg font-semibold">{webhooks?.totalDeliveries24h || 0}</div>
            <div className="text-xs text-muted-foreground">Total</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-green-600">{webhooks?.successCount24h || 0}</div>
            <div className="text-xs text-muted-foreground">Success</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-red-600">{webhooks?.failedCount24h || 0}</div>
            <div className="text-xs text-muted-foreground">Failed</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

function FailedJobsCard() {
  const { failedJobs, isLoading, error, refetch, retryJob, deleteJob, deleteAllJobs } = useFailedJobs(20)
  const [selectedJob, setSelectedJob] = useState<string | null>(null)
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set())
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [deleteAllLoading, setDeleteAllLoading] = useState(false)

  const handleRetry = async (queue: string, jobId: string) => {
    setActionLoading(`retry-${jobId}`)
    try {
      await retryJob(queue, jobId)
    } catch (err) {
      console.error("Failed to retry job:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDelete = async (queue: string, jobId: string) => {
    if (!confirm("Are you sure you want to delete this failed job?")) return
    setActionLoading(`delete-${jobId}`)
    try {
      await deleteJob(queue, jobId)
    } catch (err) {
      console.error("Failed to delete job:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteSelected = async () => {
    if (selectedJobs.size === 0) return
    if (!confirm(`Are you sure you want to delete ${selectedJobs.size} failed job(s)?`)) return
    setActionLoading("delete-selected")
    try {
      for (const jobKey of selectedJobs) {
        const [queue, jobId] = jobKey.split("-")
        await deleteJob(queue, jobId)
      }
      setSelectedJobs(new Set())
    } catch (err) {
      console.error("Failed to delete selected jobs:", err)
    } finally {
      setActionLoading(null)
    }
  }

  const handleDeleteAll = async () => {
    if (!confirm("Are you sure you want to delete ALL failed jobs? This action cannot be undone.")) return
    setDeleteAllLoading(true)
    try {
      await deleteAllJobs()
      setSelectedJobs(new Set())
    } catch (err) {
      console.error("Failed to delete all jobs:", err)
    } finally {
      setDeleteAllLoading(false)
    }
  }

  const handleSelectJob = (jobId: string, checked: boolean) => {
    setSelectedJobs((prev) => {
      const newSet = new Set(prev)
      if (checked) {
        newSet.add(jobId)
      } else {
        newSet.delete(jobId)
      }
      return newSet
    })
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedJobs(new Set(failedJobs?.failedJobs.map((j) => `${j.queue}-${j.id}`) || []))
    } else {
      setSelectedJobs(new Set())
    }
  }

  if (isLoading) {
    return (
      <Card className="col-span-full">
        <CardHeader>
          <Skeleton className="h-5 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-40 w-full" />
        </CardContent>
      </Card>
    )
  }

  const hasFailedJobs = (failedJobs?.failedJobs.length || 0) > 0

  return (
    <Card className={`col-span-full ${hasFailedJobs ? "border-red-200" : ""}`}>
      <CardHeader>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-red-500" />
              Failed Jobs
            </CardTitle>
            <CardDescription>
              {failedJobs?.totalFailed || 0} total failed jobs across all queues
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {hasFailedJobs && (
              <>
                {selectedJobs.size > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDeleteSelected}
                    disabled={actionLoading === "delete-selected"}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-3 w-3 mr-1" />
                    Delete Selected ({selectedJobs.size})
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDeleteAll}
                  disabled={deleteAllLoading}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Delete All
                </Button>
              </>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : !hasFailedJobs ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground">
            <CheckCircle className="h-8 w-8 text-green-500 mr-2" />
            No failed jobs
          </div>
        ) : (
          <div className="space-y-3">
            {hasFailedJobs && (
              <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg">
                <Checkbox
                  id="select-all"
                  checked={failedJobs?.failedJobs.length != null && failedJobs.failedJobs.length > 0 && selectedJobs.size === failedJobs.failedJobs.length}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                />
                <label htmlFor="select-all" className="text-sm font-medium cursor-pointer">
                  Select all ({failedJobs?.failedJobs.length ?? 0} jobs)
                </label>
              </div>
            )}
            {failedJobs?.failedJobs.map((job) => {
              const stacktraceText = job.stacktrace?.join("\n") ?? ""
              const jobKey = `${job.queue}-${job.id}`
              return (
                <Collapsible
                  key={jobKey}
                  open={selectedJob === String(job.id)}
                  onOpenChange={(open) => setSelectedJob(open ? String(job.id) : null)}
                >
                  <div className="border rounded-lg overflow-hidden">
                    <CollapsibleTrigger className="w-full">
                      <div className="flex items-center justify-between p-3 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <Checkbox
                            checked={selectedJobs.has(jobKey)}
                            onCheckedChange={(checked) => handleSelectJob(jobKey, checked === true)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <Badge variant="outline" className="capitalize text-xs">
                            {job.queue}
                          </Badge>
                          <span className="text-sm font-medium truncate">
                            {job.name}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ID: {String(job.id).slice(0, 8)}...
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">
                            {job.attemptsMade} attempts
                          </Badge>
                          {job.failedAt && (
                            <span className="text-xs text-muted-foreground">
                              {new Date(job.failedAt).toLocaleString()}
                            </span>
                          )}
                          {selectedJob === String(job.id) ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </div>
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="border-t bg-muted/30 p-3 space-y-3">
                        {/* Error Reason */}
                        {job.failedReason && (
                          <div>
                            <p className="text-xs font-semibold text-red-600 mb-1">Error:</p>
                            <p className="text-xs text-red-600 bg-red-50 p-2 rounded overflow-x-auto">
                              {String(job.failedReason)}
                            </p>
                          </div>
                        )}

                        {/* Stacktrace */}
                        {stacktraceText && (
                          <details className="text-xs">
                            <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
                              Stacktrace
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto text-xs">
                              {String(stacktraceText)}
                            </pre>
                          </details>
                        )}

                        {/* Job Data */}
                        {job.data != null && (
                          <details className="text-xs">
                            <summary className="cursor-pointer font-semibold text-muted-foreground hover:text-foreground">
                              Job Data
                            </summary>
                            <pre className="mt-2 p-2 bg-muted rounded overflow-x-auto text-xs">
                              {JSON.stringify(job.data, null, 2)}
                            </pre>
                          </details>
                        )}

                        {/* Actions */}
                        <div className="flex items-center gap-2 pt-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRetry(job.queue, String(job.id))}
                            disabled={actionLoading === `retry-${job.id}`}
                            className="text-xs"
                          >
                            <RotateCcw className="h-3 w-3 mr-1" />
                            Retry
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(job.queue, String(job.id))}
                            disabled={actionLoading === `delete-${job.id}`}
                            className="text-xs text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function AdminSystemHealthPage() {
  const { health, isLoading, error, refetch } = useAdminHealth()

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">System Health</h1>
          <p className="text-muted-foreground">
            Monitor system components and performance
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isLoading}
          className="min-h-[44px] w-full sm:w-auto"
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Overall Status */}
      <OverallStatusCard status={health?.overall} isLoading={isLoading} />

      {/* Health Status Cards */}
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <HealthStatusCard
          title="Database"
          status={health?.database.status}
          latencyMs={health?.database.latencyMs}
          error={health?.database.error}
          icon={Database}
          isLoading={isLoading}
        />
        <HealthStatusCard
          title="Redis"
          status={health?.redis.status}
          latencyMs={health?.redis.latencyMs}
          error={health?.redis.error}
          icon={Server}
          isLoading={isLoading}
        />
        <WebsocketCard
          activeConnections={health?.websocket.activeConnections}
          onlineUsers={health?.websocket.onlineUsers}
          isLoading={isLoading}
        />
        <WebhookStatsCard
          webhooks={health?.webhooks}
          isLoading={isLoading}
        />
      </div>

      {/* Queue Monitor */}
      <QueueMonitorCard queue={health?.queue} isLoading={isLoading} />

      {/* Failed Jobs */}
      <FailedJobsCard />
    </div>
  )
}
