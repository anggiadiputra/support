import type { EmailTemplate } from '../types.js';

interface TokenRefreshFailedParams {
  wabaId: string;
  businessName: string;
  error: string;
}

export const tokenRefreshFailedTemplate: EmailTemplate = (params: TokenRefreshFailedParams) => {
  const { wabaId, businessName, error } = params;
  const appName = process.env.APP_NAME || 'Messaging Platform';
  const dashboardUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${process.env.DEFAULT_LOCALE || 'en'}/dashboard`;

  return {
    subject: `[URGENT] WhatsApp Token Refresh Failed - ${businessName}`,
    body: `
      <h2>WhatsApp Access Token Refresh Failed</h2>
      <p>The automatic token refresh for your WhatsApp Business Account has failed.</p>
      
      <h3>Details:</h3>
      <ul>
        <li><strong>Business:</strong> ${businessName}</li>
        <li><strong>WABA ID:</strong> ${wabaId}</li>
        <li><strong>Error:</strong> ${error}</li>
        <li><strong>Time:</strong> ${new Date().toISOString()}</li>
      </ul>
      
      <h3>Action Required:</h3>
      <p>Please reconnect your WhatsApp Business Account to restore messaging services:</p>
      <ol>
        <li>Log in to your dashboard at ${dashboardUrl}</li>
        <li>Navigate to WhatsApp Settings</li>
        <li>Click "Reconnect WhatsApp"</li>
        <li>Complete the authorization flow</li>
      </ol>
      
      <p>If you continue to experience issues, please contact support.</p>
      
      <p>Best regards,<br>${appName} Team</p>
    `
  };
};
