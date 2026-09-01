/**
 * Team Agent Invitation Email Template
 * 
 * Generates HTML and plain text email content for agent invitations
 * Requirements: 2.2
 */

import { escapeHtml } from '../../../utils/sanitize.js';

export interface InvitationEmailParams {
  /** Business owner's name */
  businessOwnerName: string;
  /** Invitee's email address */
  inviteeEmail: string;
  /** Full invitation link with token */
  invitationLink: string;
  /** Invitation expiry date */
  expiresAt: Date;
  /** Application name */
  appName?: string;
}

export interface InvitationEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

/**
 * Format date for display
 */
function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Generate invitation email template
 * All user-provided content is sanitized before inclusion
 */
export function invitationEmailTemplate(params: InvitationEmailParams): InvitationEmailTemplate {
  const { 
    businessOwnerName, 
    inviteeEmail, 
    invitationLink, 
    expiresAt,
    appName = process.env.APP_NAME || 'Messaging Platform' 
  } = params;
  
  // Sanitize inputs (link tidak perlu sanitize karena plain text)
  const sanitizedOwnerName = escapeHtml(businessOwnerName);
  const sanitizedEmail = escapeHtml(inviteeEmail);
  const sanitizedAppName = escapeHtml(appName);
  const formattedExpiry = formatDate(expiresAt);

  const subject = `${sanitizedOwnerName} invited you to join their team on ${sanitizedAppName}`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Team Invitation</title>
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
          
          <!-- Content -->
          <tr>
            <td style="padding: 32px;">
              <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a; text-align: center;">
                You're invited to join a team!
              </h2>
              <p style="margin: 0 0 24px; font-size: 15px; line-height: 1.6; color: #666; text-align: center;">
                <strong>${sanitizedOwnerName}</strong> has invited you to join their team as a customer support agent on ${sanitizedAppName}.
              </p>
              
              <!-- Invitation Details Box -->
              <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                <p style="margin: 0 0 8px; font-size: 14px; color: #666;">
                  <strong>Invited by:</strong> ${sanitizedOwnerName}
                </p>
                <p style="margin: 0 0 8px; font-size: 14px; color: #666;">
                  <strong>Your email:</strong> ${sanitizedEmail}
                </p>
                <p style="margin: 0; font-size: 14px; color: #666;">
                  <strong>Expires:</strong> ${formattedExpiry}
                </p>
              </div>
              
              <!-- Link (plain text - tidak di-wrap oleh Brevo) -->
              <p style="margin: 0 0 16px; font-size: 14px; color: #888; text-align: center;">
                Copy and paste this link into your browser to accept:
              </p>
              <p style="margin: 0 0 24px; font-size: 14px; color: #2563eb; text-align: center; word-break: break-all; background-color: #f0f4ff; padding: 12px; border-radius: 8px;">
                ${invitationLink}
              </p>
              
              <hr style="border: none; border-top: 1px solid #eee; margin: 24px 0;">
              
              <p style="margin: 0; font-size: 13px; color: #888; text-align: center;">
                If you didn't expect this invitation, you can safely ignore this email.
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
${sanitizedAppName} - Team Invitation

You're invited to join a team!

${sanitizedOwnerName} has invited you to join their team as a customer support agent on ${sanitizedAppName}.

Invitation Details:
- Invited by: ${sanitizedOwnerName}
- Your email: ${sanitizedEmail}
- Expires: ${formattedExpiry}

Accept the invitation by visiting:
${invitationLink}

If you didn't expect this invitation, you can safely ignore this email.

This is an automated message. Please do not reply.
`.trim();

  return { subject, html, text };
}
