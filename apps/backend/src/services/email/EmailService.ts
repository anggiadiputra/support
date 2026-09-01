import { logger } from '../../utils/logger.js';
import type { EmailNotificationData, EmailNotificationType } from './types.js';
import type { EmailProvider, EmailSendOptions, EmailSendResult, SMTPConfig } from './providers/types.js';
import { SMTPProvider, createSMTPProviderFromEnv } from './providers/smtp-provider.js';
import { otpVerificationTemplate } from './templates/index.js';
import { passwordResetTemplate } from './templates/password-reset.js';
import {
  tokenRefreshFailedTemplate,
  qualityRatingDropTemplate,
  webhookSubscriptionFailedTemplate,
  wabaDisconnectedTemplate,
  webhookEndpointDisabledTemplate,
  apiKeyExpiringTemplate,
  subscriptionActivationTemplate,
  subscriptionExpiryReminderTemplate,
  subscriptionExpiredTemplate,
  welcomeEmailTemplate
} from './templates/index.js';
import { settingsCache, CACHE_KEYS, CACHE_TTL } from '../settings-cache.js';
import type { SmtpSettings } from '../../types/admin-settings.js';
import { emailTemplateService } from './email-template-service.js';

/**
 * EmailService
 * 
 * Facade for sending emails through provider-agnostic interface.
 * Supports any SMTP provider (Brevo, SendGrid, Mailgun, AWS SES, etc.)
 * 
 * Settings Priority:
 * 1. Database settings (cached with TTL)
 * 2. Environment variables (.env fallback)
 * 
 * Requirements: 3.4, 6.3 - Check database first, fallback to .env, cache with TTL
 */
/**
 * Default application name shown in emails when no explicit appName is provided.
 * Falls back to "Messaging Platform" so emails stay brand-agnostic.
 */
const DEFAULT_APP_NAME = process.env.APP_NAME || 'Messaging Platform';

/**
 * Default locale prefix for links in emails (next-intl uses localePrefix: 'always').
 */
const DEFAULT_LOCALE = process.env.DEFAULT_LOCALE || 'en';

/**
 * Default dashboard URL used in emails when no explicit URL is provided.
 * Includes locale prefix because frontend always requires /en or /id.
 */
