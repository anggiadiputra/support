/**
 * Subscription Expiry Reminder Email Template
 * 
 * Generates HTML and plain text email content for subscription expiry reminders
 * Requirements: 11.2, 11.3 - Send reminder emails 7 days and 1 day before expiry
 */

import { escapeHtml } from '../../../utils/sanitize.js';

export interface SubscriptionExpiryReminderParams {
  /** User's name */
  userName: string;
  /** Subscription tier (LITE or PRO) */
  tierName: string;
  /** Subscription expiry date */
  expiryDate: Date;
  /** Days until expiry (7 or 1) */
  daysUntilExpiry: number;
  /** Application name */
  appName?: string;
  /** Support email address (rendered only if provided) */
  supportEmail?: string;
}

export interface SubscriptionExpiryReminderTemplate {
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
 * Generate subscription expiry reminder email template
 * All user-provided content is sanitized before inclusion
 */
export function subscriptionExpiryReminderTemplate(
  params: SubscriptionExpiryReminderParams
): SubscriptionExpiryReminderTemplate {
  const {
    userName,
    tierName,
    expiryDate,
    daysUntilExpiry,
    appName = process.env.APP_NAME || 'Messaging Platform',
    supportEmail = process.env.SUPPORT_EMAIL || '',
  } = params;
  const locale = process.env.DEFAULT_LOCALE || 'en';
  const subscriptionUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${locale}/subscription`;
  const sanitizedSupportEmail = supportEmail ? escapeHtml(supportEmail) : '';

  // Sanitize inputs
  const sanitizedUserName = escapeHtml(userName);
  const sanitizedTierName = escapeHtml(tierName);
  const sanitizedAppName = escapeHtml(appName);
  const formattedExpiryDate = formatDate(expiryDate);

  // Determine urgency level for styling
  const isUrgent = daysUntilExpiry <= 1;
  const urgencyColor = isUrgent ? '#ef4444' : '#f59e0b'; // Red for 1 day, amber for 7 days
  const urgencyText = isUrgent ? 'Besok' : `${daysUntilExpiry} Hari Lagi`;

  const subject = isUrgent
    ? `Subscription ${sanitizedTierName} Berakhir Besok - ${sanitizedAppName}`
    : `Pengingat: Subscription ${sanitizedTierName} Berakhir ${daysUntilExpiry} Hari Lagi - ${sanitizedAppName}`;

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pengingat Subscription</title>
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
          
          <!-- Warning Icon -->
          <tr>
            <td style="padding: 32px 32px 16px; text-align: center;">
              <div style="width: 64px; height: 64px; margin: 0 auto; background-color: ${urgencyColor}; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                <span style="font-size: 24px; color: #ffffff; font-weight: bold;">!</span>
              </div>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 0 32px 32px;">
              <h2 style="margin: 0 0 16px; font-size: 22px; font-weight: 600; color: #1a1a1a; text-align: center;">
                Subscription Akan Berakhir ${urgencyText}
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #666; text-align: center;">
                Halo ${sanitizedUserName}, subscription ${sanitizedTierName} Anda akan berakhir pada:
              </p>
              
              <!-- Expiry Date Box -->
              <div style="background-color: #fef3c7; border: 1px solid ${urgencyColor}; border-radius: 8px; padding: 20px; margin-bottom: 24px; text-align: center;">
                <p style="margin: 0; font-size: 18px; font-weight: 600; color: ${urgencyColor};">
                  ${formattedExpiryDate}
                </p>
              </div>
              
              <!-- Info Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 12px; font-size: 14px; color: #666; line-height: 1.6;">
                  Setelah subscription berakhir:
                </p>
                <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #666; line-height: 1.8;">
                  <li>Akun Anda akan otomatis di-downgrade ke paket FREE</li>
                  <li>Fitur premium tidak akan tersedia</li>
                  <li>Data Anda tetap aman dan tersimpan</li>
                </ul>
              </div>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin-bottom: 24px;">
                <a href="${subscriptionUrl}"
                   style="display: inline-block; background-color: #3b82f6; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 16px; font-weight: 600;">
                  Perpanjang Sekarang
                </a>
              </div>
              
              <p style="margin: 0; font-size: 14px; color: #888; text-align: center; line-height: 1.6;">
                Perpanjang subscription Anda untuk terus menikmati semua fitur ${sanitizedTierName}.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0 0 8px; font-size: 12px; color: #999; text-align: center;">
                Jika Anda sudah memperpanjang, abaikan email ini.
              </p>
              ${sanitizedSupportEmail ? `<p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                Butuh bantuan? Hubungi ${sanitizedSupportEmail}
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
${sanitizedAppName} - Pengingat Subscription

Halo ${sanitizedUserName},

Subscription ${sanitizedTierName} Anda akan berakhir ${urgencyText} pada:
${formattedExpiryDate}

Setelah subscription berakhir:
- Akun Anda akan otomatis di-downgrade ke paket FREE
- Fitur premium tidak akan tersedia
- Data Anda tetap aman dan tersimpan

Perpanjang subscription Anda sekarang untuk terus menikmati semua fitur ${sanitizedTierName}:
${subscriptionUrl}

Jika Anda sudah memperpanjang, abaikan email ini.${sanitizedSupportEmail ? `\nButuh bantuan? Hubungi ${sanitizedSupportEmail}` : ''}

Ini adalah pesan otomatis. Jangan balas email ini.
`.trim();

  return { subject, html, text };
}
