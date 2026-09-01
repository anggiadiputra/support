import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { EmailProvider, EmailSendOptions, EmailSendResult, SMTPConfig } from './types.js';
import { logger } from '../../../utils/logger.js';

/**
 * Generic SMTP Provider
 * 
 * Works with any SMTP service:
 * - Brevo (smtp-relay.brevo.com)
 * - SendGrid (smtp.sendgrid.net)
 * - Mailgun (smtp.mailgun.org)
 * - AWS SES (email-smtp.{region}.amazonaws.com)
 * - Gmail (smtp.gmail.com)
 * - Any other SMTP server
 */
export class SMTPProvider implements EmailProvider {
  readonly name = 'smtp';
  private transporter: Transporter | null = null;
  private config: SMTPConfig;

  constructor(config: SMTPConfig) {
    this.config = config;
    this.initializeTransporter();
  }

  /**
   * Initialize or reinitialize the transporter with current config
   */
  private initializeTransporter(): void {
    if (this.isConfigured()) {
      this.transporter = nodemailer.createTransport({
        host: this.config.host,
        port: this.config.port,
        secure: this.config.secure ?? this.config.port === 465,
        auth: {
          user: this.config.user,
          pass: this.config.password,
        },
      });
    } else {
      this.transporter = null;
    }
  }

  /**
   * Update configuration and reinitialize transporter
   * Used when settings are updated from database
   */
  updateConfig(config: SMTPConfig): void {
    this.config = config;
    this.initializeTransporter();
    logger.info('SMTP provider configuration updated');
  }

  /**
   * Get current configuration (for comparison)
   */
  getConfig(): SMTPConfig {
    return { ...this.config };
  }

  /**
   * Check if SMTP is properly configured
   */
  isConfigured(): boolean {
    return !!(
      this.config.host &&
      this.config.port &&
      this.config.user &&
      this.config.password &&
      this.config.fromEmail
    );
  }


  /**
   * Send email with retry logic
   * 
   * @param options - Email send options
   * @param retryCount - Current retry attempt (internal)
   */
  async send(options: EmailSendOptions, retryCount = 0): Promise<EmailSendResult> {
    const maxRetries = 3;
    
    if (!this.transporter) {
      logger.error('SMTP provider not configured');
      return {
        success: false,
        error: 'SMTP provider not configured',
      };
    }

    try {
      const mailOptions = {
        from: `"${this.config.fromName}" <${this.config.fromEmail}>`,
        to: options.to,
        subject: options.subject,
        html: options.html,
        text: options.text,
        replyTo: options.replyTo,
        headers: {
          // Disable Brevo/Sendinblue click and open tracking
          // This prevents links from being wrapped with tracking URLs
          'X-Mailin-Track-Click': '0',
          'X-Mailin-Track-Open': '0',
        },
      };

      const info = await this.transporter.sendMail(mailOptions);

      logger.info('Email sent successfully', {
        provider: this.name,
        to: options.to,
        subject: options.subject,
        messageId: info.messageId,
      });

      return {
        success: true,
        messageId: info.messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      logger.error('Failed to send email', {
        provider: this.name,
        to: options.to,
        subject: options.subject,
        error: errorMessage,
        retryCount,
      });

      // Retry with exponential backoff
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
        logger.info(`Retrying email send in ${delay}ms`, {
          attempt: retryCount + 1,
          maxRetries,
        });
        
        await this.sleep(delay);
        return this.send(options, retryCount + 1);
      }

      return {
        success: false,
        error: `Failed after ${maxRetries} retries: ${errorMessage}`,
      };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Create SMTP provider from environment variables
 */
export function createSMTPProviderFromEnv(): SMTPProvider {
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  // SMTP_SECURE explicit override wins; otherwise auto-detect based on port:
  //  - 465 = implicit TLS (secure=true)
  //  - 587/25 = STARTTLS (secure=false)
  // Previously this always defaulted to `false` when SMTP_SECURE was unset,
  // which broke port 465 providers (nodemailer would attempt plaintext
  // handshake against a TLS-only port → "Greeting never received").
  const secure = process.env.SMTP_SECURE !== undefined
    ? process.env.SMTP_SECURE === 'true'
    : port === 465;

  return new SMTPProvider({
    host: process.env.SMTP_HOST || '',
    port,
    user: process.env.SMTP_USER || '',
    password: process.env.SMTP_PASSWORD || '',
    fromEmail: process.env.SMTP_FROM_EMAIL || '',
    fromName: process.env.SMTP_FROM_NAME || process.env.APP_NAME || 'Messaging Platform',
    secure,
  });
}
