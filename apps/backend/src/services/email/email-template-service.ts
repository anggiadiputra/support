/**
 * Email Template Service
 *
 * Manages admin-customizable email templates stored in the database.
 * Templates use {{variableName}} placeholders for dynamic content.
 * Falls back to hardcoded TypeScript templates when no DB override exists.
 */

import { prisma } from '../../utils/database.js';
import { logger } from '../../utils/logger.js';
import { escapeHtml } from '../../utils/sanitize.js';
import { settingsCache, CACHE_TTL } from '../settings-cache.js';

// Import code templates as defaults
import { otpVerificationTemplate } from './templates/otp-verification.js';
import { passwordResetTemplate } from './templates/password-reset.js';
import { welcomeEmailTemplate } from './templates/welcome.js';
import { subscriptionActivationTemplate } from './templates/subscription-activation.js';
import { subscriptionExpiryReminderTemplate } from './templates/subscription-expiry-reminder.js';
import { subscriptionExpiredTemplate } from './templates/subscription-expired.js';
import { invitationEmailTemplate } from './templates/invitation.js';
import {
  tokenRefreshFailedTemplate,
  qualityRatingDropTemplate,
  webhookSubscriptionFailedTemplate,
  wabaDisconnectedTemplate,
  webhookEndpointDisabledTemplate,
  apiKeyExpiringTemplate,
} from './templates/index.js';

// ── Types ──────────────────────────────────────────────────────

export interface EmailTemplateDefinition {
  slug: string;
  name: string;
  description: string;
  variables: string[];
  /** Generate default template from code */
  getDefault: (vars: Record<string, string>) => { subject: string; html: string; text: string };
}

export interface EmailTemplateListItem {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  variables: string[];
  isActive: boolean;
  updatedAt: Date;
}

export interface EmailTemplateData {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  subject: string;
  htmlBody: string;
  textBody: string;
  variables: string[];
  isActive: boolean;
  updatedAt: Date;
}

export interface UpdateTemplateInput {
  subject: string;
  htmlBody: string;
  textBody: string;
  isActive: boolean;
}

// ── Template Definitions (metadata + code fallback) ──────────

