/**
 * OTP Verification Email Template
 * 
 * Generates HTML and plain text email content for OTP verification
 */

import { escapeHtml, sanitizeOTP } from '../../../utils/sanitize.js';

export interface OTPVerificationParams {
  /** The 6-digit OTP code */
  otp: string;
  /** Minutes until OTP expires */
  expiresInMinutes: number;
  /** Application name */
  appName?: string;
}

export interface OTPVerificationTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Generate OTP verification email template
 * All user-provided content is sanitized before inclusion
 */
export function otpVerificationTemplate(params: OTPVerificationParams): OTPVerificationTemplate {
  const { otp, expiresInMinutes, appName = process.env.APP_NAME || 'Messaging Platform' } = params;
  
  // Sanitize inputs before including in template
  const sanitizedOTP = sanitizeOTP(otp) || escapeHtml(otp);
  const sanitizedAppName = escapeHtml(appName);
  const safeExpiry = Math.max(1, Math.min(60, Number(expiresInMinutes) || 10));

  const subject = `Your verification code: ${sanitizedOTP}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Verification Code</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 100%; max-width: 480px; border-collapse: collapse; background-color: #ffffff; border-radius: 12px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="padding: 32px 32px 24px; text-align: center; border-bottom: 1px solid #eee;">
              <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #1a1a1a;">${sanitizedAppName}</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a; text-align: center;">
                Verify your email
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #666; text-align: center;">
                Enter this code to complete your registration:
              </p>
              
              <!-- OTP Code Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
                <span style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #1a1a1a; font-family: 'Courier New', monospace;">
                  ${sanitizedOTP}
                </span>
              </div>
              
              <p style="margin: 0 0 8px; font-size: 14px; color: #888; text-align: center;">
                This code will expire in <strong>${safeExpiry} minutes</strong>.
              </p>
              <p style="margin: 0; font-size: 14px; color: #888; text-align: center;">
                If you didn't request this code, you can safely ignore this email.
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px; background-color: #f8f9fa; border-radius: 0 0 12px 12px;">
              <p style="margin: 0; font-size: 12px; color: #999; text-align: center;">
                This is an automated message from ${sanitizedAppName}.<br>
                Please do not reply to this email.
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
${sanitizedAppName} - Email Verification

Your verification code is: ${sanitizedOTP}

This code will expire in ${safeExpiry} minutes.

If you didn't request this code, you can safely ignore this email.

This is an automated message. Please do not reply.
`.trim();

  return { subject, html, text };
}
