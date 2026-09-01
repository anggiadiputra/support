import type { EmailTemplate } from '../types.js';

interface ApiKeyExpiringParams {
  keyName: string;
  keyPrefix: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  userName: string;
}

export const apiKeyExpiringTemplate: EmailTemplate = (params: ApiKeyExpiringParams) => {
  const { keyName, keyPrefix, expiresAt, daysUntilExpiry, userName } = params;
  
  return {
    subject: `[Action Required] API Key Expiring Soon - ${keyName}`,
    body: `
      <h2>API Key Expiration Notice</h2>
      <p>Hi ${userName},</p>
      
      <p>Your API key is expiring in <strong>${daysUntilExpiry} days</strong>.</p>
      
      <h3>Key Details:</h3>
      <ul>
        <li><strong>Name:</strong> ${keyName}</li>
        <li><strong>Key Prefix:</strong> ${keyPrefix}...</li>
        <li><strong>Expires At:</strong> ${expiresAt.toISOString()}</li>
      </ul>
      
      <h3>What This Means:</h3>
      <p>Once expired, any integrations using this API key will stop working. Your external systems (n8n, Zapier, custom integrations) will receive authentication errors.</p>
      
      <h3>How to Fix:</h3>
      <ol>
        <li>Go to Settings → API Keys in your dashboard</li>
        <li>Create a new API key before the current one expires</li>
        <li>Update your integrations with the new key</li>
        <li>Optionally revoke the old key once migrated</li>
      </ol>
      
      <p>If you need help, please check our documentation or contact support.</p>
      
      <p>Best regards,<br>The ${process.env.APP_NAME || 'Messaging Platform'} Team</p>
    `
  };
};
