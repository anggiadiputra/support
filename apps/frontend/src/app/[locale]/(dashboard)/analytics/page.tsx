import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
    TrendingUp,
    TrendingDown,
    ArrowUpRight,
    ArrowDownRight,
    MessageSquare,
    Users,
    CheckCircle2,
    Target,
} from "lucide-react"
import { getAnalyticsServer } from "@/lib/api/analytics-server"
import { Header } from "@/components/layout/header"
import { MessageVolumeChart } from "./components/message-volume-chart"
import { LeadScoreChart } from "./components/lead-score-chart"
import { PipelineChart } from "./components/pipeline-chart"
import { MessageBreakdownChart } from "./components/message-breakdown-chart"
import { AnalyticsFilter } from "./components/analytics-filter"

interface PageProps {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export default async function AnalyticsPage({ searchParams }: PageProps) {
    const params = await searchParams
    const timeRange = typeof params.timeRange === 'string' ? params.timeRange : '7d'
    const analytics = await getAnalyticsServer(timeRange)

    if (!analytics) {
        return (
            <>
                <Header />
                <div className="p-8">
                    <p className="text-muted-foreground">
                        No analytics data available or failed to load. Please try again later.
                    </p>
                </div>
            </>
        )
    }

    const deliveryRate = analytics.overview.sentMessages > 0
        ? ((analytics.overview.deliveredMessages / analytics.overview.sentMessages) * 100).toFixed(1)
        : "0"

    return (
        <>
            <Header />
            <div className="flex-1 space-y-6 p-4 sm:p-6 lg:p-8 pt-4 sm:pt-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                    <div>
                        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                            Analytics
                        </h2>
                        <p className="text-sm sm:text-base text-muted-foreground mt-1">
                            Track your messaging performance and customer engagement
                        </p>
                    </div>
                    <AnalyticsFilter />
                </div>

                {/* Key Metrics */}
                <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                    {/* Total Messages */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Total Messages</CardTitle>
                            <MessageSquare className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{analytics.overview.totalMessages}</div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                {analytics.trends.messagesGrowth >= 0 ? (
                                    <>
                                        <ArrowUpRight className="h-3 w-3 text-green-500" />
                                        <span className="text-green-600">+{analytics.trends.messagesGrowth}%</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownRight className="h-3 w-3 text-red-500" />
                                        <span className="text-red-600">{analytics.trends.messagesGrowth}%</span>
                                    </>
                                )}
                                <span className="text-muted-foreground ml-1">from last period</span>
                            </p>
                        </CardContent>
                    </Card>

                    {/* Delivery Rate */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Delivery Rate</CardTitle>
                            <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{deliveryRate}%</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                {analytics.overview.deliveredMessages} of {analytics.overview.sentMessages} delivered
                            </p>
                        </CardContent>
                    </Card>

                    {/* Active Customers */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Active Customers</CardTitle>
                            <Users className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{analytics.overview.activeCustomers}</div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                {analytics.trends.customersGrowth >= 0 ? (
                                    <>
                                        <ArrowUpRight className="h-3 w-3 text-green-500" />
                                        <span className="text-green-600">+{Math.abs(analytics.trends.customersGrowth)}%</span>
                                    </>
                                ) : (
                                    <>
                                        <ArrowDownRight className="h-3 w-3 text-red-500" />
                                        <span className="text-red-600">{analytics.trends.customersGrowth}%</span>
                                    </>
                                )}
                                <span className="text-muted-foreground ml-1">from last period</span>
                            </p>
                        </CardContent>
                    </Card>

                    {/* Response Rate */}
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                            <CardTitle className="text-sm font-medium">Response Rate</CardTitle>
                            <Target className="h-4 w-4 text-muted-foreground" />
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold">{analytics.trends.responseRate}%</div>
                            <p className="text-xs text-muted-foreground mt-1">
                                Inbound messages with replies
                            </p>
                        </CardContent>
                    </Card>
                </div>

                {/* Message Volume Chart */}
                {analytics.messagesByDay.length > 0 && (
                    <MessageVolumeChart data={analytics.messagesByDay} />
                )}

                {/* Message Breakdown & CRM Metrics */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Message Direction */}
                    <MessageBreakdownChart
                        inbound={analytics.messageBreakdown.inbound}
                        outbound={analytics.messageBreakdown.outbound}
                    />

                    {/* Lead Score Distribution */}
                    {analytics.crmMetrics && (
                        <LeadScoreChart data={analytics.crmMetrics.leadScoreDistribution} />
                    )}
                </div>

                {/* Pipeline Overview */}
                {analytics.crmMetrics && analytics.crmMetrics.dealsByStage.length > 0 && (
                    <PipelineChart data={analytics.crmMetrics.dealsByStage} />
                )}

                {/* Additional Metrics */}
                <div className="grid gap-6 md:grid-cols-2">
                    {/* Message Stats */}
                    <Card>
                        <CardHeader>
                            <CardTitle>Message Statistics</CardTitle>
                            <CardDescription>Detailed breakdown of message status</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-blue-500" />
                                    <span className="text-sm font-medium">Sent</span>
                                </div>
                                <span className="text-sm font-bold">{analytics.overview.sentMessages}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-green-500" />
                                    <span className="text-sm font-medium">Delivered</span>
                                </div>
                                <span className="text-sm font-bold">{analytics.overview.deliveredMessages}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-red-500" />
                                    <span className="text-sm font-medium">Failed</span>
                                </div>
                                <span className="text-sm font-bold">{analytics.overview.failedMessages}</span>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-purple-500" />
                                    <span className="text-sm font-medium">Inbound</span>
                                </div>
                                <span className="text-sm font-bold">{analytics.overview.inboundMessages}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="h-2 w-2 rounded-full bg-orange-500" />
                                    <span className="text-sm font-medium">Outbound</span>
                                </div>
                                <span className="text-sm font-bold">{analytics.overview.outboundMessages}</span>
                            </div>
                        </CardContent>
                    </Card>

                    {/* CRM Summary */}
                    <Card>
                        <CardHeader>
                            <CardTitle>CRM Summary</CardTitle>
                            <CardDescription>Customer and pipeline overview</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Total Customers</span>
                                <Badge variant="outline">{analytics.overview.totalCustomers}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Active Customers</span>
                                <Badge variant="outline" className="text-blue-600 border-blue-200">
                                    {analytics.overview.activeCustomers}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Pipeline Deals</span>
                                <Badge variant="outline" className="text-green-600 border-green-200">
                                    {analytics.overview.totalDeals}
                                </Badge>
                            </div>
                            <div className="flex items-center justify-between pt-2 border-t">
                                <span className="text-sm text-muted-foreground">Total Templates</span>
                                <Badge variant="outline">{analytics.overview.totalTemplates}</Badge>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-muted-foreground">Approved Templates</span>
                                <Badge variant="outline" className="text-green-600 border-green-200">
                                    {analytics.overview.approvedTemplates}
                                </Badge>
                            </div>
                        </CardContent>
                    </Card>
                </div>

                {/* Template Performance */}
                {analytics.templatePerformance.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Template Performance</CardTitle>
                            <CardDescription>Top performing message templates</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {analytics.templatePerformance.map((template, index) => (
                                    <div
                                        key={index}
                                        className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                                    >
                                        <div className="flex-1">
                                            <p className="font-medium">{template.templateName}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {template.sent} sent · {template.delivered} delivered
                                            </p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-bold text-green-600">
                                                {template.deliveryRate}%
                                            </p>
                                            <p className="text-xs text-muted-foreground">delivery rate</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}
            </div>
        </>
    )
}
