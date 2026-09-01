/**
 * Facebook Messenger Error Handling
 * Custom error classes and error codes for Messenger integration
 */

export enum MessengerErrorCode {
  // OAuth errors
  STATE_INVALID = 'MESSENGER_STATE_INVALID',
  STATE_EXPIRED = 'MESSENGER_STATE_EXPIRED',
  TOKEN_EXCHANGE_FAILED = 'MESSENGER_TOKEN_EXCHANGE_FAILED',
  
  // API errors
  API_ERROR = 'MESSENGER_API_ERROR',
  RATE_LIMITED = 'MESSENGER_RATE_LIMITED',
  INVALID_TOKEN = 'MESSENGER_INVALID_TOKEN',
  
  // Message errors
  MESSAGE_SEND_FAILED = 'MESSENGER_MESSAGE_SEND_FAILED',
  WINDOW_CLOSED = 'MESSENGER_WINDOW_CLOSED',
  
  // Webhook errors
  WEBHOOK_VERIFICATION_FAILED = 'MESSENGER_WEBHOOK_VERIFICATION_FAILED',
  INVALID_SIGNATURE = 'MESSENGER_INVALID_SIGNATURE',
  
  // General errors
  PAGE_NOT_FOUND = 'MESSENGER_PAGE_NOT_FOUND',
  INTERNAL_ERROR = 'MESSENGER_INTERNAL_ERROR',
}

export interface MessengerMetaError {
  code: number
  message: string
  type: string
  subcode?: number
  fbtrace_id?: string
}

export class MessengerError extends Error {
  constructor(
    public code: MessengerErrorCode,
    message: string,
    public statusCode: number = 500,
    public isRetryable: boolean = false,
    public userMessage?: string,
    public metaError?: MessengerMetaError
  ) {
    super(message)
    this.name = 'MessengerError'
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        userMessage: this.userMessage || this.message,
        isRetryable: this.isRetryable,
        metaError: this.metaError,
      }
    }
  }
}
