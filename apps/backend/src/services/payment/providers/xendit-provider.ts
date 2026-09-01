/**
 * XenditProvider
 *
 * Payment provider implementation for Xendit payment gateway.
 * Uses the new Payments API — Payment Session (`POST /sessions`) with `mode: PAYMENT_LINK`.
 *
 * This replaces the legacy Invoice API (`/v2/invoices`) to avoid the USD 250/month
 * Legacy API Maintenance Fee that Xendit will charge starting 1 Oct 2026.
 * Ref: https://docs.xendit.co/docs/migrate-to-payment-session
 *
 * Benefits:
 * - No legacy maintenance fee
 * - New hosted checkout UI (better UX & conversion)
 * - `payment.failure` webhook for failed attempts (future use)
 * - Single integration for one-time / save / subscription flows
 *
 * Compatibility notes (kept intentionally):
 * - Auth still uses HTTP Basic with secret key (Xendit did not change this).
 * - Webhook auth still uses `x-callback-token` header (per Xendit docs — did not change).
 * - PaymentProvider interface, DB schema, and admin settings are UNCHANGED.
 *
 * Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 8.1, 8.2, 8.4
 */

import axios, { AxiosError } from 'axios';
import { logger } from '../../../utils/logger.js';
import { adminSettingsService } from '../../admin/settings-service.js';
import type {
  PaymentProvider,
  PaymentMethod,
  CreatePaymentParams,
  CreatePaymentResult,
  CheckStatusResult,
  CallbackValidationResult,
  ProviderHealthResult,
  PaymentStatus,
} from '../types.js';

// =============================================================================
// Xendit Configuration Types
// =============================================================================

/**
 * Xendit settings from admin settings
 */
export interface XenditSettings {
  enabled: boolean;
  secretKey: string;
  publicKey: string;
  webhookToken: string;
  environment: 'sandbox' | 'production';
}

// =============================================================================
// Xendit Payment Session API Types
// =============================================================================

type XenditSessionStatus = 'ACTIVE' | 'COMPLETED' | 'EXPIRED' | 'CANCELED';

/**
 * Response from `POST /sessions` and `GET /sessions/{id}`.
 * Only fields we actually use are typed strictly; everything else is optional.
 */
interface XenditSessionResponse {
  payment_session_id: string;
  reference_id: string;
  session_type: 'PAY' | 'SAVE' | 'SUBSCRIPTION';
  mode: 'PAYMENT_LINK' | 'COMPONENTS';
  amount: number | string;
  currency: string;
  country: string;
  status: XenditSessionStatus;
  expires_at: string;
  payment_link_url: string | null;
  payment_id?: string | null;
  payment_request_id?: string | null;
  created: string;
  updated: string;
}

/**
 * Payment Session webhook envelope.
 * Xendit wraps the session object under `data` and adds an `event` tag.
 * Events: `payment_session.completed`, `payment_session.expired`.
 *
 * NOTE: In webhook payloads Xendit uses `data.id` for the session id (NOT
 * `data.payment_session_id` as the `POST /sessions` response docs suggest).
 * We accept both to be defensive.
 */
interface XenditSessionWebhookPayload {
  event: 'payment_session.completed' | 'payment_session.expired' | string;
  business_id?: string;
  created?: string;
  data: {
    id?: string;
    payment_session_id?: string;
    reference_id: string;
    status: XenditSessionStatus;
    amount?: number | string;
    currency?: string;
    payment_id?: string | null;
    payment_request_id?: string | null;
    payment_link_url?: string | null;
    [key: string]: unknown;
  };
}

// =============================================================================
// Error Mapping
// =============================================================================

/**
 * Xendit error code to user-friendly message mapping.
 * Extended with new Payment Session error codes.
 */
