import { prisma } from '../utils/database.js'
import { ActivityService, ActivityType } from './activity-service.js'
import { logger } from '../utils/logger.js'

/** Tag applied automatically when a customer messages via Click-to-WhatsApp Ads */
export const CTWA_TAG = 'Meta Ads'

/** Referral object from Meta WhatsApp webhook (CTWA / Click-to-WhatsApp Ads) */
export interface WhatsAppReferral {
  source_url?: string
  source_type?: string
  source_id?: string
  headline?: string
  body?: string
  media_type?: string
  image_url?: string
  video_url?: string
  thumbnail_url?: string
  ctwa_clid?: string
  /** Greeting text configured on the ad (Cloud API) */
  welcome_message?: { text?: string }
  /** Legacy/nested media refs — Meta may send { id } instead of *_url fields */
  image?: { id?: string }
  video?: { id?: string }
}

export class CtwaService {
  static parseReferral(raw: unknown): WhatsAppReferral | null {
    if (!raw || typeof raw !== 'object') return null
    return raw as WhatsAppReferral
  }

  /** True when the referral indicates the user clicked a Meta ad (CTWA) */
  static isCtwaReferral(referral: WhatsAppReferral): boolean {
    // Meta documents source_type as "ad" | "post"; CTWA paid ads use "ad"
    return referral.source_type === 'ad'
  }

  /** True when referral object has at least one meaningful field */
  static hasReferralData(referral: WhatsAppReferral): boolean {
    return Boolean(
      referral.source_type ||
      referral.source_id ||
      referral.source_url ||
      referral.ctwa_clid ||
      referral.headline ||
      referral.body
    )
  }

  static sanitizeReferral(referral: WhatsAppReferral): WhatsAppReferral {
    const sanitized: WhatsAppReferral = {}

    if (referral.source_url) sanitized.source_url = referral.source_url
    if (referral.source_type) sanitized.source_type = referral.source_type
    if (referral.source_id) sanitized.source_id = referral.source_id
    if (referral.headline) sanitized.headline = referral.headline
    if (referral.body) sanitized.body = referral.body
    if (referral.media_type) sanitized.media_type = referral.media_type
    if (referral.image_url) sanitized.image_url = referral.image_url
    if (referral.video_url) sanitized.video_url = referral.video_url
    if (referral.thumbnail_url) sanitized.thumbnail_url = referral.thumbnail_url
    if (referral.ctwa_clid) sanitized.ctwa_clid = referral.ctwa_clid
    if (referral.welcome_message?.text) {
      sanitized.welcome_message = { text: referral.welcome_message.text }
    }
    if (referral.image?.id) sanitized.image = { id: referral.image.id }
    if (referral.video?.id) sanitized.video = { id: referral.video.id }

    return sanitized
  }

  /**
   * Apply CTWA auto-tag and log attribution activity for inbound CTWA messages.
   */
  static async processCtwaInbound(
    userId: string,
    customerId: string,
    messageId: string,
    referral: WhatsAppReferral
  ): Promise<{ tagAdded: boolean }> {
    const customer = await prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, tags: true },
    })

    if (!customer) {
      logger.warn('[CTWA] Customer not found', { customerId })
      return { tagAdded: false }
    }

    const existingTags = customer.tags || []
    const tagAdded = !existingTags.includes(CTWA_TAG)

    if (tagAdded) {
      await prisma.customer.update({
        where: { id: customerId },
        data: { tags: [...existingTags, CTWA_TAG] },
      })
      logger.info('[CTWA] Auto-tag applied', { customerId, tag: CTWA_TAG })
    }

    const headline = referral.headline || referral.source_id || 'Meta Ads'
    await ActivityService.logActivity(
      customerId,
      userId,
      ActivityType.CTWA_ATTRIBUTION,
      'Arrived via Meta Ads',
      headline,
      {
        messageId,
        tag: CTWA_TAG,
        tagAdded,
        referral: this.sanitizeReferral(referral),
      }
    )

    return { tagAdded }
  }
}
