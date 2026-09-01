// ============================================================================
// WABA Service Types and Interfaces
// ============================================================================

// ============================================================================
// OAuth Types
// ============================================================================

/**
 * Signup URL response from generateSignupUrl
 */
export interface SignupUrlResponse {
  signupUrl: string;
  state: string;
  expiresAt: string;
  appId?: string;
  configId?: string;
}

/**
 * Token response from Meta OAuth
 */
export interface TokenResponse {
  accessToken: string;
  tokenType: string;
  expiresIn?: number;
}

/**
 * Token exchange result with user ID
 */
export interface TokenExchangeResult extends TokenResponse {
  userId: string;
}

/**
 * Token refresh result with expiration date
 */
export interface TokenRefreshResult extends TokenResponse {
  expiresAt: Date;
}

/**
 * State data for OAuth flow
 */
export interface StateData {
  userId: string;
  nonce: string;
  timestamp: number;
}

// ============================================================================
// WABA Resource Types
// ============================================================================

/**
 * WABA resources discovered after signup
 */
export interface WABAResources {
  wabaId: string;
  wabaName: string;
  timezone: string;
  currency: string;
  messageTemplateNamespace: string;
  messagingLimitTier?: string;
  phoneNumbers: PhoneNumberDetails[];
}

/**
 * Phone number details
 */
export interface PhoneNumberDetails {
  id: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: string | null;
  codeVerificationStatus: string | null;
  messagingLimitTier?: string | null;
  // Additional status fields
  accountMode?: string | null;
  nameStatus?: string | null;
  status?: string | null;
}

/**
 * WABA details from API
 */
export interface WABADetails {
  id: string;
  name: string;
  timezone_id: string;
  currency: string;
  message_template_namespace: string;
  account_review_status?: string;
  whatsapp_business_manager_messaging_limit?: string;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * WABA service configuration
 */
export interface WABAConfig {
  apiVersion: string;
  appId: string;
  appSecret: string;
  configId: string;
  redirectUri: string;
  webhookBaseUrl: string;
}

// ============================================================================
// Webhook Types
// ============================================================================

/**
 * Webhook configuration response
 */
export interface WebhookConfig {
  success: boolean;
  subscriptions: string[];
  webhookUrl: string;
}

/**
 * Webhook event types
 */
export type WebhookEventType =
  | 'messages'
  | 'message_status'
  | 'message_template_status_update'
  | 'history'
  | 'smb_app_state_sync'
  | 'smb_message_echoes'
  | 'account_update';

/**
 * Webhook event payload
 */
export interface WebhookEvent {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      field: string;
      value: any;
    }>;
  }>;
}

// ============================================================================
// Coexistence Types
// ============================================================================

/**
 * Coexistence status (WhatsApp Business App + Cloud API)
 */
export interface CoexistenceStatus {
  isOnBizApp: boolean;
  platformType: string;
}

/**
 * Sync status for coexistence
 */
export interface SyncStatus {
  contacts: SyncDetail;
  history: SyncDetail;
  overallProgress: number;
}

/**
 * Sync detail for contacts or history
 */
export interface SyncDetail {
  status: string;
  progress: number;
  completedAt?: Date | null;
  phase?: string;
  consentGiven?: boolean;
  error?: string;
}

// ============================================================================
// Error Types
// ============================================================================

/**
 * Meta API Error response
 */
export interface MetaAPIError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

// ============================================================================
// Internal Types
// ============================================================================

/**
 * Encrypted token structure
 */
export interface EncryptedToken {
  ciphertext: string;
  iv: string;
  authTag: string;
  algorithm: 'aes-256-gcm';
}

/**
 * Queue options for API calls
 */
export interface QueueOptions {
  priority?: number;
  critical?: boolean;
  operationName?: string;
}
