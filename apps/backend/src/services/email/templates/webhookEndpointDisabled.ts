import type { EmailTemplate } from '../types.js';

interface WebhookEndpointDisabledParams {
  endpointName: string;
  endpointUrl: string;
  userName: string;
}

export const webhookEndpointDisabledTemplate: EmailTemplate = (params: WebhookEndpointDisabledParams) => {
  const { endpointName, endpointUrl, userName } = params;
  
  return {
    subject: `[Action Required] Webhook Endpoint Disabled - ${endpointName}`,
    body: `
      <h2>Webhook Endpoint Auto-Disabled</h2>
      <p>Hi ${userName},</p>
      
      <p>Your webhook endpoint has been automatically disabled due to 10 consecutive delivery failures.</p>
      
      <h3>Endpoint Details:</h3>
      <ul>
        <li><strong>Name:</strong> ${endpointName}</li>
        <li><strong>URL:</strong> ${endpointUrl}</li>
        <li><strong>Disabled At:</strong> ${new Date().toISOString()}</li>
      </ul>
      
      <h3>What This Means:</h3>
      <p>Your external system will no longer receive webhook notifications for messaging events until you re-enable the endpoint.</p>
      
      <h3>Common Causes:</h3>
      <ul>
        <li>Webhook URL is unreachable or returning errors</li>
        <li>Server is experiencing downtime</li>
        <li>SSL certificate issues</li>
        <li>Firewall blocking incoming requests</li>
        <li>Application errors on your webhook handler</li>
      </ul>
      
      <h3>How to Fix:</h3>
      <ol>
        <li>Check that your webhook URL is accessible</li>
        <li>Verify your server is running and responding correctly</li>
        <li>Check your webhook handler logs for errors</li>
        <li>Once fixed, go to Settings → Webhooks in your dashboard</li>
        <li>Re-enable the webhook endpoint</li>
        <li>Use the "Test" button to verify it's working</li>
      </ol>
      
      <p>If you need help troubleshooting, please check our documentation or contact support.</p>
      
      <p>Best regards,<br>The ${process.env.APP_NAME || 'Messaging Platform'} Team</p>
    `
  };
};
