/**
 * Error Sanitization Utilities
 *
 * Provides functions to sanitize error messages before displaying them to users.
 * This prevents exposure of sensitive technical information including:
 * - Internal API endpoints
 * - Database/table names
 * - Stack traces
 * - Token/auth information
 *
 * Security: Prevents information leakage through error messages
 */

/**
 * Technical keywords that indicate an error message should not be shown to users
 * These patterns may reveal internal implementation details
 */
const TECHNICAL_KEYWORDS = [
  'sql',
  'database',
  'internal',
  'stack',
  'undefined',
  'null',
  'token',
  'api',
  'secret',
  'key',
  'password',
  'auth',
] as const

/**
 * Check if an error message contains technical keywords that should not be exposed to users
 *
 * @param message - The error message to check
 * @returns true if the message contains technical keywords
 *
 * @example
 * isTechnicalError('SQL syntax error near...') // true
 * isTechnicalError('Invalid email format') // false
 */
export function isTechnicalError(message: string): boolean {
  const lowerMessage = message.toLowerCase()
  return TECHNICAL_KEYWORDS.some((keyword) => lowerMessage.includes(keyword))
}

/**
 * Get a safe error message that can be displayed to users
 *
 * This function sanitizes error messages by:
 * 1. Returning fallback for non-Error values
 * 2. Returning fallback for messages containing technical keywords
 * 3. Returning the original message only if it's safe for user display
 *
 * @param error - The error to extract a message from (can be any type)
 * @param fallback - The fallback message to use if the error is technical or invalid
 * @returns A safe error message suitable for user display
 *
 * @example
 * getSafeErrorMessage(new Error('Invalid email'), 'Something went wrong')
 * // Returns: 'Invalid email'
 *
 * @example
 * getSafeErrorMessage(new Error('SQL error: table not found'), 'Something went wrong')
 * // Returns: 'Something went wrong'
 *
 * @example
 * getSafeErrorMessage('string error', 'Something went wrong')
 * // Returns: 'Something went wrong'
 */
export function getSafeErrorMessage(error: unknown, fallback: string): string {
  // If error is not an Error instance, return fallback
  if (!(error instanceof Error)) {
    return fallback
  }

  // If message contains technical keywords, return fallback
  if (isTechnicalError(error.message)) {
    return fallback
  }

  // Safe to return the original message
  return error.message
}
