import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../middleware/auth.js'
import { getCache, setCache, CACHE_KEYS, CACHE_TTL } from '../utils/cache.js'
import { DashboardStatsService } from '../services/dashboard-stats-service.js'

const app = new Hono()

// GET /api/v1/dashboard/stats - Get enhanced dashboard statistics
// Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.1, 5.2, 5.3, 5.4
app.get('/stats', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.req.query('userId') || c.user.id

    if (c.user.role !== 'ADMIN' && c.user.id !== userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Get optional phone number filter for multi-number support
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId') || undefined

    // Get optional date range filter
    const startDateStr = c.req.query('startDate')
    const endDateStr = c.req.query('endDate')
    const startDate = startDateStr ? new Date(startDateStr) : undefined
    const endDate = endDateStr ? new Date(endDateStr) : undefined

    // Try to get from cache first (include phone number and date range in cache key)
    const dateRangeKey = startDate && endDate ? `:${startDate.toISOString().split('T')[0]}:${endDate.toISOString().split('T')[0]}` : ''
    const cacheKey = `${CACHE_KEYS.dashboardStats(userId as string)}${whatsappPhoneNumberId ? `:${whatsappPhoneNumberId}` : ''}${dateRangeKey}`
    const cachedStats = await getCache(cacheKey)

    if (cachedStats) {
      return c.json({ success: true, data: cachedStats, cached: true })
    }

    // Get enhanced stats from service (with optional phone number filter and date range)
    const stats = await DashboardStatsService.getEnhancedStats(userId as string, whatsappPhoneNumberId, startDate, endDate)

    // Cache the result for 60 seconds
    await setCache(cacheKey, stats, CACHE_TTL.DASHBOARD_STATS)

    return c.json({ success: true, data: stats, cached: false })
  } catch (error) {
    console.error('Dashboard stats error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch dashboard stats' } }, 500)
  }
})

// GET /api/v1/dashboard/message-volume - Get message volume for chart
// Requirements: 1.4, 3.1
app.get('/message-volume', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.req.query('userId') || c.user.id
    const days = parseInt(c.req.query('days') || '30', 10)
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId') || undefined

    if (c.user.role !== 'ADMIN' && c.user.id !== userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Validate days parameter (1-90 days)
    const validDays = Math.min(Math.max(days, 1), 90)

    // Try to get from cache first (include phone number in cache key)
    const cacheKey = `dashboard:message-volume:${userId}:${validDays}${whatsappPhoneNumberId ? `:${whatsappPhoneNumberId}` : ''}`
    const cachedData = await getCache(cacheKey)

    if (cachedData) {
      return c.json({ success: true, data: cachedData, cached: true })
    }

    const volumeData = await DashboardStatsService.getMessageVolume(userId as string, validDays, whatsappPhoneNumberId)

    // Cache for 5 minutes
    await setCache(cacheKey, volumeData, 300)

    return c.json({ success: true, data: volumeData, cached: false })
  } catch (error) {
    console.error('Message volume error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch message volume' } }, 500)
  }
})

// GET /api/v1/dashboard/customer-insights - Get customer insights
// Requirements: 2.4, 2.5, 2.6
app.get('/customer-insights', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.req.query('userId') || c.user.id
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId') || undefined

    if (c.user.role !== 'ADMIN' && c.user.id !== userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Try to get from cache first (include phone number in cache key)
    const cacheKey = `dashboard:customer-insights:${userId}${whatsappPhoneNumberId ? `:${whatsappPhoneNumberId}` : ''}`
    const cachedData = await getCache(cacheKey)

    if (cachedData) {
      return c.json({ success: true, data: cachedData, cached: true })
    }

    const insights = await DashboardStatsService.getCustomerInsights(userId as string, whatsappPhoneNumberId)

    // Cache for 2 minutes
    await setCache(cacheKey, insights, 120)

    return c.json({ success: true, data: insights, cached: false })
  } catch (error) {
    console.error('Customer insights error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch customer insights' } }, 500)
  }
})

// GET /api/v1/dashboard/quality-metrics - Get quality metrics
// Requirements: 5.1, 5.2, 5.3, 5.4
app.get('/quality-metrics', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.req.query('userId') || c.user.id
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId') || undefined

    if (c.user.role !== 'ADMIN' && c.user.id !== userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Try to get from cache first (include phone number in cache key)
    const cacheKey = `dashboard:quality-metrics:${userId}${whatsappPhoneNumberId ? `:${whatsappPhoneNumberId}` : ''}`
    const cachedData = await getCache(cacheKey)

    if (cachedData) {
      return c.json({ success: true, data: cachedData, cached: true })
    }

    const metrics = await DashboardStatsService.getQualityMetrics(userId as string, whatsappPhoneNumberId)

    // Cache for 5 minutes
    await setCache(cacheKey, metrics, 300)

    return c.json({ success: true, data: metrics, cached: false })
  } catch (error) {
    console.error('Quality metrics error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch quality metrics' } }, 500)
  }
})