export const XENDIT_ERROR_MAP: Record<string, string> = {
  // Shared
  API_VALIDATION_ERROR: 'Data pembayaran tidak valid',
  INVALID_API_KEY: 'Konfigurasi payment gateway tidak valid',
  REQUEST_FORBIDDEN_ERROR: 'Akses ditolak oleh payment gateway',
  CHANNEL_NOT_ACTIVATED: 'Metode pembayaran tidak tersedia',
  INSUFFICIENT_BALANCE: 'Saldo merchant tidak mencukupi',
  DUPLICATE_ERROR: 'Transaksi dengan ID ini sudah ada',
  INVALID_AMOUNT: 'Jumlah pembayaran tidak valid',
  MINIMUM_AMOUNT_ERROR: 'Jumlah pembayaran di bawah minimum',
  MAXIMUM_AMOUNT_ERROR: 'Jumlah pembayaran melebihi maksimum',
  SERVER_ERROR: 'Terjadi kesalahan pada server payment gateway',
  DATA_NOT_FOUND: 'Data pembayaran tidak ditemukan',
  // New in Payment Session
  INVALID_PAYMENT_CHANNEL: 'Metode pembayaran tidak valid',
  INVALID_PRIMARY_PAYMENT_CHANNEL: 'Metode pembayaran utama tidak valid',
  INVALID_METADATA: 'Metadata pembayaran tidak valid',
  INVALID_ITEM_METADATA: 'Metadata item tidak valid',
  INVALID_CURRENCY: 'Mata uang tidak valid',
  INVALID_COUNTRY: 'Negara tidak valid',
  INVALID_CUSTOMER_ID: 'Customer ID tidak valid',
  INVALID_URL: 'URL redirect tidak valid',
  MISSING_CUSTOMER: 'Data customer wajib diisi',
  DISALLOWED_CAPTURE_METHOD: 'Metode capture tidak diizinkan',
  INVALID_EXPIRY_DATE: 'Tanggal kadaluarsa tidak valid',
  ITEMS_NOT_SUPPORTED: 'Items tidak didukung untuk sesi ini',
  SESSION_TYPE_NOT_SUPPORTED: 'Session type tidak didukung',
  MODE_NOT_SUPPORTED: 'Mode integrasi tidak didukung',
  // Legacy (still map to friendly messages for old data)
  INVOICE_NOT_FOUND_ERROR: 'Pembayaran tidak ditemukan',
};

function mapXenditError(errorCode: string, defaultMessage: string): string {
  return XENDIT_ERROR_MAP[errorCode] || defaultMessage;
}

/**
 * Map Xendit Payment Session status to standard PaymentStatus.
 */
function mapXenditSessionStatus(status: string): PaymentStatus {
  const map: Record<string, PaymentStatus> = {
    ACTIVE: 'PENDING',
    COMPLETED: 'SUCCESS',
    EXPIRED: 'EXPIRED',
    CANCELED: 'FAILED',
  };
  return map[(status || '').toUpperCase()] || 'PENDING';
}

/**
 * Coerce Xendit amount (may be string or number) to number.
 */
function toNumberAmount(value: number | string | undefined): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

// =============================================================================
// XenditProvider Class
// =============================================================================

/**
 * XenditProvider — Payments API (Sessions)
 *
 * Implements the PaymentProvider interface using the new Payment Session API
 * with `mode: PAYMENT_LINK` (Xendit-hosted checkout).
 *
 * Requirements: 4.1, 4.2, 4.3
 */
export class XenditProvider implements PaymentProvider {
  readonly providerId = 'xendit';
  readonly displayName = 'Xendit';

  /** Xendit API base URL (same for sandbox & production; differentiated by API key). */
  private readonly API_URL = 'https://api.xendit.co';

  /** Country / currency used for all sessions (IDR / Indonesia). */
  private readonly COUNTRY = 'ID';
  private readonly CURRENCY = 'IDR';

  /**
   * Get list of payment methods supported. With Payment Link mode, Xendit shows
   * every channel enabled on the merchant account — the list here is cosmetic
   * for the admin UI, kept for backwards compatibility.
   */
  getPaymentMethods(): PaymentMethod[] {
    return ['QRIS', 'VA_BCA', 'VA_BNI', 'VA_MANDIRI', 'VA_PERMATA', 'EWALLET'];
  }

