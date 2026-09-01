/**
 * Template Validation Rules for WhatsApp Message Templates
 * Based on Meta's official guidelines:
 * - Variables cannot be at the start or end of message
 * - Variables cannot be adjacent (must have text between them)
 * - Maximum 10 emojis allowed
 * - Body maximum 1024 characters
 * - Footer maximum 60 characters
 * - Header text maximum 60 characters
 * 
 * AUTHENTICATION templates have additional restrictions:
 * - Body text is FIXED by Meta: "*{{1}}* is your verification code."
 * - No custom body text allowed
 * - No emojis allowed
 * - No URLs allowed
 * - No media headers allowed
 * - Must have COPY_CODE or ONE_TAP button
 * - OTP parameter max 15 characters
 */

export type ValidationRule =
  | 'VARIABLE_AT_START'
  | 'VARIABLE_AT_END'
  | 'ADJACENT_VARIABLES'
  | 'TOO_MANY_EMOJIS'
  | 'BODY_TOO_LONG'
  | 'FOOTER_TOO_LONG'
  | 'HEADER_TEXT_TOO_LONG'
  // Authentication-specific rules
  | 'AUTH_NO_EMOJIS'
  | 'AUTH_NO_URLS'
  | 'AUTH_NO_MEDIA_HEADER'
  | 'AUTH_REQUIRES_OTP_BUTTON'
  | 'AUTH_INVALID_BODY_FORMAT'

export interface ValidationPosition {
  start: number
  end: number
}

export interface ValidationIssue {
  rule: ValidationRule
  message: string
  messageId: string // For i18n on frontend
  positions: ValidationPosition[]
}

export interface ValidationResult {
  valid: boolean
  issues: ValidationIssue[]
}

// Regex to match both positional {{1}} and named {{variable_name}} parameters
const VARIABLE_PATTERN = /\{\{(?:\d+|[a-z_]+)\}\}/gi

/**
 * Check if text starts with a variable (after optional whitespace)
 */
function checkVariableAtStart(text: string): ValidationIssue | null {
  const trimmedStart = text.replace(/^\s*/, '')
  const match = trimmedStart.match(/^(\{\{(?:\d+|[a-z_]+)\}\})/i)
  
  if (match) {
    const leadingWhitespace = text.length - trimmedStart.length
    return {
      rule: 'VARIABLE_AT_START',
      message: 'Variable cannot be at the start of message. Add text before the variable.',
      messageId: 'variableAtStart',
      positions: [{
        start: leadingWhitespace,
        end: leadingWhitespace + match[1].length
      }]
    }
  }
  return null
}

/**
 * Check if text ends with a variable (before optional whitespace)
 */
function checkVariableAtEnd(text: string): ValidationIssue | null {
  const trimmedEnd = text.replace(/\s*$/, '')
  const match = trimmedEnd.match(/(\{\{(?:\d+|[a-z_]+)\}\})$/i)
  
  if (match) {
    const startPos = trimmedEnd.length - match[1].length
    return {
      rule: 'VARIABLE_AT_END',
      message: 'Variable cannot be at the end of message. Add text or punctuation after the variable.',
      messageId: 'variableAtEnd',
      positions: [{
        start: startPos,
        end: startPos + match[1].length
      }]
    }
  }
  return null
}

/**
 * Check for adjacent variables (only whitespace between them)
 */
function checkAdjacentVariables(text: string): ValidationIssue | null {
  const pattern = /(\{\{(?:\d+|[a-z_]+)\}\})\s*(\{\{(?:\d+|[a-z_]+)\}\})/gi
  const positions: ValidationPosition[] = []
  let match
  
  while ((match = pattern.exec(text)) !== null) {
    positions.push({
      start: match.index,
      end: match.index + match[0].length
    })
  }
  
  if (positions.length > 0) {
    return {
      rule: 'ADJACENT_VARIABLES',
      message: 'Variables cannot be adjacent. Add at least one word between variables.',
      messageId: 'adjacentVariables',
      positions
    }
  }
  return null
}

/**
 * Count emojis in text and check if exceeds limit
 */
function checkTooManyEmojis(text: string, maxEmojis: number = 10): ValidationIssue | null {
  // Comprehensive emoji regex pattern
  const emojiPattern = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu
  const emojis = text.match(emojiPattern) || []
  
  if (emojis.length > maxEmojis) {
    return {
      rule: 'TOO_MANY_EMOJIS',
      message: `Maximum ${maxEmojis} emojis allowed. Currently: ${emojis.length}`,
      messageId: 'tooManyEmojis',
      positions: [] // No specific position for emoji count
    }
  }
  return null
}

/**
 * Check if body exceeds maximum length
 */
function checkBodyTooLong(text: string, maxLength: number = 1024): ValidationIssue | null {
  if (text.length > maxLength) {
    return {
      rule: 'BODY_TOO_LONG',
      message: `Body exceeds maximum ${maxLength} characters. Currently: ${text.length}`,
      messageId: 'bodyTooLong',
      positions: [{
        start: maxLength,
        end: text.length
      }]
    }
  }
  return null
}

