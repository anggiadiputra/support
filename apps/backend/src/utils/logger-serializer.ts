// ============================================================================
// Logger Value Sanitizer
// ============================================================================
//
// Defense-in-depth redaction + bounding for winston log metadata. This module
// is wired into the winston format chain in `logger.ts`, so every value passed
// to `logger.X(msg, meta)` flows through `sanitizeLogValue` before serialization.
//
// Three protections:
// 1. Sensitive keys (Authorization, access_token, cookie, ...) are redacted.
// 2. AxiosError-shaped errors have their `config/request/response` trees
//    dropped — these are the leak vector (Bearer tokens, set-cookie, raw
//    HTTP) AND the OOM vector (ClientRequest references socket/agent/buffers).
// 3. Strings, arrays, and recursion depth are capped to prevent oversized
//    log entries (V8 heap OOM under sustained Meta API failures).
//
// Callers SHOULD still pre-process axios errors via `extractAxiosError` in
// `logger.ts` for surgical, well-shaped log entries. This sanitizer is the
// safety net for sites that forget.
// ============================================================================

const MAX_STRING_LENGTH = 8192 // 8 KB per string
const MAX_ARRAY_LENGTH = 50 // entries; truncate with "...N more" marker
const MAX_DEPTH = 8 // recursion cap

const SENSITIVE_LOG_KEYS = new Set<string>([
  'authorization',
  'cookie',
  'set-cookie',
  'access_token',
  'accesstoken',
  'wabaaccesstoken',
  'token',
  'apikey',
  'api_key',
  'x-fb-debug',
  'x-fb-trace-id',
  'password',
  'passwordhash',
  'secret',
  'client_secret',
  'otp',
  'otphash',
])

// PII keys — masked (not fully redacted) so logs remain useful for debugging
// while protecting user identity. Each category gets a category-appropriate mask:
//   email           → first 3 chars of local part + '***@' + domain
//   phone / *phone* → first 4 digits + '***' + last 4 digits
//   name / *name*   → first 3 chars + '***'
const PII_EMAIL_KEYS = new Set<string>(['email', 'useremail', 'customeremail'])
// Note: 'to' and 'from' deliberately excluded — too ambiguous (HTTP routing,
// queue payloads, event targeting). Phone-bearing call sites use explicit
// keys like `customerPhone` / `phoneNumber`, which are covered below.
const PII_PHONE_KEYS = new Set<string>([
  'phone',
  'phonenumber',
  'displayphonenumber',
  'customerphone',
  'customerphonenumber',
  'recipientphone',
  'recipient_phone_number',
  'wa_id',
  'waid',
])
const PII_NAME_KEYS = new Set<string>([
  'name',
  'fullname',
  'displayname',
  'username',
  'verified_name',
  'verifiedname',
  'customername',
  'profilename',
])

function maskEmail(value: string): string {
  const at = value.indexOf('@')
  if (at <= 0) return value.length > 3 ? value.slice(0, 3) + '***' : '***'
  const local = value.slice(0, at)
  const domain = value.slice(at + 1)
  const head = local.length <= 3 ? local : local.slice(0, 3)
  return `${head}***@${domain}`
}

function maskPhone(value: string): string {
  // Strip non-digits except leading '+' for length check, but keep original chars
  const digits = value.replace(/\D/g, '')
  if (digits.length <= 6) return '***'
  // Preserve a leading '+' if present
  const plus = value.startsWith('+') ? '+' : ''
  const head = digits.slice(0, 4)
  const tail = digits.slice(-4)
  return `${plus}${head}***${tail}`
}

function maskName(value: string): string {
  if (value.length <= 3) return '***'
  return `${value.slice(0, 3)}***`
}

function maskPiiByKey(key: string, value: unknown): unknown {
  if (typeof value !== 'string' || value.length === 0) return value
  const lower = key.toLowerCase()
  if (PII_EMAIL_KEYS.has(lower)) return maskEmail(value)
  if (PII_PHONE_KEYS.has(lower)) return maskPhone(value)
  if (PII_NAME_KEYS.has(lower)) return maskName(value)
  return value
}

function isPiiKey(key: string): boolean {
  const lower = key.toLowerCase()
  return PII_EMAIL_KEYS.has(lower) || PII_PHONE_KEYS.has(lower) || PII_NAME_KEYS.has(lower)
}

