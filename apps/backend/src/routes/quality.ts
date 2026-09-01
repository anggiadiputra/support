import { Hono } from 'hono'
import type { Context } from 'hono'
import { requireRole } from '../middleware/auth.js'
import { prisma } from '../utils/database.js'
import { WhatsAppAPI } from '../utils/whatsapp.js'
import { resolveCredentialsForSending } from '../utils/whatsapp-account-helper.js'

const app = new Hono()

// GET /api/v1/quality - Get quality ratings
app.get('/', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.req.query('userId') || c.user.id

    if (c.user.role !== 'ADMIN' && c.user.id !== userId) {
      return c.json({ error: { code: 'Forbidden', message: 'Access denied' } }, 403)
    }

    // Verify user exists
    const user = await prisma.user.findUnique({
      where: { id: userId }
    })

    if (!user) {
      return c.json({ error: { code: 'NotFound', message: 'User not found' } }, 404)
    }

    // Get all quality ratings for this user
    const allRatings = await prisma.qualityRating.findMany({
      where: { userId },
      orderBy: { measuredAt: 'desc' }
    })

    // Get user's phone numbers to map primary status
    const userPhoneNumbers = await prisma.phoneNumber.findMany({
      where: { userId },
      select: { phoneNumberId: true, displayPhoneNumber: true, isPrimary: true }
    })
    const phoneNumberLookup = new Map(
      userPhoneNumbers.map(pn => [pn.phoneNumberId, pn])
    )

    // Group by phone number
    const phoneNumbersMap = new Map()

    for (const rating of allRatings) {
      if (!phoneNumbersMap.has(rating.phoneNumberId)) {
        const pnRecord = phoneNumberLookup.get(rating.phoneNumberId)
        phoneNumbersMap.set(rating.phoneNumberId, {
          phoneNumberId: rating.phoneNumberId,
          displayPhoneNumber: pnRecord?.displayPhoneNumber
            || (pnRecord?.isPrimary ? 'Primary Phone' : rating.phoneNumberId),
          currentRating: rating,
          ratingHistory: [rating]
        })
      } else {
        phoneNumbersMap.get(rating.phoneNumberId).ratingHistory.push(rating)
      }
    }

    const qualityData = Array.from(phoneNumbersMap.values())

    return c.json({ success: true, data: qualityData })
  } catch (error) {
    console.error('Quality ratings error:', error)
    return c.json({ error: { code: 'InternalServerError', message: 'Failed to fetch quality ratings' } }, 500)
  }
})

// POST /api/v1/quality/sync - Sync quality ratings from Meta
app.post('/sync', requireRole(['ADMIN', 'BUSINESS_OWNER']), async (c: Context) => {
  try {
    if (!c.user) {
      return c.json({ error: { code: 'Unauthorized', message: 'Authentication required' } }, 401)
    }

    const userId = c.user.id

    // Resolve WhatsApp credentials from WhatsAppAccount model
    const credentials = await resolveCredentialsForSending(userId)

    if (!credentials) {
      return c.json({ error: { code: 'BadRequest', message: 'No WhatsApp Business Account connected or no phone number configured' } }, 400)
    }

    // Fetch quality rating from Meta with per-account token
    const whatsapp = new WhatsAppAPI({ accessToken: credentials.accessToken })
    let qualityData
    try {
      qualityData = await whatsapp.getQualityRating(credentials.phoneNumberId)
    } catch (metaError: any) {
      console.error('Meta API Error:', metaError.response?.data || metaError.message)
      return c.json({
        error: {
          code: 'MetaAPIError',
          message: metaError.response?.data?.error?.message || metaError.message,
          details: metaError.response?.data
        }
      }, metaError.response?.status || 500)
    }

    // Map Meta quality rating to our enum (GREEN=HIGH, YELLOW=MEDIUM, RED=LOW)
    const ratingMap: Record<string, 'HIGH' | 'MEDIUM' | 'LOW'> = {
      'GREEN': 'HIGH',
      'YELLOW': 'MEDIUM',
      'RED': 'LOW',
      'FLAGGED': 'LOW'
    }

    const metaRating = qualityData.quality_rating?.toUpperCase() || 'YELLOW'
    const mappedRating = ratingMap[metaRating] || 'MEDIUM'

    // Save to database
    const qualityRating = await prisma.qualityRating.create({
      data: {
        userId,
        phoneNumberId: credentials.phoneNumberId,
        whatsappAccountId: credentials.whatsappAccountId,
        rating: mappedRating,
        status: qualityData.messaging_limit_tier || 'TIER_NOT_SET',
        blockCount7days: 0, // Not available from this endpoint
        spamReportCount7days: 0, // Not available from this endpoint
        measuredAt: new Date()
      }
    })

    return c.json({
      success: true,
      data: qualityRating,
      message: 'Quality rating synced successfully'
    })
  } catch (error: any) {
    console.error('Quality sync error:', error)
    return c.json({ 
      error: { 
        code: 'InternalServerError', 
        message: error.message || 'Failed to sync quality ratings' 
      } 
    }, 500)
  }
})

export default app