  /**
   * Get Xendit configuration from admin settings.
   */
  async getConfig(): Promise<XenditSettings> {
    try {
      const category = 'xendit' as Parameters<typeof adminSettingsService.getRawValue>[0];

      const enabled = await adminSettingsService.getRawValue(category, 'enabled');
      const secretKey = await adminSettingsService.getRawValue(category, 'secret_key');
      const publicKey = await adminSettingsService.getRawValue(category, 'public_key');
      const webhookToken = await adminSettingsService.getRawValue(category, 'webhook_token');
      const environment = await adminSettingsService.getRawValue(category, 'environment');

      return {
        enabled: enabled === 'true',
        secretKey: secretKey || '',
        publicKey: publicKey || '',
        webhookToken: webhookToken || '',
        environment: (environment as 'sandbox' | 'production') || 'sandbox',
      };
    } catch (error) {
      logger.error('Failed to get Xendit config', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        enabled: false,
        secretKey: '',
        publicKey: '',
        webhookToken: '',
        environment: 'sandbox',
      };
    }
  }

  /**
   * Create Basic Auth header for Xendit API.
   * Format: base64(secretKey + ':')
   */
  private getAuthHeader(secretKey: string): string {
    return `Basic ${Buffer.from(secretKey + ':').toString('base64')}`;
  }

  /**
   * Check if Xendit is properly configured and enabled.
   */
  async isConfigured(): Promise<boolean> {
    try {
      const config = await this.getConfig();
      return !!(config.enabled && config.secretKey);
    } catch {
      return false;
    }
  }

