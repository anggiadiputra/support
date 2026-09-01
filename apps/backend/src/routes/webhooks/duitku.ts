/**
 * Duitku Webhook Routes
 * 
 * Handles payment callback notifications from Duitku payment gateway.
 * IMPORTANT: Duitku sends callbacks as application/x-www-form-urlencoded, NOT JSON!
 * 
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { paymentService } from '../../services/payment-service.js';
import { logger } from '../../utils/logger.js';
import type { DuitkuCallbackPayload } from '../../services/duitku-service.js';

const app = new Hono();

/**
 * Get client IP address from request
 * Handles various proxy headers
 */
function getClientIP(c: Context): string {
  // Check common proxy headers
  const xForwardedFor = c.req.header('X-Forwarded-For');
  if (xForwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return xForwardedFor.split(',')[0].trim();
  }
  
  const xRealIP = c.req.header('X-Real-IP');
  if (xRealIP) {
    return xRealIP;
  }
  
  // Fallback to connection info (may not be available in all environments)
  return 'unknown';
}

// =============================================================================
// POST /api/v1/webhooks/duitku/callback
// Receive payment notification from Duitku
// No auth required - validates signature instead
// 
// IMPORTANT: Duitku sends data as form-urlencoded, not JSON!
// Content-Type: application/x-www-form-urlencoded
// 
// Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5
// =============================================================================

app.post('/callback', async (c: Context) => {
  const clientIP = getClientIP(c);
  const receivedAt = new Date().toISOString();
  
  try {
    const contentType = c.req.header('Content-Type') || '';
    
    logger.info('Duitku callback received', {
      contentType,
      method: c.req.method,
      clientIP,
      timestamp: receivedAt,
    });

    let payload: DuitkuCallbackPayload;

    // Duitku sends callbacks as form-urlencoded (this is the standard format)
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await c.req.parseBody();
      
      payload = {
        merchantCode: String(formData.merchantCode || ''),
        amount: String(formData.amount || ''),
        merchantOrderId: String(formData.merchantOrderId || ''),
        productDetail: String(formData.productDetail || ''),
        additionalParam: String(formData.additionalParam || ''),
        paymentCode: String(formData.paymentCode || ''),
        resultCode: String(formData.resultCode || ''),
        merchantUserId: String(formData.merchantUserId || ''),
        reference: String(formData.reference || ''),
        signature: String(formData.signature || ''),
        publisherOrderId: String(formData.publisherOrderId || ''),
        spUserHash: String(formData.spUserHash || ''),
        settlementDate: String(formData.settlementDate || ''),
        issuerCode: String(formData.issuerCode || ''),
      };
    } else if (contentType.includes('application/json')) {
      // Fallback for JSON format (SNAP API or testing)
      const rawBody = await c.req.text();
      
      if (rawBody.length > 1048576) {
        logger.error('Duitku callback payload too large', { size: rawBody.length });
        return c.json({ error: 'Payload too large' }, 413);
      }

      try {
        payload = JSON.parse(rawBody);
      } catch (parseError) {
        logger.error('Duitku callback JSON parsing failed', { error: parseError });
        return c.json({ error: 'Invalid JSON' }, 400);
      }
    } else {
      // Try form-urlencoded as default (Duitku's standard)
      try {
        const formData = await c.req.parseBody();
        
        payload = {
          merchantCode: String(formData.merchantCode || ''),
          amount: String(formData.amount || ''),
          merchantOrderId: String(formData.merchantOrderId || ''),
          productDetail: String(formData.productDetail || ''),
          additionalParam: String(formData.additionalParam || ''),
          paymentCode: String(formData.paymentCode || ''),
          resultCode: String(formData.resultCode || ''),
          merchantUserId: String(formData.merchantUserId || ''),
          reference: String(formData.reference || ''),
          signature: String(formData.signature || ''),
          publisherOrderId: String(formData.publisherOrderId || ''),
          spUserHash: String(formData.spUserHash || ''),
          settlementDate: String(formData.settlementDate || ''),
          issuerCode: String(formData.issuerCode || ''),
        };
      } catch {
        logger.error('Duitku callback parsing failed', { contentType });
        return c.json({ error: 'Invalid request format' }, 400);
      }
    }

    // Validate required fields
    if (!payload.merchantOrderId || !payload.merchantCode || !payload.amount) {
      logger.error('Duitku callback missing required fields', {
        hasMerchantOrderId: !!payload.merchantOrderId,
        hasMerchantCode: !!payload.merchantCode,
        hasAmount: !!payload.amount,
      });
      return c.json({ error: 'Missing required fields' }, 400);
    }

    const orderId = payload.merchantOrderId || payload.partnerReferenceNo;

    logger.info('Duitku callback parsed', {
      orderId,
      reference: payload.reference || payload.referenceNo,
      resultCode: payload.resultCode || payload.responseCode,
      amount: payload.amount,
      paymentCode: payload.paymentCode,
    });

    // Get signature from payload (Duitku sends it in the form data)
    const signature = payload.signature || '';
    const timestamp = c.req.header('X-TIMESTAMP') || c.req.header('x-timestamp') || '';

    // Process callback through payment service
    const result = await paymentService.processCallback(payload, signature, timestamp);

    if (!result.success) {
      // Return 401 for signature validation failures (Requirements: 1.3, 1.4)
      if (result.message === 'Invalid signature') {
        logger.warn('Duitku callback signature validation failed', { 
          orderId,
          clientIP,
          timestamp: receivedAt,
        });
        return c.json({ error: 'Unauthorized - Invalid signature' }, 401);
      }

      // Return 404 for transaction not found
      if (result.message === 'Transaction not found') {
        return c.json({ error: 'Transaction not found' }, 404);
      }

      // Other errors
      return c.json({ error: result.message }, 400);
    }

    // Return SUCCESS for legacy API (required by Duitku)
    // Duitku expects plain text "SUCCESS" response
    return c.text('SUCCESS');
  } catch (error) {
    logger.error('Duitku callback error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default app;