// Matches `?access_token=...&` or `&access_token=...` (also token/apikey/api_key/client_secret)
const TOKEN_QUERY_PATTERN = /([?&](access_token|token|apikey|api_key|client_secret)=)[^&#]+/gi

/**
 * Redact known token query params from a string AND truncate to MAX_STRING_LENGTH.
 */
function redactString(value: string): string {
  const redacted = value.replace(TOKEN_QUERY_PATTERN, '$1[REDACTED]')
  if (redacted.length <= MAX_STRING_LENGTH) {
    return redacted
  }
  const truncated = redacted.slice(0, MAX_STRING_LENGTH)
  return `${truncated}... [truncated ${redacted.length - MAX_STRING_LENGTH} chars]`
}

function sanitizeError(error: Error, seen: WeakSet<object>, depth: number): Record<string, unknown> {
  const base: Record<string, unknown> = {
    name: error.name,
    message: typeof error.message === 'string' ? redactString(error.message) : error.message,
    stack: typeof error.stack === 'string' ? redactString(error.stack) : error.stack,
  }

  for (const key of Object.getOwnPropertyNames(error)) {
    if (key === 'name' || key === 'message' || key === 'stack') {
      continue
    }

    // Drop axios-specific trees entirely — they carry Bearer headers, raw HTTP,
    // set-cookie, and ClientRequest refs to socket/agent/buffers (OOM vector).
    // Callers should use `extractAxiosError` to surface the safe subset.
    if (key === 'config' || key === 'request' || key === 'response') {
      continue
    }

    if (SENSITIVE_LOG_KEYS.has(key.toLowerCase())) {
      base[key] = '[REDACTED]'
      continue
    }

    const raw = (error as unknown as Record<string, unknown>)[key]
    if (isPiiKey(key)) {
      base[key] = maskPiiByKey(key, raw)
      continue
    }

    base[key] = sanitizeLogValue(raw, seen, depth + 1)
  }

  return base
}

export function sanitizeLogValue(value: unknown, seen = new WeakSet<object>(), depth = 0): unknown {
  if (depth > MAX_DEPTH) {
    return '[Depth limit]'
  }

  if (typeof value === 'string') {
    return redactString(value)
  }

  if (value instanceof Error) {
    if (seen.has(value)) {
      return '[Circular]'
    }

    seen.add(value)
    return sanitizeError(value, seen, depth)
  }

  if (Array.isArray(value)) {
    if (seen.has(value)) {
      return '[Circular]'
    }

    seen.add(value)
    const limit = Math.min(value.length, MAX_ARRAY_LENGTH)
    const result: unknown[] = []
    for (let i = 0; i < limit; i++) {
      result.push(sanitizeLogValue(value[i], seen, depth + 1))
    }
    if (value.length > MAX_ARRAY_LENGTH) {
      result.push(`[...${value.length - MAX_ARRAY_LENGTH} more]`)
    }
    seen.delete(value)
    return result
  }

  if (typeof value === 'object' && value !== null) {
    if (seen.has(value)) {
      return '[Circular]'
    }

    seen.add(value)

    const result: Record<string | symbol, unknown> = {}
    const source = value as Record<string | symbol, unknown>

    // String keys
    for (const key of Object.keys(source)) {
      if (SENSITIVE_LOG_KEYS.has(key.toLowerCase())) {
        result[key] = '[REDACTED]'
        continue
      }
      if (isPiiKey(key)) {
        result[key] = maskPiiByKey(key, source[key])
        continue
      }
      result[key] = sanitizeLogValue(source[key], seen, depth + 1)
    }

    // Symbol keys — winston uses Symbol.for('level'), Symbol.for('message'),
    // Symbol.for('splat') to pass state through the format chain. We MUST
    // preserve these or downstream formatters (json, printf) receive an
    // incomplete TransformableInfo and silently emit nothing.
    for (const sym of Object.getOwnPropertySymbols(source)) {
      result[sym] = sanitizeLogValue(source[sym], seen, depth + 1)
    }

    seen.delete(value)
    return result
  }

  return value
}

export function serializeLogMeta(meta: Record<string, unknown>): string {
  return JSON.stringify(sanitizeLogValue(meta), null, 2)
}