  /**
   * Build a per-order `customer.reference_id` for the Payment Session.
   *
   * Xendit rejects duplicate customer refs with 409 DUPLICATE_ERROR, and the
   * legacy Invoice API happily accepted a stable per-user ref. Since we use
   * inline customer objects (no persistent Customer resource) and only need
   * this for one-off checkout, we make the ref unique **per order** so the
   * same paying user can create multiple sessions without collision.
   *
   * Format: `<sanitizedEmailLocalPart-or-cust>-<sanitizedOrderId>`
   * Xendit constraint: alphanumeric + max 255 chars (we cap to 100 for safety).
   */
  private sanitizeCustomerRef(email: string, orderId: string): string {
    const emailPart = (email?.split('@')[0] || 'cust').toString();
    const cleanedEmail = emailPart.replace(/[^A-Za-z0-9]/g, '').slice(0, 40) || 'cust';
    const cleanedOrder = (orderId || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
    const ref = cleanedOrder ? `${cleanedEmail}${cleanedOrder}` : `${cleanedEmail}${Date.now()}`;
    return ref.slice(0, 100);
  }

  /**
   * Split a full name into given_names + optional surname.
   * Xendit `individual_detail.given_names` is required.
   */
  private splitCustomerName(fullName: string | undefined): {
    given_names: string;
    surname?: string;
  } {
    const name = (fullName || 'Customer').trim();
    const parts = name.split(/\s+/);
    if (parts.length === 1) return { given_names: parts[0].slice(0, 50) };
    return {
      given_names: parts[0].slice(0, 50),
      surname: parts.slice(1).join(' ').slice(0, 50),
    };
  }

  /**
   * Create a new payment via Xendit Payment Session API (`mode: PAYMENT_LINK`).
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  async createPayment(params: CreatePaymentParams): Promise<CreatePaymentResult> {
    logger.info('XenditProvider.createPayment called', {
      orderId: params.orderId,
      amount: params.amount,
      paymentMethod: params.paymentMethod,
      productDetails: params.productDetails,
    });

    try {
      const config = await this.getConfig();

      if (!config.enabled) {
        return {
          success: false,
          error: 'Xendit payment gateway is disabled',
          errorCode: 'PAYMENT_DISABLED',
        };
      }

      if (!config.secretKey) {
        return {
          success: false,
          error: 'Xendit is not configured',
          errorCode: 'PAYMENT_NOT_CONFIGURED',
        };
      }

      // Compute expires_at from expiryMinutes (default 24h).
      const expiryMinutes = params.expiryMinutes || 1440;
      const expiresAt = new Date(Date.now() + expiryMinutes * 60_000).toISOString();

      const { given_names, surname } = this.splitCustomerName(params.customerName);
      const customerRef = this.sanitizeCustomerRef(params.customerEmail, params.orderId);

      // Description is capped at 1000 chars by Xendit.
      const description = (params.productDetails || 'Payment').slice(0, 1000);

      const body: Record<string, unknown> = {
        reference_id: params.orderId,
        session_type: 'PAY',
        mode: 'PAYMENT_LINK',
        currency: this.CURRENCY,
        country: this.COUNTRY,
        amount: params.amount,
        capture_method: 'AUTOMATIC',
        locale: 'id',
        description,
        expires_at: expiresAt,
        customer: {
          type: 'INDIVIDUAL',
          reference_id: customerRef,
          email: params.customerEmail,
          individual_detail: {
            given_names,
            ...(surname ? { surname } : {}),
          },
        },
        success_return_url: params.returnUrl,
        cancel_return_url: params.returnUrl,
      };

      const response = await axios.post<XenditSessionResponse>(
        `${this.API_URL}/sessions`,
        body,
        {
          headers: {
            Authorization: this.getAuthHeader(config.secretKey),
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        }
      );

      const data = response.data;

      if (!data.payment_link_url) {
        logger.error('Xendit Payment Session created without payment_link_url', {
          orderId: params.orderId,
          payment_session_id: data.payment_session_id,
        });
        return {
          success: false,
          error: 'Payment link URL missing in Xendit response',
          errorCode: 'INVALID_RESPONSE',
        };
      }

      logger.info('Xendit Payment Session created successfully', {
        orderId: params.orderId,
        payment_session_id: data.payment_session_id,
        payment_link_url: data.payment_link_url,
        expires_at: data.expires_at,
      });

      return {
        success: true,
        // Store payment_session_id as our providerReferenceNo (replaces invoice `id`).
        referenceNo: data.payment_session_id,
        paymentUrl: data.payment_link_url,
        expiresAt: new Date(data.expires_at),
      };
    } catch (error) {
      return this.handleXenditError(error, 'Payment session creation');
    }
  }

  /**
   * Handle Xendit API errors.
   */
  private handleXenditError(error: unknown, operation: string): CreatePaymentResult {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<{
        error_code?: string;
        message?: string;
      }>;
      const errorCode = axiosError.response?.data?.error_code || 'UNKNOWN_ERROR';
      const errorMessage = axiosError.response?.data?.message || axiosError.message;

      logger.error(`Xendit ${operation} failed`, {
        errorCode,
        errorMessage,
        status: axiosError.response?.status,
      });

      return {
        success: false,
        error: mapXenditError(errorCode, errorMessage),
        errorCode,
      };
    }

    logger.error(`Xendit ${operation} failed with unknown error`, {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      errorCode: 'UNKNOWN_ERROR',
    };
  }

  /**
   * Check the status of an existing Payment Session.
   *
   * @param orderId - The merchant reference id (external order id).
   * @param referenceNo - Optional Xendit payment_session_id for direct lookup.
   *
   * Requirements: 4.1
   */
  async checkStatus(orderId: string, referenceNo?: string): Promise<CheckStatusResult> {
    logger.debug('XenditProvider.checkStatus called', { orderId, referenceNo });

    try {
      const config = await this.getConfig();

      if (!config.enabled) {
        return {
          success: false,
          status: 'FAILED',
          error: 'Xendit payment gateway is disabled',
        };
      }

      // Direct lookup via payment_session_id when we have it.
      if (referenceNo) {
        try {
          const response = await axios.get<XenditSessionResponse>(
            `${this.API_URL}/sessions/${encodeURIComponent(referenceNo)}`,
            {
              headers: {
                Authorization: this.getAuthHeader(config.secretKey),
              },
              timeout: 15000,
            }
          );

          const status = mapXenditSessionStatus(response.data.status);
          logger.debug('XenditProvider.checkStatus: session found', {
            orderId,
            referenceNo,
            xenditStatus: response.data.status,
            mappedStatus: status,
          });

          return {
            success: true,
            status,
            amount: toNumberAmount(response.data.amount),
          };
        } catch (sessionError) {
          logger.debug('XenditProvider.checkStatus: session lookup failed', {
            orderId,
            referenceNo,
            error: sessionError instanceof Error ? sessionError.message : 'Unknown',
          });
          // Fall through — Payment Session API does not support search-by-reference_id,
          // so if the direct lookup fails we return PENDING to avoid false negatives.
        }
      }

      // No safe fallback for lookup-by-reference_id in the new API. Report PENDING.
      logger.warn('XenditProvider.checkStatus: no direct lookup possible', {
        orderId,
        referenceNo,
      });
      return {
        success: true,
        status: 'PENDING',
        error: 'Session status pending verification',
      };
    } catch (error) {
      logger.error('XenditProvider.checkStatus error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        orderId,
        referenceNo,
      });

      return {
        success: true,
        status: 'PENDING',
        error: error instanceof Error ? error.message : 'Status check failed',
      };
    }
  }