// GET /api/v1/dashboard/export - Export dashboard data to CSV
app.get('/export', requireRole(['ADMIN', 'BUSINESS_OWNER', 'AGENT']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.req.query('userId') || c.user.id
    const whatsappPhoneNumberId = c.req.query('whatsappPhoneNumberId') || undefined
    const startDateStr = c.req.query('startDate')
    const endDateStr = c.req.query('endDate')

    if (c.user.role !== 'ADMIN' && c.user.id !== userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Parse dates or use defaults (last 30 days)
    const endDate = endDateStr ? new Date(endDateStr) : new Date()
    const startDate = startDateStr ? new Date(startDateStr) : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)

    // Calculate days from date range
    const days = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1

    // Get dashboard data
    const [stats, messageVolume] = await Promise.all([
      DashboardStatsService.getEnhancedStats(userId as string, whatsappPhoneNumberId),
      DashboardStatsService.getMessageVolume(userId as string, days, whatsappPhoneNumberId)
    ])

    // Generate CSV content
    const lines: string[] = []

    // Header section
    lines.push('Dashboard Report')
    lines.push(`Generated: ${new Date().toISOString()}`)
    lines.push(`Date Range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`)
    lines.push('')

    // Message Statistics
    lines.push('=== MESSAGE STATISTICS ===')
    lines.push('Metric,Value')
    lines.push(`Total Messages,${stats.messages.total}`)
    lines.push(`Messages Today,${stats.messages.today}`)
    lines.push(`Messages This Week,${stats.messages.thisWeek}`)
    lines.push(`Messages This Month,${stats.messages.thisMonth}`)
    lines.push(`Sent,${stats.messages.sent}`)
    lines.push(`Delivered,${stats.messages.delivered}`)
    lines.push(`Read,${stats.messages.read}`)
    lines.push(`Failed,${stats.messages.failed}`)
    lines.push(`Delivery Rate,${stats.messages.deliveryRate}%`)
    lines.push(`Read Rate,${stats.messages.readRate}%`)
    lines.push('')

    // Message Types
    lines.push('=== MESSAGE TYPES ===')
    lines.push('Type,Count')
    lines.push(`Text,${stats.messages.byType.text}`)
    lines.push(`Image,${stats.messages.byType.image}`)
    lines.push(`Video,${stats.messages.byType.video}`)
    lines.push(`Document,${stats.messages.byType.document}`)
    lines.push(`Template,${stats.messages.byType.template}`)
    lines.push(`Other,${stats.messages.byType.other}`)
    lines.push('')

    // Channel Distribution
    lines.push('=== CHANNEL DISTRIBUTION ===')
    lines.push('Channel,Count')
    lines.push(`WhatsApp,${stats.messages.byChannel.whatsapp}`)
    lines.push(`Instagram,${stats.messages.byChannel.instagram}`)
    lines.push('')

    // Customer Statistics
    lines.push('=== CUSTOMER STATISTICS ===')
    lines.push('Metric,Value')
    lines.push(`Total Customers,${stats.customers.total}`)
    lines.push(`New This Week,${stats.customers.newThisWeek}`)
    lines.push(`Active Windows,${stats.customers.activeWindows}`)
    lines.push(`Consented,${stats.customers.consented}`)
    lines.push(`Blacklisted,${stats.customers.blacklisted}`)
    lines.push('')

    // Pipeline Stages
    if (stats.customers.byPipelineStage.length > 0) {
      lines.push('=== PIPELINE STAGES ===')
      lines.push('Stage,Count')
      for (const stage of stats.customers.byPipelineStage) {
        lines.push(`"${stage.stageName}",${stage.count}`)
      }
      lines.push('')
    }

    // Top Leads
    if (stats.customers.topLeads.length > 0) {
      lines.push('=== TOP LEADS ===')
      lines.push('Name,Phone,Score,Stage')
      for (const lead of stats.customers.topLeads) {
        lines.push(`"${lead.name}",${lead.phoneNumber},${lead.leadScore},"${lead.pipelineStage || 'N/A'}"`)
      }
      lines.push('')
    }

    // Template Statistics
    lines.push('=== TEMPLATE STATISTICS ===')
    lines.push('Metric,Value')
    lines.push(`Total Templates,${stats.templates.total}`)
    lines.push(`Approved,${stats.templates.approved}`)
    lines.push(`Pending,${stats.templates.pending}`)
    lines.push(`Rejected,${stats.templates.rejected}`)
    lines.push(`Usage This Month,${stats.templates.usageThisMonth}`)
    lines.push('')

    // Template Categories
    lines.push('=== TEMPLATE CATEGORIES ===')
    lines.push('Category,Count')
    lines.push(`Marketing,${stats.templates.byCategory.marketing}`)
    lines.push(`Utility,${stats.templates.byCategory.utility}`)
    lines.push(`Authentication,${stats.templates.byCategory.authentication}`)
    lines.push('')

    // Quality Metrics
    lines.push('=== QUALITY METRICS ===')
    lines.push('Metric,Value')
    lines.push(`Quality Rating,${stats.quality.rating || 'N/A'}`)
    lines.push(`Messaging Tier,${stats.quality.messagingTier || 'N/A'}`)
    lines.push(`Blocks (7 days),${stats.quality.blockCount7days}`)
    lines.push(`Spam Reports (7 days),${stats.quality.spamReportCount7days}`)
    lines.push(`Status,${stats.quality.status || 'N/A'}`)
    lines.push('')

    // Message Volume (Daily)
    lines.push('=== DAILY MESSAGE VOLUME ===')
    lines.push('Date,WhatsApp,Instagram,Total')
    for (const day of messageVolume) {
      lines.push(`${day.date},${day.whatsapp},${day.instagram},${day.total}`)
    }

    const csv = lines.join('\n')

    return c.text(csv, 200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="dashboard-report-${startDate.toISOString().split('T')[0]}-to-${endDate.toISOString().split('T')[0]}.csv"`
    })
  } catch (error) {
    console.error('Dashboard export error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to export dashboard data' } }, 500)
  }
})

export default app