const TEMPLATE_DEFINITIONS: EmailTemplateDefinition[] = [
  {
    slug: 'otp-verification',
    name: 'OTP Verification',
    description: 'Sent when a user registers and needs to verify their email',
    variables: ['otp', 'expiresInMinutes', 'appName'],
    getDefault: (vars) => {
      const t = otpVerificationTemplate({
        otp: vars.otp || '123456',
        expiresInMinutes: parseInt(vars.expiresInMinutes) || 10,
        appName: vars.appName,
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'password-reset',
    name: 'Password Reset',
    description: 'Sent when a user requests a password reset',
    variables: ['otp', 'expiresInMinutes', 'appName'],
    getDefault: (vars) => {
      const t = passwordResetTemplate({
        otp: vars.otp || '123456',
        expiresInMinutes: parseInt(vars.expiresInMinutes) || 10,
        appName: vars.appName,
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'welcome',
    name: 'Welcome Email',
    description: 'Sent to new users after successful registration',
    variables: ['userName', 'userEmail', 'appName', 'dashboardUrl'],
    getDefault: (vars) => {
      const t = welcomeEmailTemplate({
        userName: vars.userName || 'User',
        userEmail: vars.userEmail || 'user@example.com',
        appName: vars.appName,
        dashboardUrl: vars.dashboardUrl,
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'subscription-activation',
    name: 'Subscription Activation',
    description: 'Sent when a subscription is successfully activated',
    variables: ['userName', 'tierName', 'startDate', 'endDate', 'orderId', 'amount', 'durationLabel', 'appName'],
    getDefault: (vars) => {
      const t = subscriptionActivationTemplate({
        userName: vars.userName || 'User',
        tierName: vars.tierName || 'PRO',
        startDate: new Date(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        orderId: vars.orderId || 'ORD-12345',
        amount: parseInt(vars.amount) || 100000,
        appName: vars.appName,
        durationLabel: vars.durationLabel || '1 Bulan',
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'subscription-expiry-reminder',
    name: 'Subscription Expiry Reminder',
    description: 'Sent 7 days and 1 day before subscription expires',
    variables: ['userName', 'tierName', 'expiryDate', 'daysUntilExpiry', 'appName'],
    getDefault: (vars) => {
      const t = subscriptionExpiryReminderTemplate({
        userName: vars.userName || 'User',
        tierName: vars.tierName || 'PRO',
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        daysUntilExpiry: parseInt(vars.daysUntilExpiry) || 7,
        appName: vars.appName,
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'subscription-expired',
    name: 'Subscription Expired',
    description: 'Sent when a subscription has expired and account is downgraded',
    variables: ['userName', 'tierName', 'expiredDate', 'appName'],
    getDefault: (vars) => {
      const t = subscriptionExpiredTemplate({
        userName: vars.userName || 'User',
        tierName: vars.tierName || 'PRO',
        expiredDate: new Date(),
        appName: vars.appName,
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'invitation',
    name: 'Team Invitation',
    description: 'Sent when a business owner invites an agent to their team',
    variables: ['businessOwnerName', 'inviteeEmail', 'invitationLink', 'expiresAt', 'appName'],
    getDefault: (vars) => {
      const t = invitationEmailTemplate({
        businessOwnerName: vars.businessOwnerName || 'Business Owner',
        inviteeEmail: vars.inviteeEmail || 'agent@example.com',
        invitationLink: vars.invitationLink || `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${process.env.DEFAULT_LOCALE || 'en'}/accept-invitation?token=token`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        appName: vars.appName,
      });
      return { subject: t.subject, html: t.html, text: t.text };
    },
  },
  {
    slug: 'token-refresh-failed',
    name: 'Token Refresh Failed',
    description: 'Sent to admin when WhatsApp token refresh fails',
    variables: ['wabaId', 'businessName', 'error'],
    getDefault: (vars) => {
      const t = tokenRefreshFailedTemplate({
        wabaId: vars.wabaId || 'WABA-123',
        businessName: vars.businessName || 'Business',
        error: vars.error || 'Token expired',
      });
      return { subject: t.subject, html: t.body, text: t.body.replace(/<[^>]*>/g, '') };
    },
  },
  {
    slug: 'quality-rating-drop',
    name: 'Quality Rating Drop',
    description: 'Sent when a WhatsApp phone number quality rating drops',
    variables: ['phoneNumber', 'oldRating', 'newRating', 'businessName'],
    getDefault: (vars) => {
      const t = qualityRatingDropTemplate({
        phoneNumber: vars.phoneNumber || '+628123456789',
        oldRating: vars.oldRating || 'HIGH',
        newRating: vars.newRating || 'MEDIUM',
        businessName: vars.businessName || 'Business',
      });
      return { subject: t.subject, html: t.body, text: t.body.replace(/<[^>]*>/g, '') };
    },
  },
  {
    slug: 'webhook-subscription-failed',
    name: 'Webhook Subscription Failed',
    description: 'Sent when webhook subscription to Meta fails',
    variables: ['wabaId', 'businessName', 'error', 'attemptCount'],
    getDefault: (vars) => {
      const t = webhookSubscriptionFailedTemplate({
        wabaId: vars.wabaId || 'WABA-123',
        businessName: vars.businessName || 'Business',
        error: vars.error || 'Connection failed',
        attemptCount: parseInt(vars.attemptCount) || 3,
      });
      return { subject: t.subject, html: t.body, text: t.body.replace(/<[^>]*>/g, '') };
    },
  },
  {
    slug: 'waba-disconnected',
    name: 'WABA Disconnected',
    description: 'Sent when a WhatsApp Business Account is disconnected',
    variables: ['wabaId', 'businessName', 'reason'],
    getDefault: (vars) => {
      const t = wabaDisconnectedTemplate({
        wabaId: vars.wabaId || 'WABA-123',
        businessName: vars.businessName || 'Business',
        reason: vars.reason || 'Token revoked',
      });
      return { subject: t.subject, html: t.body, text: t.body.replace(/<[^>]*>/g, '') };
    },
  },
  {
    slug: 'webhook-endpoint-disabled',
    name: 'Webhook Endpoint Disabled',
    description: 'Sent when a webhook endpoint is auto-disabled due to failures',
    variables: ['endpointName', 'endpointUrl', 'userName'],
    getDefault: (vars) => {
      const t = webhookEndpointDisabledTemplate({
        endpointName: vars.endpointName || 'My Webhook',
        endpointUrl: vars.endpointUrl || 'https://example.com/webhook',
        userName: vars.userName || 'User',
      });
      return { subject: t.subject, html: t.body, text: t.body.replace(/<[^>]*>/g, '') };
    },
  },
  {
    slug: 'api-key-expiring',
    name: 'API Key Expiring',
    description: 'Sent when an API key is about to expire',
    variables: ['keyName', 'keyPrefix', 'expiresAt', 'daysUntilExpiry', 'userName'],
    getDefault: (vars) => {
      const t = apiKeyExpiringTemplate({
        keyName: vars.keyName || 'My API Key',
        keyPrefix: vars.keyPrefix || 'kc_live_abc',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        daysUntilExpiry: parseInt(vars.daysUntilExpiry) || 7,
        userName: vars.userName || 'User',
      });
      return { subject: t.subject, html: t.body, text: t.body.replace(/<[^>]*>/g, '') };
    },
  },
];

// ── Cache Keys ──────────────────────────────────────────────────

const CACHE_KEY_PREFIX = 'email-template:';
const cacheKey = (slug: string) => `${CACHE_KEY_PREFIX}${slug}`;

// ── Service ─────────────────────────────────────────────────────

class EmailTemplateService {
  /**
   * Get template definition by slug
   */
  getDefinition(slug: string): EmailTemplateDefinition | undefined {
    return TEMPLATE_DEFINITIONS.find((d) => d.slug === slug);
  }

  /**
   * Get all template definitions (for seeding/listing)
   */
  getAllDefinitions(): EmailTemplateDefinition[] {
    return TEMPLATE_DEFINITIONS;
  }

  /**
   * List all templates (from DB, with code defaults for missing ones)
   */
  async listTemplates(): Promise<EmailTemplateListItem[]> {
    const dbTemplates = await prisma.emailTemplate.findMany({
      orderBy: { slug: 'asc' },
    });

    const dbMap = new Map(dbTemplates.map((t) => [t.slug, t]));
    const result: EmailTemplateListItem[] = [];

    for (const def of TEMPLATE_DEFINITIONS) {
      const db = dbMap.get(def.slug);
      if (db) {
        result.push({
          id: db.id,
          slug: db.slug,
          name: db.name,
          description: db.description,
          variables: db.variables as string[],
          isActive: db.isActive,
          updatedAt: db.updatedAt,
        });
      } else {
        result.push({
          id: '',
          slug: def.slug,
          name: def.name,
          description: def.description,
          variables: def.variables,
          isActive: false,
          updatedAt: new Date(),
        });
      }
    }

    return result;
  }

  /**
   * Get single template by slug
   */
  async getTemplate(slug: string): Promise<EmailTemplateData | null> {
    const def = this.getDefinition(slug);
    if (!def) return null;

    const db = await prisma.emailTemplate.findUnique({ where: { slug } });

    if (db) {
      return {
        id: db.id,
        slug: db.slug,
        name: db.name,
        description: db.description,
        subject: db.subject,
        htmlBody: db.htmlBody,
        textBody: db.textBody,
        variables: db.variables as string[],
        isActive: db.isActive,
        updatedAt: db.updatedAt,
      };
    }

    // Return code default
    const defaultTemplate = def.getDefault({});
    return {
      id: '',
      slug: def.slug,
      name: def.name,
      description: def.description,
      subject: defaultTemplate.subject,
      htmlBody: defaultTemplate.html,
      textBody: defaultTemplate.text,
      variables: def.variables,
      isActive: false,
      updatedAt: new Date(),
    };
  }

  /**
   * Update (or create) a template in the database
   */
  async updateTemplate(slug: string, data: UpdateTemplateInput, adminId: string): Promise<EmailTemplateData | null> {
    const def = this.getDefinition(slug);
    if (!def) return null;

    const result = await prisma.emailTemplate.upsert({
      where: { slug },
      update: {
        subject: data.subject,
        htmlBody: data.htmlBody,
        textBody: data.textBody,
        isActive: data.isActive,
        updatedBy: adminId,
      },
      create: {
        slug,
        name: def.name,
        description: def.description,
        subject: data.subject,
        htmlBody: data.htmlBody,
        textBody: data.textBody,
        variables: def.variables,
        isActive: data.isActive,
        updatedBy: adminId,
      },
    });

    // Invalidate cache
    settingsCache.invalidate(cacheKey(slug));

    logger.info('Email template updated', { slug, adminId });

    return {
      id: result.id,
      slug: result.slug,
      name: result.name,
      description: result.description,
      subject: result.subject,
      htmlBody: result.htmlBody,
      textBody: result.textBody,
      variables: result.variables as string[],
      isActive: result.isActive,
      updatedAt: result.updatedAt,
    };
  }

  /**
   * Reset a template to code defaults (delete DB override)
   */
  async resetTemplate(slug: string, adminId: string): Promise<EmailTemplateData | null> {
    const def = this.getDefinition(slug);
    if (!def) return null;

    await prisma.emailTemplate.deleteMany({ where: { slug } });

    // Invalidate cache
    settingsCache.invalidate(cacheKey(slug));

    logger.info('Email template reset to default', { slug, adminId });

    const defaultTemplate = def.getDefault({});
    return {
      id: '',
      slug: def.slug,
      name: def.name,
      description: def.description,
      subject: defaultTemplate.subject,
      htmlBody: defaultTemplate.html,
      textBody: defaultTemplate.text,
      variables: def.variables,
      isActive: false,
      updatedAt: new Date(),
    };
  }

  /**
   * Resolve a template for sending: DB override (if active) > code default.
   * Variables should be pre-formatted strings.
   * Returns null if no active DB override (caller should use code template).
   */
  async resolveTemplate(
    slug: string,
    variables: Record<string, string>
  ): Promise<{ subject: string; html: string; text: string } | null> {
    try {
      // Check cache first
      const cached = settingsCache.get<{
        subject: string;
        htmlBody: string;
        textBody: string;
        isActive: boolean;
      }>(cacheKey(slug));

      let template = cached;

      if (!template) {
        const db = await prisma.emailTemplate.findUnique({
          where: { slug },
          select: { subject: true, htmlBody: true, textBody: true, isActive: true },
        });

        if (db) {
          template = db;
          settingsCache.set(cacheKey(slug), db, CACHE_TTL.settings);
        }
      }

      if (!template || !template.isActive) {
        return null; // Use code default
      }

      // Replace {{variableName}} placeholders with sanitized values
      const subject = this.replaceVariables(template.subject, variables);
      const html = this.replaceVariables(template.htmlBody, variables);
      const text = this.replaceVariables(template.textBody, variables);

      return { subject, html, text };
    } catch (error) {
      logger.warn('Failed to resolve email template from DB, falling back to code default', {
        slug,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Preview a template with sample variables (without saving)
   */
  previewTemplate(
    slug: string,
    subject: string,
    htmlBody: string,
    textBody: string
  ): { subject: string; html: string; text: string } | null {
    const def = this.getDefinition(slug);
    if (!def) return null;

    const sampleVars = this.getSampleVariables(slug);
    return {
      subject: this.replaceVariables(subject, sampleVars),
      html: this.replaceVariables(htmlBody, sampleVars),
      text: this.replaceVariables(textBody, sampleVars),
    };
  }

  /**
   * Seed all template definitions into the database (if not already present)
   */
  async seedDefaults(adminId?: string): Promise<number> {
    let seeded = 0;

    for (const def of TEMPLATE_DEFINITIONS) {
      const existing = await prisma.emailTemplate.findUnique({ where: { slug: def.slug } });
      if (existing) continue;

      const defaultTemplate = def.getDefault({});

      await prisma.emailTemplate.create({
        data: {
          slug: def.slug,
          name: def.name,
          description: def.description,
          subject: defaultTemplate.subject,
          htmlBody: defaultTemplate.html,
          textBody: defaultTemplate.text,
          variables: def.variables,
          isActive: false, // Inactive by default - uses code template
          updatedBy: adminId,
        },
      });

      seeded++;
    }

    if (seeded > 0) {
      logger.info('Email templates seeded', { count: seeded });
    }

    return seeded;
  }

  // ── Private Helpers ──────────────────────────────────────────

  /**
   * Replace {{variableName}} placeholders with sanitized values
   */
  private replaceVariables(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, varName: string) => {
      const value = variables[varName];
      if (value === undefined) return `{{${varName}}}`;
      return escapeHtml(value);
    });
  }

  /**
   * Get sample variables for preview
   */
  private getSampleVariables(slug: string): Record<string, string> {
    const samples: Record<string, Record<string, string>> = {
      'otp-verification': { otp: '123456', expiresInMinutes: '10', appName: 'Messaging Platform' },
      'password-reset': { otp: '654321', expiresInMinutes: '10', appName: 'Messaging Platform' },
      'welcome': {
        userName: 'John Doe',
        userEmail: 'john@example.com',
        appName: 'Messaging Platform',
        dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${process.env.DEFAULT_LOCALE || 'en'}/dashboard`,
      },
      'subscription-activation': {
        userName: 'John Doe',
        tierName: 'PRO',
        startDate: new Date().toLocaleDateString('id-ID'),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString('id-ID'),
        orderId: 'ORD-12345',
        amount: 'Rp 100.000',
        durationLabel: '1 Bulan',
        appName: 'Messaging Platform',
      },
      'subscription-expiry-reminder': {
        userName: 'John Doe',
        tierName: 'PRO',
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('id-ID'),
        daysUntilExpiry: '7',
        appName: 'Messaging Platform',
      },
      'subscription-expired': {
        userName: 'John Doe',
        tierName: 'PRO',
        expiredDate: new Date().toLocaleDateString('id-ID'),
        appName: 'Messaging Platform',
      },
      'invitation': {
        businessOwnerName: 'Jane Smith',
        inviteeEmail: 'agent@example.com',
        invitationLink: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${process.env.DEFAULT_LOCALE || 'en'}/accept-invitation?token=sample-token`,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toLocaleDateString('en-US'),
        appName: 'Messaging Platform',
      },
      'token-refresh-failed': {
        wabaId: 'WABA-12345',
        businessName: 'Acme Corp',
        error: 'Token expired or revoked',
      },
      'quality-rating-drop': {
        phoneNumber: '+628123456789',
        oldRating: 'HIGH',
        newRating: 'MEDIUM',
        businessName: 'Acme Corp',
      },
      'webhook-subscription-failed': {
        wabaId: 'WABA-12345',
        businessName: 'Acme Corp',
        error: 'Connection timeout',
        attemptCount: '3',
      },
      'waba-disconnected': {
        wabaId: 'WABA-12345',
        businessName: 'Acme Corp',
        reason: 'Token revoked by user',
      },
      'webhook-endpoint-disabled': {
        endpointName: 'My Webhook',
        endpointUrl: 'https://example.com/webhook',
        userName: 'John Doe',
      },
      'api-key-expiring': {
        keyName: 'Production API Key',
        keyPrefix: 'kc_live_abc',
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        daysUntilExpiry: '7',
        userName: 'John Doe',
      },
    };

    return samples[slug] || {};
  }
}

// Export singleton
export const emailTemplateService = new EmailTemplateService();