  /**
   * Validate and parse a Xendit webhook callback.
   *
   * Payment Session webhook shape:
   * ```
   * {
   *   event: "payment_session.completed" | "payment_session.expired",
   *   business_id: "...",
   *   created: "...",
   *   data: {
   *     payment_session_id, reference_id, status, amount, ...
   *   }
   * }
   * ```
   *
   * Also accepts legacy Invoice callbacks (flat `{ id, external_id, status, amount }`)
   * during the transition window so any in-flight Invoice payments still complete.
   *
   * Requirements: 4.4, 4.5
   */
  async validateCallback(
    payload: unknown,
    headers: Record<string, string>
  ): Promise<CallbackValidationResult> {
    logger.debug('XenditProvider.validateCallback called', {
      hasPayload: !!payload,
      headerKeys: Object.keys(headers),
      payloadKeys: payload ? Object.keys(payload as object) : [],
    });

    try {
      const config = await this.getConfig();

      // Xendit still uses `x-callback-token` for webhook auth on both APIs.
      const webhookToken = headers['x-callback-token'] || headers['X-Callback-Token'];

      if (!webhookToken) {
        logger.warn('XenditProvider.validateCallback: missing webhook token');
        return { valid: false, error: 'Missing webhook token in headers' };
      }

      if (webhookToken !== config.webhookToken) {
        logger.warn('XenditProvider.validateCallback: token mismatch');
        return { valid: false, error: 'Invalid webhook token' };
      }

      const callbackData = payload as Record<string, unknown>;

      // New: Payment Session webhook (has top-level `event` + `data`)
      if (this.isPaymentSessionCallback(callbackData)) {
        logger.debug('XenditProvider.validateCallback: detected Payment Session callback');
        return this.parsePaymentSessionCallback(
          callbackData as unknown as XenditSessionWebhookPayload
        );
      }

      // Legacy: Invoice callback (flat)
      if (this.isLegacyInvoiceCallback(callbackData)) {
        logger.debug('XenditProvider.validateCallback: detected legacy Invoice callback');
        return this.parseLegacyInvoiceCallback(callbackData);
      }

      logger.warn('XenditProvider.validateCallback: unknown callback format', {
        payloadKeys: Object.keys(callbackData),
      });

      return { valid: false, error: 'Unknown callback format' };
    } catch (error) {
      logger.error('XenditProvider.validateCallback error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Callback validation failed',
      };
    }
  }

  /**
   * True when payload looks like a new Payment Session webhook envelope.
   * Xendit uses `data.id` (not `data.payment_session_id`) in the actual webhook
   * payload, so we accept either identifier. `event` starts with `payment_session.`.
   */
  private isPaymentSessionCallback(payload: Record<string, unknown>): boolean {
    const event = payload.event;
    const data = payload.data as Record<string, unknown> | undefined;
    if (typeof event !== 'string' || !event.startsWith('payment_session.')) return false;
    if (typeof data !== 'object' || data === null) return false;
    if (typeof data.reference_id !== 'string') return false;
    const hasSessionId =
      typeof data.id === 'string' || typeof data.payment_session_id === 'string';
    return hasSessionId;
  }

