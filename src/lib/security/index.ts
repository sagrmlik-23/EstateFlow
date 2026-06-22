/**
 * Security module barrel export.
 *
 * Re-exports all public types, functions, and utilities from the security
 * subsystem so consumers can import from a single entry point:
 *
 *   import { encrypt, checkRateLimit, auditLog, getSecurityHeaders, sanitizeResponse }
 *     from '@/lib/security';
 */

// ---------------------------------------------------------------------------
// Encryption
// ---------------------------------------------------------------------------

export {
  encrypt,
  decrypt,
  encryptPhone,
  decryptPhone,
  maskPhone,
} from './encryption';

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export {
  checkRateLimit,
  withRateLimit,
  withRateLimitHandler,
  rateLimitResponse,
  extractClientIp,
  RATE_LIMIT_TIERS,
} from './rateLimiter';

export type { RateLimitTierConfig } from './rateLimiter';

// ---------------------------------------------------------------------------
// Audit Logging
// ---------------------------------------------------------------------------

export {
  auditLog,
  logCreate,
  logUpdate,
  logDelete,
  logLogin,
  logLogout,
} from './auditLogger';

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

export {
  getSecurityHeaders,
  generateCSP,
} from './securityHeaders';

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

export {
  sanitizeResponse,
} from './sanitize';

// ---------------------------------------------------------------------------
// Re-export types from @/types/security
// ---------------------------------------------------------------------------

export type {
  AuditLogParams,
  AuditLogOptions,
  RateLimitResult,
  RateLimitTier,
  RateLimitExceededError,
  SecurityHeaders,
  SanitizeOptions,
} from '@/types/security';
