/**
 * Welcome Email Template
 *
 * Generates HTML and plain text email content for welcoming new users
 *
 * Design: Clean, minimalist, professional
 */

import { escapeHtml } from '../../../utils/sanitize.js';

export interface WelcomeEmailParams {
  /** User's name */
  userName: string;
  /** User's email address */
  userEmail: string;
  /** Application name */
  appName?: string;
  /** Dashboard URL */
  dashboardUrl?: string;
  /** Support email (optional, rendered only if provided) */
  supportEmail?: string;
}

export interface WelcomeEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Generate welcome email template
 * All user-provided content is sanitized before inclusion
 */
export function welcomeEmailTemplate(params: WelcomeEmailParams): WelcomeEmailTemplate {
  const {
    userName,
    userEmail,
    appName = 'Messaging Platform',
    dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${process.env.DEFAULT_LOCALE || 'en'}/dashboard`,
    supportEmail = process.env.SUPPORT_EMAIL || '',
  } = params;

  // Sanitize inputs
  const sanitizedUserName = escapeHtml(userName);
  const sanitizedUserEmail = escapeHtml(userEmail);
  const sanitizedAppName = escapeHtml(appName);
  const sanitizedSupportEmail = escapeHtml(supportEmail);

  const subject = `Selamat Datang di ${sanitizedAppName}`;

  const supportHtml = sanitizedSupportEmail
    ? `
              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

              <!-- Support -->
              <p style="margin: 0; font-size: 13px; color: #888; line-height: 1.6;">
                Butuh bantuan? Hubungi kami di <a href="mailto:${sanitizedSupportEmail}" style="color: #2563eb; text-decoration: none;">${sanitizedSupportEmail}</a>
              </p>`
    : '';

  const supportText = sanitizedSupportEmail
    ? `

---

Butuh bantuan? Hubungi kami di ${sanitizedSupportEmail}`
    : '';

  const html = `
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Selamat Datang di ${sanitizedAppName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #ffffff;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse;">
          <!-- Header -->
          <tr>
            <td style="padding-bottom: 32px; text-align: center;">
              <h1 style="margin: 0; font-size: 20px; font-weight: 600; color: #1a1a1a;">${sanitizedAppName}</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td>
              <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600; color: #1a1a1a;">
                Selamat Datang, ${sanitizedUserName}!
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #555;">
                Terima kasih telah bergabung dengan ${sanitizedAppName}. Akun Anda telah berhasil dibuat.
              </p>

              <!-- Account Info -->
              <p style="margin: 0 0 24px; font-size: 14px; color: #666;">
                <strong>Email:</strong> ${sanitizedUserEmail}
              </p>

              <!-- Divider -->
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">

              <!-- Getting Started -->
              <p style="margin: 0 0 12px; font-size: 15px; font-weight: 600; color: #1a1a1a;">
                Langkah Selanjutnya:
              </p>
              <ol style="margin: 0 0 24px; padding-left: 20px; font-size: 14px; color: #555; line-height: 1.8;">
                <li>Hubungkan WhatsApp Business Account</li>
                <li>Buat template pesan pertama</li>
                <li>Mulai kirim pesan ke pelanggan</li>
              </ol>

              <!-- Dashboard Link -->
              <p style="margin: 0 0 8px; font-size: 14px; color: #666;">
                Akses dashboard:
              </p>
              <p style="margin: 0 0 24px; font-size: 14px;">
                <a href="${dashboardUrl}" style="color: #2563eb; text-decoration: none;">${dashboardUrl}</a>
              </p>${supportHtml}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top: 32px;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                © ${new Date().getFullYear()} ${sanitizedAppName}
              </p>
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
${sanitizedAppName}

Selamat Datang, ${sanitizedUserName}!

Terima kasih telah bergabung dengan ${sanitizedAppName}. Akun Anda telah berhasil dibuat.

Email: ${sanitizedUserEmail}

---

Langkah Selanjutnya:
1. Hubungkan WhatsApp Business Account
2. Buat template pesan pertama
3. Mulai kirim pesan ke pelanggan

Akses dashboard: ${dashboardUrl}${supportText}

© ${new Date().getFullYear()} ${sanitizedAppName}
`.trim();

  return { subject, html, text };
}