  /** True when payload matches the legacy Invoice callback (flat root object). */
  private isLegacyInvoiceCallback(payload: Record<string, unknown>): boolean {
    return (
      typeof payload.external_id === 'string' &&
      typeof payload.status === 'string' &&
      (payload.amount !== undefined || payload.paid_amount !== undefined)
    );
  }

  private parsePaymentSessionCallback(
    callback: XenditSessionWebhookPayload
  ): CallbackValidationResult {
    const { event, data } = callback;

    // Prefer status derived from the event when available (definitive per docs);
    // fall back to `data.status` for defense in depth.
    let status: PaymentStatus;
    if (event === 'payment_session.completed') {
      status = 'SUCCESS';
    } else if (event === 'payment_session.expired') {
      status = 'EXPIRED';
    } else {
      status = mapXenditSessionStatus(data.status);
    }

    const amount = toNumberAmount(data.amount);
    // Xendit webhook uses `data.id`; API-response docs use `payment_session_id`. Accept both.
    const sessionId = data.payment_session_id || data.id;

    logger.info('XenditProvider: Payment Session callback parsed', {
      event,
      payment_session_id: sessionId,
      reference_id: data.reference_id,
      xenditStatus: data.status,
      mappedStatus: status,
      amount,
      payment_id: data.payment_id,
    });

    return {
      valid: true,
      orderId: data.reference_id,
      status,
      amount,
    };
  }

  private parseLegacyInvoiceCallback(payload: Record<string, unknown>): CallbackValidationResult {
    const rawStatus = String(payload.status || '').toUpperCase();
    const legacyMap: Record<string, PaymentStatus> = {
      PAID: 'SUCCESS',
      SETTLED: 'SUCCESS',
      EXPIRED: 'EXPIRED',
      PENDING: 'PENDING',
    };
    const status = legacyMap[rawStatus] || 'PENDING';
    const amount = toNumberAmount(
      (payload.paid_amount as number | string | undefined) ??
        (payload.amount as number | string | undefined)
    );

    logger.info('XenditProvider: legacy Invoice callback parsed', {
      invoiceId: payload.id,
      externalId: payload.external_id,
      xenditStatus: rawStatus,
      mappedStatus: status,
      amount,
      payment_method: payload.payment_method,
      payment_channel: payload.payment_channel,
    });

    return {
      valid: true,
      orderId: payload.external_id as string,
      status,
      amount,
    };
  }

  /**
   * Perform a health check on the Xendit provider.
   *
   * Requirements: 8.1, 8.2, 8.4
   */
  async healthCheck(): Promise<ProviderHealthResult> {
    const lastChecked = new Date();

    try {
      const config = await this.getConfig();

      if (!config.enabled) {
        return {
          status: 'unhealthy',
          message: 'Xendit is disabled in settings',
          lastChecked,
        };
      }

      if (!config.secretKey) {
        return {
          status: 'unhealthy',
          message: 'Xendit credentials are not configured',
          lastChecked,
        };
      }

      // Verify API key by hitting `/balance` — same for both APIs.
      try {
        await axios.get(`${this.API_URL}/balance`, {
          headers: {
            Authorization: this.getAuthHeader(config.secretKey),
          },
          timeout: 10000,
        });

        return {
          status: 'healthy',
          message: `Xendit is configured (${config.environment} environment)`,
          lastChecked,
        };
      } catch (apiError) {
        if (axios.isAxiosError(apiError)) {
          const status = apiError.response?.status;

          if (status === 401) {
            return {
              status: 'unhealthy',
              message: 'Xendit API key is invalid',
              lastChecked,
            };
          }

          if (status === 403) {
            // 403 on balance endpoint is OK — key works but no balance permission.
            return {
              status: 'healthy',
              message: `Xendit is configured (${config.environment} environment)`,
              lastChecked,
            };
          }

          return {
            status: 'degraded',
            message: `Xendit API returned error: ${apiError.message}`,
            lastChecked,
          };
        }
        throw apiError;
      }
    } catch (error) {
      logger.error('XenditProvider.healthCheck error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        status: 'unhealthy',
        message: error instanceof Error ? error.message : 'Health check failed',
        lastChecked,
      };
    }
  }
}

// Export singleton instance
export const xenditProvider = new XenditProvider();
