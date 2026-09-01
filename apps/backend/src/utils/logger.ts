import winston from 'winston'

import { sanitizeLogValue, serializeLogMeta } from './logger-serializer.js'

const { combine, timestamp, errors, printf, colorize } = winston.format
const sanitizeFormat = winston.format((info) => sanitizeLogValue(info) as winston.Logform.TransformableInfo)

// Custom format for console output - include all metadata
const consoleFormat = printf(({ level, message, timestamp, stack, ...meta }) => {
  // Remove service from meta as it's redundant
  const { service, ...restMeta } = meta
  const metaStr = Object.keys(restMeta).length > 0 
    ? '\n' + serializeLogMeta(restMeta) 
    : ''
  return `${timestamp} [${level}]: ${stack || message}${metaStr}`
})

// Create logger instance
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    sanitizeFormat(),
    timestamp(),
    errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'metawa-backend'
  },
  transports: [
    // Write all logs with level 'error' and below to 'error.log'
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    
    // Write all logs with level 'info' and below to 'combined.log'
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  ],
})

// If we're not in production then log to the console with a simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: combine(
      colorize(),
      timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      consoleFormat
    )
  }))
}

// Create logs directory if it doesn't exist
import fs from 'fs'
import path from 'path'

const logsDir = path.join(process.cwd(), 'logs')
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true })
}

// ============================================================================
// extractAxiosError
// ============================================================================
//
// Extract only safe, bounded fields from an AxiosError-shaped object.
//
// Returns a plain object suitable for `logger.error(msg, { error: extractAxiosError(err) })`.
// NEVER includes `error.config`, `error.request`, or `error.response.headers` —
// those are the leak vector (Bearer tokens, set-cookie, raw HTTP) and OOM
// vector (ClientRequest references socket/agent/buffers).
//
// Call this at every catch site that catches an axios error before passing
// the error to logger/console.
// ============================================================================

import type { AxiosError } from 'axios'

// Mirror of the pattern in logger-serializer.ts; kept local so the helper is
// self-contained and does not need a circular import.
const TOKEN_QUERY_PATTERN_LOGGER = /([?&](access_token|token|apikey|api_key|client_secret)=)[^&#]+/gi

export function extractAxiosError(error: unknown): Record<string, unknown> {
  if (error === null || error === undefined) {
    return { error: String(error) }
  }

  if (typeof error !== 'object') {
    return { error: String(error) }
  }

  const err = error as AxiosError & { code?: string }
  const isAxios = (err as { isAxiosError?: boolean }).isAxiosError === true

  if (!isAxios) {
    // Plain Error path — return name/message/stack only.
    return {
      name: (err as Error).name,
      message: (err as Error).message,
      stack: (err as Error).stack,
    }
  }

  // Build the redacted URL (strip access_token from query string)
  const rawUrl = err.config?.url ?? ''
  const safeUrl = rawUrl.replace(TOKEN_QUERY_PATTERN_LOGGER, '$1[REDACTED]')

  return {
    message: err.message,
    code: err.code,
    request: {
      method: err.config?.method?.toUpperCase(),
      url: safeUrl,
    },
    response: err.response
      ? {
          status: err.response.status,
          // err.response.data is usually the JSON Meta error body — safe to keep.
          // The serializer will redact any nested access_token inside anyway.
          data: err.response.data,
        }
      : undefined,
    stack: err.stack,
  }
}