/**
 * Check if footer exceeds maximum length
 */
function checkFooterTooLong(text: string, maxLength: number = 60): ValidationIssue | null {
  if (text.length > maxLength) {
    return {
      rule: 'FOOTER_TOO_LONG',
      message: `Footer exceeds maximum ${maxLength} characters. Currently: ${text.length}`,
      messageId: 'footerTooLong',
      positions: [{
        start: maxLength,
        end: text.length
      }]
    }
  }
  return null
}

/**
 * Check if header text exceeds maximum length
 */
function checkHeaderTextTooLong(text: string, maxLength: number = 60): ValidationIssue | null {
  if (text.length > maxLength) {
    return {
      rule: 'HEADER_TEXT_TOO_LONG',
      message: `Header text exceeds maximum ${maxLength} characters. Currently: ${text.length}`,
      messageId: 'headerTextTooLong',
      positions: [{
        start: maxLength,
        end: text.length
      }]
    }
  }
  return null
}

export interface ValidateTemplateContentOptions {
  content: string
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string | null
  footerContent?: string | null
  headerContent?: string | null
  headerType?: string | null
  buttons?: Array<{ type: string; otp_type?: string }> | null
}

// ============================================
// AUTHENTICATION-SPECIFIC VALIDATION FUNCTIONS
// ============================================

/**
 * Check if AUTHENTICATION template contains emojis (not allowed)
 */
function checkAuthNoEmojis(text: string): ValidationIssue | null {
  const emojiPattern = /\p{Emoji_Presentation}|\p{Emoji}\uFE0F/gu
  const emojis = text.match(emojiPattern) || []
  
  if (emojis.length > 0) {
    return {
      rule: 'AUTH_NO_EMOJIS',
      message: 'Authentication templates cannot contain emojis.',
      messageId: 'authNoEmojis',
      positions: []
    }
  }
  return null
}

/**
 * Check if AUTHENTICATION template contains URLs (not allowed)
 */
function checkAuthNoUrls(text: string): ValidationIssue | null {
  const urlPattern = /https?:\/\/[^\s]+/gi
  const urls = text.match(urlPattern) || []
  
  if (urls.length > 0) {
    return {
      rule: 'AUTH_NO_URLS',
      message: 'Authentication templates cannot contain URLs.',
      messageId: 'authNoUrls',
      positions: []
    }
  }
  return null
}

/**
 * Check if AUTHENTICATION template has media header (not allowed)
 */
function checkAuthNoMediaHeader(headerType: string | null | undefined): ValidationIssue | null {
  if (headerType && headerType !== 'TEXT' && headerType !== null) {
    return {
      rule: 'AUTH_NO_MEDIA_HEADER',
      message: 'Authentication templates cannot have media headers (IMAGE, VIDEO, DOCUMENT).',
      messageId: 'authNoMediaHeader',
      positions: []
    }
  }
  return null
}

/**
 * Check if AUTHENTICATION template has required OTP button (COPY_CODE or ONE_TAP)
 */
function checkAuthRequiresOtpButton(buttons: Array<{ type: string; otp_type?: string }> | null | undefined): ValidationIssue | null {
  if (!buttons || buttons.length === 0) {
    return {
      rule: 'AUTH_REQUIRES_OTP_BUTTON',
      message: 'Authentication templates require a COPY_CODE or ONE_TAP button.',
      messageId: 'authRequiresOtpButton',
      positions: []
    }
  }
  
  const hasOtpButton = buttons.some(btn => 
    btn.type === 'OTP' || 
    btn.type === 'COPY_CODE' || 
    btn.otp_type === 'COPY_CODE' || 
    btn.otp_type === 'ONE_TAP' ||
    btn.otp_type === 'ZERO_TAP'
  )
  
  if (!hasOtpButton) {
    return {
      rule: 'AUTH_REQUIRES_OTP_BUTTON',
      message: 'Authentication templates require a COPY_CODE or ONE_TAP button.',
      messageId: 'authRequiresOtpButton',
      positions: []
    }
  }
  return null
}

/**
 * Validate template content against Meta's rules
 */