const DEFAULT_DASHBOARD_URL = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${DEFAULT_LOCALE}/dashboard`;

/**
 * Default sender email used when neither SMTP_FROM_EMAIL nor EMAIL_FROM is set.
 */
const DEFAULT_FROM_EMAIL = 'no-reply@example.com';

export class EmailService {
  private provider: SMTPProvider | null = null;
  private enabled: boolean;
  private fromEmail: string;
  private adminEmails: string[];
  private lastConfigHash: string = '';

  constructor() {
    this.enabled = process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true';
    this.fromEmail = process.env.SMTP_FROM_EMAIL || process.env.EMAIL_FROM || DEFAULT_FROM_EMAIL;
    this.adminEmails = process.env.ADMIN_EMAILS?.split(',') || [];
    
    // Auto-detect and initialize provider from env (will be updated from DB on first use)
    this.provider = this.initializeProvider();
  }

  /**
   * Initialize email provider from environment variables
   */
  private initializeProvider(): SMTPProvider | null {
    // Try SMTP provider first (most common)
    const smtpProvider = createSMTPProviderFromEnv();
    
    if (smtpProvider.isConfigured()) {
      logger.info('Email service initialized with SMTP provider from env');
      this.lastConfigHash = this.hashConfig(smtpProvider.getConfig());
      return smtpProvider;
    }

    logger.warn('No email provider configured. Email sending will be disabled.');
    return null;
  }

  /**
   * Generate a hash of the config for comparison
   */
  private hashConfig(config: SMTPConfig): string {
    return `${config.host}:${config.port}:${config.user}:${config.fromEmail}`;
  }

  /**
   * Refresh SMTP settings from database with caching
   * Requirements: 3.4, 6.3
   */
  private async refreshSettingsFromDb(): Promise<void> {
    try {
      // Check cache first
      const cachedSettings = settingsCache.get<SmtpSettings>(CACHE_KEYS.smtp());
      
      if (cachedSettings) {
        // Update provider if config changed
        const newConfig = this.smtpSettingsToConfig(cachedSettings);
        const newHash = this.hashConfig(newConfig);
        
        if (newHash !== this.lastConfigHash) {
          this.updateProviderConfig(newConfig);
          this.lastConfigHash = newHash;
        }
        return;
      }

      // Fetch from database using dynamic import to avoid circular dependency
      const { adminSettingsService } = await import('../admin/settings-service.js');
      const response = await adminSettingsService.getSettings<SmtpSettings>('smtp', false);
      
      // Cache the settings
      settingsCache.set(CACHE_KEYS.smtp(), response.data, CACHE_TTL.settings);
      
      // Update provider config
      const newConfig = this.smtpSettingsToConfig(response.data);
      const newHash = this.hashConfig(newConfig);
      
      if (newHash !== this.lastConfigHash) {
        this.updateProviderConfig(newConfig);
        this.lastConfigHash = newHash;
        logger.info('SMTP settings refreshed from database', { source: response.source });
      }
    } catch (error) {
      logger.warn('Failed to refresh SMTP settings from database, using current config', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Continue with existing provider config (env fallback)
    }
  }

  /**
   * Convert SmtpSettings to SMTPConfig
   */
  private smtpSettingsToConfig(settings: SmtpSettings): SMTPConfig {
    return {
      host: settings.host || '',
      port: settings.port || 587,
      user: settings.user || '',
      password: settings.password || '',
      fromEmail: settings.fromEmail || '',
      fromName: settings.fromName || DEFAULT_APP_NAME,
      secure: settings.secure ?? false,
    };
  }

  /**
   * Update provider configuration
   */
  private updateProviderConfig(config: SMTPConfig): void {
    if (!this.provider) {
      this.provider = new SMTPProvider(config);
    } else {
      this.provider.updateConfig(config);
    }
    
    // Update fromEmail for notifications
    if (config.fromEmail) {
      this.fromEmail = config.fromEmail;
    }
  }

  /**
   * Get current provider name
   */
  getProviderName(): string {
    return this.provider?.name || 'none';
  }


  /**
   * Check if email service is ready to send
   */
  isReady(): boolean {
    return this.provider !== null && this.provider.isConfigured();
  }

  /**
   * Check if email service is ready (async version that refreshes from DB)
   */
  async isReadyAsync(): Promise<boolean> {
    await this.refreshSettingsFromDb();
    return this.isReady();
  }

  /**
   * Send a generic email
   * Refreshes settings from database before sending
   * Requirements: 3.4, 6.3
   */
  async send(options: EmailSendOptions): Promise<EmailSendResult> {
    // Refresh settings from database (with caching)
    await this.refreshSettingsFromDb();

    if (!this.provider || !this.provider.isConfigured()) {
      logger.warn('Email provider not configured, skipping send', {
        to: options.to,
        subject: options.subject,
      });
      return { success: false, error: 'Email provider not configured' };
    }

    return this.provider.send(options);
  }

  /**
   * Invalidate settings cache (call when settings are updated)
   */
  invalidateCache(): void {
    settingsCache.invalidate(CACHE_KEYS.smtp());
    logger.info('SMTP settings cache invalidated');
  }

  /**
   * Send OTP verification email
   * 
   * @param params - OTP email parameters
   */
  async sendOTPEmail(params: {
    to: string;
    otp: string;
    expiresInMinutes: number;
    appName?: string;
  }): Promise<EmailSendResult> {
    // Try DB template override
    const dbTemplate = await emailTemplateService.resolveTemplate('otp-verification', {
      otp: params.otp,
      expiresInMinutes: String(params.expiresInMinutes),
      appName: params.appName || DEFAULT_APP_NAME,
    });
    if (dbTemplate) {
      return this.send({ to: params.to, ...dbTemplate });
    }

    const template = otpVerificationTemplate({
      otp: params.otp,
      expiresInMinutes: params.expiresInMinutes,
      appName: params.appName,
    });

    return this.send({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send password reset OTP email
   */
  async sendPasswordResetEmail(params: {
    to: string;
    otp: string;
    expiresInMinutes: number;
    appName?: string;
  }): Promise<EmailSendResult> {
    const dbTemplate = await emailTemplateService.resolveTemplate('password-reset', {
      otp: params.otp,
      expiresInMinutes: String(params.expiresInMinutes),
      appName: params.appName || DEFAULT_APP_NAME,
    });
    if (dbTemplate) {
      return this.send({ to: params.to, ...dbTemplate });
    }

    const template = passwordResetTemplate({
      otp: params.otp,
      expiresInMinutes: params.expiresInMinutes,
      appName: params.appName,
    });

    return this.send({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send email notification (legacy method for backward compatibility)
   */
  async sendNotification(data: EmailNotificationData): Promise<void> {
    if (!this.enabled) {
      logger.info('Email notifications disabled, skipping email', {
        type: data.type,
        recipient: data.recipient,
        subject: data.subject,
      });
      return;
    }

    try {
      if (this.provider) {
        const result = await this.provider.send({
          to: data.recipient,
          subject: data.subject,
          html: data.body,
        });

        if (!result.success) {
          logger.error('Failed to send email notification', {
            type: data.type,
            recipient: data.recipient,
            error: result.error,
          });
        }
      } else {
        // Fallback: just log the email
        logger.info('Email notification (no provider)', {
          type: data.type,
          from: this.fromEmail,
          recipient: data.recipient,
          subject: data.subject,
          metadata: data.metadata,
        });
      }
    } catch (error) {
      logger.error('Failed to send email notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
        type: data.type,
        recipient: data.recipient,
      });
    }
  }


  /**
   * Send token refresh failure notification
   */
  async sendTokenRefreshFailure(
    wabaId: string,
    businessName: string,
    error: string,
    adminEmail: string
  ): Promise<void> {
    const dbTemplate = await emailTemplateService.resolveTemplate('token-refresh-failed', {
      wabaId, businessName, error,
    });
    if (dbTemplate) {
      await this.sendNotification({
        type: 'token_refresh_failed',
        recipient: adminEmail,
        subject: dbTemplate.subject,
        body: dbTemplate.html,
        metadata: { wabaId, businessName, error },
      });
      return;
    }

    const { subject, body } = tokenRefreshFailedTemplate({ wabaId, businessName, error });

    await this.sendNotification({
      type: 'token_refresh_failed',
      recipient: adminEmail,
      subject,
      body,
      metadata: { wabaId, businessName, error },
    });
  }

  /**
   * Send quality rating drop notification
   */
  async sendQualityRatingDrop(
    phoneNumber: string,
    oldRating: string,
    newRating: string,
    businessName: string,
    adminEmail: string
  ): Promise<void> {
    const dbTemplate = await emailTemplateService.resolveTemplate('quality-rating-drop', {
      phoneNumber, oldRating, newRating, businessName,
    });
    if (dbTemplate) {
      await this.sendNotification({
        type: 'quality_rating_dropped',
        recipient: adminEmail,
        subject: dbTemplate.subject,
        body: dbTemplate.html,
        metadata: { phoneNumber, oldRating, newRating, businessName },
      });
      return;
    }

    const { subject, body } = qualityRatingDropTemplate({
      phoneNumber,
      oldRating,
      newRating,
      businessName
    });

    await this.sendNotification({
      type: 'quality_rating_dropped',
      recipient: adminEmail,
      subject,
      body,
      metadata: { phoneNumber, oldRating, newRating, businessName },
    });
  }

  /**
   * Send webhook subscription failure notification to administrators
   */
  async sendWebhookSubscriptionFailure(
    wabaId: string,
    businessName: string,
    error: string,
    attemptCount: number
  ): Promise<void> {
    if (this.adminEmails.length === 0) {
      logger.warn('No admin emails configured for webhook failure notifications');
      return;
    }

    const dbTemplate = await emailTemplateService.resolveTemplate('webhook-subscription-failed', {
      wabaId, businessName, error, attemptCount: String(attemptCount),
    });

    const emailSubject = dbTemplate?.subject
      ?? webhookSubscriptionFailedTemplate({ wabaId, businessName, error, attemptCount }).subject;
    const emailBody = dbTemplate?.html
      ?? webhookSubscriptionFailedTemplate({ wabaId, businessName, error, attemptCount }).body;

    for (const adminEmail of this.adminEmails) {
      await this.sendNotification({
        type: 'webhook_subscription_failed',
        recipient: adminEmail,
        subject: emailSubject,
        body: emailBody,
        metadata: { wabaId, businessName, error, attemptCount },
      });
    }
  }

  /**
   * Send WABA disconnection notification
   */
  async sendWABADisconnected(
    wabaId: string,
    businessName: string,
    reason: string,
    adminEmail: string
  ): Promise<void> {
    const dbTemplate = await emailTemplateService.resolveTemplate('waba-disconnected', {
      wabaId, businessName, reason,
    });
    if (dbTemplate) {
      await this.sendNotification({
        type: 'waba_disconnected',
        recipient: adminEmail,
        subject: dbTemplate.subject,
        body: dbTemplate.html,
        metadata: { wabaId, businessName, reason },
      });
      return;
    }

    const { subject, body } = wabaDisconnectedTemplate({ wabaId, businessName, reason });

    await this.sendNotification({
      type: 'waba_disconnected',
      recipient: adminEmail,
      subject,
      body,
      metadata: { wabaId, businessName, reason },
    });
  }

  /**
   * Send webhook endpoint disabled notification
   */
  async sendWebhookEndpointDisabled(
    endpointName: string,
    endpointUrl: string,
    userName: string,
    userEmail: string
  ): Promise<void> {
    const dbTemplate = await emailTemplateService.resolveTemplate('webhook-endpoint-disabled', {
      endpointName, endpointUrl, userName,
    });
    if (dbTemplate) {
      await this.sendNotification({
        type: 'webhook_endpoint_disabled',
        recipient: userEmail,
        subject: dbTemplate.subject,
        body: dbTemplate.html,
        metadata: { endpointName, endpointUrl, userName },
      });
      return;
    }

    const { subject, body } = webhookEndpointDisabledTemplate({
      endpointName,
      endpointUrl,
      userName
    });

    await this.sendNotification({
      type: 'webhook_endpoint_disabled',
      recipient: userEmail,
      subject,
      body,
      metadata: { endpointName, endpointUrl, userName },
    });
  }

  /**
   * Send API key expiration notification
   */
  async sendApiKeyExpiring(
    keyName: string,
    keyPrefix: string,
    expiresAt: Date,
    daysUntilExpiry: number,
    userName: string,
    userEmail: string
  ): Promise<void> {
    const dbTemplate = await emailTemplateService.resolveTemplate('api-key-expiring', {
      keyName, keyPrefix,
      expiresAt: expiresAt.toISOString(),
      daysUntilExpiry: String(daysUntilExpiry),
      userName,
    });
    if (dbTemplate) {
      await this.sendNotification({
        type: 'api_key_expiring',
        recipient: userEmail,
        subject: dbTemplate.subject,
        body: dbTemplate.html,
        metadata: { keyName, keyPrefix, expiresAt, daysUntilExpiry, userName },
      });
      return;
    }

    const { subject, body } = apiKeyExpiringTemplate({
      keyName,
      keyPrefix,
      expiresAt,
      daysUntilExpiry,
      userName
    });

    await this.sendNotification({
      type: 'api_key_expiring',
      recipient: userEmail,
      subject,
      body,
      metadata: { keyName, keyPrefix, expiresAt, daysUntilExpiry, userName },
    });
  }

  /**
   * Send subscription activation email
   * Requirements: 7.4, 4.3 - Send email notification to user confirming subscription activation with duration info
   */
  async sendSubscriptionActivationEmail(params: {
    to: string;
    userName: string;
    tierName: string;
    startDate: Date;
    endDate: Date;
    orderId: string;
    amount: number;
    appName?: string;
    durationDays?: number;
    durationLabel?: string;
  }): Promise<EmailSendResult> {
    const formatDate = (d: Date) => d.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const formatCurrency = (n: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(n);

    const dbTemplate = await emailTemplateService.resolveTemplate('subscription-activation', {
      userName: params.userName,
      tierName: params.tierName,
      startDate: formatDate(params.startDate),
      endDate: formatDate(params.endDate),
      orderId: params.orderId,
      amount: formatCurrency(params.amount),
      durationLabel: params.durationLabel || '1 Bulan',
      appName: params.appName || DEFAULT_APP_NAME,
    });
    if (dbTemplate) {
      return this.send({ to: params.to, ...dbTemplate });
    }

    const template = subscriptionActivationTemplate({
      userName: params.userName,
      tierName: params.tierName,
      startDate: params.startDate,
      endDate: params.endDate,
      orderId: params.orderId,
      amount: params.amount,
      appName: params.appName,
      durationDays: params.durationDays,
      durationLabel: params.durationLabel,
    });

    return this.send({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send subscription expiry reminder email
   * Requirements: 11.2, 11.3 - Send reminder emails 7 days and 1 day before expiry
   */
  async sendSubscriptionExpiryReminderEmail(params: {
    to: string;
    userName: string;
    tierName: string;
    expiryDate: Date;
    daysUntilExpiry: number;
    appName?: string;
  }): Promise<EmailSendResult> {
    const dbTemplate = await emailTemplateService.resolveTemplate('subscription-expiry-reminder', {
      userName: params.userName,
      tierName: params.tierName,
      expiryDate: params.expiryDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      daysUntilExpiry: String(params.daysUntilExpiry),
      appName: params.appName || DEFAULT_APP_NAME,
    });
    if (dbTemplate) {
      return this.send({ to: params.to, ...dbTemplate });
    }

    const template = subscriptionExpiryReminderTemplate({
      userName: params.userName,
      tierName: params.tierName,
      expiryDate: params.expiryDate,
      daysUntilExpiry: params.daysUntilExpiry,
      appName: params.appName,
    });

    return this.send({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send subscription expired email
   * Requirements: 11.4 - Notify user when subscription expires and account is downgraded
   */
  async sendSubscriptionExpiredEmail(params: {
    to: string;
    userName: string;
    tierName: string;
    expiredDate: Date;
    appName?: string;
  }): Promise<EmailSendResult> {
    const dbTemplate = await emailTemplateService.resolveTemplate('subscription-expired', {
      userName: params.userName,
      tierName: params.tierName,
      expiredDate: params.expiredDate.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      appName: params.appName || DEFAULT_APP_NAME,
    });
    if (dbTemplate) {
      return this.send({ to: params.to, ...dbTemplate });
    }

    const template = subscriptionExpiredTemplate({
      userName: params.userName,
      tierName: params.tierName,
      expiredDate: params.expiredDate,
      appName: params.appName,
    });

    return this.send({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }

  /**
   * Send welcome email to new users
   */
  async sendWelcomeEmail(params: {
    to: string;
    userName: string;
    appName?: string;
    dashboardUrl?: string;
  }): Promise<EmailSendResult> {
    const dbTemplate = await emailTemplateService.resolveTemplate('welcome', {
      userName: params.userName,
      userEmail: params.to,
      appName: params.appName || DEFAULT_APP_NAME,
      dashboardUrl: params.dashboardUrl || DEFAULT_DASHBOARD_URL,
    });
    if (dbTemplate) {
      return this.send({ to: params.to, ...dbTemplate });
    }

    const template = welcomeEmailTemplate({
      userName: params.userName,
      userEmail: params.to,
      appName: params.appName,
      dashboardUrl: params.dashboardUrl,
    });

    return this.send({
      to: params.to,
      subject: template.subject,
      html: template.html,
      text: template.text,
    });
  }
}

// Export singleton instance
export const emailService = new EmailService();
