/**
 * Subscription Activation Email Template
 * 
 * Generates HTML and plain text email content for subscription activation confirmation
 * Requirements: 7.4 - Send email notification to user confirming subscription activation
 */

import { escapeHtml } from '../../../utils/sanitize.js';

export interface SubscriptionActivationParams {
  /** User's name */
  userName: string;
  /** Subscription tier (LITE or PRO) */
  tierName: string;
  /** Subscription start date */
  startDate: Date;
  /** Subscription end date */
  endDate: Date;
  /** Order ID for reference */
  orderId: string;
  /** Amount paid in IDR */
  amount: number;
  /** Application name */
  appName?: string;
  /** Duration in days (30, 90, 180, or 365) */
  durationDays?: number;
  /** Human-readable duration label (e.g., "1 Bulan", "3 Bulan") */
  durationLabel?: string;
  /** Support email address (rendered only if provided) */
  supportEmail?: string;
}

export interface SubscriptionActivationTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Format date to Indonesian locale string
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Format amount to Indonesian Rupiah
 */
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Generate subscription activation email template
 * All user-provided content is sanitized before inclusion
 */
export function subscriptionActivationTemplate(
  params: SubscriptionActivationParams
): SubscriptionActivationTemplate {
  const {
    userName,
    tierName,
    startDate,
    endDate,
    orderId,
    amount,
    appName = process.env.APP_NAME || 'Messaging Platform',
    durationDays = 30,
    durationLabel = '1 Bulan',
    supportEmail = process.env.SUPPORT_EMAIL || '',
  } = params;
  const sanitizedSupportEmail = supportEmail ? escapeHtml(supportEmail) : '';

  // Sanitize inputs
  const sanitizedUserName = escapeHtml(userName);
  const sanitizedTierName = escapeHtml(tierName);
  const sanitizedOrderId = escapeHtml(orderId);
  const sanitizedAppName = escapeHtml(appName);
  const sanitizedDurationLabel = escapeHtml(durationLabel);
  const formattedStartDate = formatDate(startDate);
  const formattedEndDate = formatDate(endDate);
  const formattedAmount = formatCurrency(amount);

  const subject = `Subscription ${sanitizedTierName} Aktif - ${sanitizedAppName}`;

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Subscription Aktif</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 520px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">${sanitizedAppName}</h1>
            </td>
          </tr>
          
          <!-- Success Icon -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <div style="width: 64px; height: 64px; margin: 0 auto; background-color: #10b981; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 24px; color: #ffffff; font-weight: bold;">&#10003;</span>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #1a1a1a; text-align: center;">
                Subscription Berhasil Diaktifkan!
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #666; text-align: center;">
                Halo ${sanitizedUserName}, terima kasih telah berlangganan ${sanitizedAppName}!
              </p>
              
              <!-- Subscription Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                <h3 style="margin: 0 0 16px; font-size: 16px; font-weight: 600; color: #1a1a1a;">
                  Detail Subscription
                </h3>
                <table style="width: 100%; border-collapse: collapse;">
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666;">Paket</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1a1a1a; font-weight: 600; text-align: right;">
                      <span style="background-color: #3b82f6; color: #ffffff; padding: 4px 12px; border-radius: 4px; font-size: 12px;">
                        ${sanitizedTierName}
                      </span>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666; border-top: 1px solid #e5e7eb;">Durasi</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1a1a1a; text-align: right; border-top: 1px solid #e5e7eb;">${sanitizedDurationLabel}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666; border-top: 1px solid #e5e7eb;">Tanggal Mulai</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1a1a1a; text-align: right; border-top: 1px solid #e5e7eb;">${formattedStartDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666; border-top: 1px solid #e5e7eb;">Tanggal Berakhir</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1a1a1a; text-align: right; border-top: 1px solid #e5e7eb;">${formattedEndDate}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666; border-top: 1px solid #e5e7eb;">Total Pembayaran</td>
                    <td style="padding: 8px 0; font-size: 14px; color: #1a1a1a; font-weight: 600; text-align: right; border-top: 1px solid #e5e7eb;">${formattedAmount}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-size: 14px; color: #666; border-top: 1px solid #e5e7eb;">Order ID</td>
                    <td style="padding: 8px 0; font-size: 12px; color: #888; text-align: right; border-top: 1px solid #e5e7eb; font-family: 'Courier New', monospace;">${sanitizedOrderId}</td>
                  </tr>
                </table>
              </div>
              
              <p style="margin: 0; font-size: 14px; color: #666; text-align: center; line-height: 1.6;">
                Anda sekarang dapat menikmati semua fitur ${sanitizedTierName}.<br>
                Subscription akan diperpanjang otomatis sebelum tanggal berakhir.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #999; text-align: center;">
                Simpan email ini sebagai bukti pembayaran.
              </p>
              ${sanitizedSupportEmail ? `<p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                Jika ada pertanyaan, hubungi ${sanitizedSupportEmail}
              </p>` : ''}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  const text = `
${sanitizedAppName} - Subscription Berhasil Diaktifkan!

Halo ${sanitizedUserName},

Terima kasih telah berlangganan ${sanitizedAppName}!

Detail Subscription:
- Paket: ${sanitizedTierName}
- Durasi: ${sanitizedDurationLabel}
- Tanggal Mulai: ${formattedStartDate}
- Tanggal Berakhir: ${formattedEndDate}
- Total Pembayaran: ${formattedAmount}
- Order ID: ${sanitizedOrderId}

Anda sekarang dapat menikmati semua fitur ${sanitizedTierName}.
Subscription akan diperpanjang otomatis sebelum tanggal berakhir.

Simpan email ini sebagai bukti pembayaran.${sanitizedSupportEmail ? `\nJika ada pertanyaan, hubungi ${sanitizedSupportEmail}` : ''}

Ini adalah pesan otomatis. Jangan balas email ini.
`.trim();

  return { subject, html, text };
}