export function validateTemplateContent(options: ValidateTemplateContentOptions): ValidationResult {
  const { content, category, footerContent, headerContent, headerType, buttons } = options
  const issues: ValidationIssue[] = []
  
  const isAuthentication = category === 'AUTHENTICATION'
  
  // ============================================
  // AUTHENTICATION-SPECIFIC VALIDATIONS
  // ============================================
  if (isAuthentication) {
    // Auth templates cannot have emojis
    const authNoEmojis = checkAuthNoEmojis(content)
    if (authNoEmojis) issues.push(authNoEmojis)
    
    // Auth templates cannot have URLs
    const authNoUrls = checkAuthNoUrls(content)
    if (authNoUrls) issues.push(authNoUrls)
    
    // Auth templates cannot have media headers
    const authNoMediaHeader = checkAuthNoMediaHeader(headerType)
    if (authNoMediaHeader) issues.push(authNoMediaHeader)
    
    // Auth templates require OTP button
    const authRequiresOtpButton = checkAuthRequiresOtpButton(buttons)
    if (authRequiresOtpButton) issues.push(authRequiresOtpButton)
    
    // For authentication, we skip general variable position rules
    // because the body text format is fixed by Meta
    
    // Body length still applies
    const bodyTooLong = checkBodyTooLong(content)
    if (bodyTooLong) issues.push(bodyTooLong)
  } else {
    // ============================================
    // GENERAL (MARKETING/UTILITY) VALIDATIONS
    // ============================================
    
    // Body validations
    const variableAtStart = checkVariableAtStart(content)
    if (variableAtStart) issues.push(variableAtStart)
    
    const variableAtEnd = checkVariableAtEnd(content)
    if (variableAtEnd) issues.push(variableAtEnd)
    
    const adjacentVariables = checkAdjacentVariables(content)
    if (adjacentVariables) issues.push(adjacentVariables)
    
    const tooManyEmojis = checkTooManyEmojis(content)
    if (tooManyEmojis) issues.push(tooManyEmojis)
    
    const bodyTooLong = checkBodyTooLong(content)
    if (bodyTooLong) issues.push(bodyTooLong)
  }
  
  // Footer validation (applies to all categories)
  if (footerContent) {
    const footerTooLong = checkFooterTooLong(footerContent)
    if (footerTooLong) issues.push(footerTooLong)
  }
  
  // Header text validation (only for TEXT type, and not for AUTHENTICATION)
  if (!isAuthentication && headerType === 'TEXT' && headerContent) {
    const headerTooLong = checkHeaderTextTooLong(headerContent)
    if (headerTooLong) issues.push(headerTooLong)
  }
  
  return {
    valid: issues.length === 0,
    issues
  }
}

/**
 * Validate only the body content (for real-time frontend validation)
 */
export function validateBodyContent(content: string): ValidationResult {
  const issues: ValidationIssue[] = []
  
  const variableAtStart = checkVariableAtStart(content)
  if (variableAtStart) issues.push(variableAtStart)
  
  const variableAtEnd = checkVariableAtEnd(content)
  if (variableAtEnd) issues.push(variableAtEnd)
  
  const adjacentVariables = checkAdjacentVariables(content)
  if (adjacentVariables) issues.push(adjacentVariables)
  
  const tooManyEmojis = checkTooManyEmojis(content)
  if (tooManyEmojis) issues.push(tooManyEmojis)
  
  const bodyTooLong = checkBodyTooLong(content)
  if (bodyTooLong) issues.push(bodyTooLong)
  
  return {
    valid: issues.length === 0,
    issues
  }
}

/**
 * Validate only the body content (for real-time frontend validation)
 * Category-aware version
 */
export function validateBodyContentWithCategory(
  content: string, 
  category?: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION' | string | null,
  buttons?: Array<{ type: string; otp_type?: string }> | null
): ValidationResult {
  const issues: ValidationIssue[] = []
  const isAuthentication = category === 'AUTHENTICATION'
  
  if (isAuthentication) {
    const authNoEmojis = checkAuthNoEmojis(content)
    if (authNoEmojis) issues.push(authNoEmojis)
    
    const authNoUrls = checkAuthNoUrls(content)
    if (authNoUrls) issues.push(authNoUrls)
    
    const authRequiresOtpButton = checkAuthRequiresOtpButton(buttons)
    if (authRequiresOtpButton) issues.push(authRequiresOtpButton)
    
    const bodyTooLong = checkBodyTooLong(content)
    if (bodyTooLong) issues.push(bodyTooLong)
  } else {
    const variableAtStart = checkVariableAtStart(content)
    if (variableAtStart) issues.push(variableAtStart)
    
    const variableAtEnd = checkVariableAtEnd(content)
    if (variableAtEnd) issues.push(variableAtEnd)
    
    const adjacentVariables = checkAdjacentVariables(content)
    if (adjacentVariables) issues.push(adjacentVariables)
    
    const tooManyEmojis = checkTooManyEmojis(content)
    if (tooManyEmojis) issues.push(tooManyEmojis)
    
    const bodyTooLong = checkBodyTooLong(content)
    if (bodyTooLong) issues.push(bodyTooLong)
  }
  
  return {
    valid: issues.length === 0,
    issues
  }
}

// Export individual check functions for granular use
export {
  checkVariableAtStart,
  checkVariableAtEnd,
  checkAdjacentVariables,
  checkTooManyEmojis,
  checkBodyTooLong,
  checkFooterTooLong,
  checkHeaderTextTooLong,
  // Authentication-specific
  checkAuthNoEmojis,
  checkAuthNoUrls,
  checkAuthNoMediaHeader,
  checkAuthRequiresOtpButton
}
