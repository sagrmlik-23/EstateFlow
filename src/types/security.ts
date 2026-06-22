/**
 * Security type definitions for EstateFlow CRM.
 *
 * AuditLogParams — core parameters for audit log entries.
 * RateLimitResult — result of a rate limit check.
 * SecurityHeaders — typed interface for HTTP security headers.
 */

// ---------------------------------------------------------------------------
// Audit Log
// ---------------------------------------------------------------------------

export interface AuditLogParams {
  action: string;
  entityType: string;
  entityId: string;
  oldValues: Record<string, unknown> | null;
  newValues: Record<string, unknown> | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestId: string | null;
  tenantId: string | null;
  userId: string | null;
}

export interface AuditLogOptions {
  ipAddress?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetIn: number; // seconds until the window resets
  limit: number;
}

export interface RateLimitTier {
  key: string; // prefixed Redis key
  limit: number;
  windowSeconds: number;
}

export class RateLimitExceededError extends Error {
  public readonly retryAfter: number;

  constructor(retryAfter: number) {
    super('Rate limit exceeded');
    this.name = 'RateLimitExceededError';
    this.retryAfter = retryAfter;
  }
}

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------

export type SecurityHeaders = Record<string, string>;

// ---------------------------------------------------------------------------
// Sanitization
// ---------------------------------------------------------------------------

export interface SanitizeOptions {
  additionalFields?: string[];
  mode?: 'strip' | 'mask';
}
