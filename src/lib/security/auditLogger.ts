/**
 * Structured audit logging service for EstateFlow CRM.
 *
 * Writes audit events to the audit_logs table via supabase-js (primary),
 * with a pino logger fallback for environments where the DB is unavailable.
 *
 * Also provides convenience wrappers for common action types:
 *   logCreate, logUpdate, logDelete, logLogin
 */

import { createClient } from '@supabase/supabase-js';
import pino from 'pino';
import type { AuditLogParams, AuditLogOptions } from '@/types/security';

// ---------------------------------------------------------------------------
// Logger setup
// ---------------------------------------------------------------------------

const logger = pino({
  name: 'audit',
  level: process.env.LOG_LEVEL || 'info',
  transport:
    process.env.NODE_ENV === 'development'
      ? { target: 'pino/file', options: { destination: 1 } }
      : undefined,
});

// ---------------------------------------------------------------------------
// Supabase client (lazy init)
// ---------------------------------------------------------------------------

let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    logger.warn('Supabase not configured — audit logs will use pino fallback');
    return null;
  }

  supabaseClient = createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return supabaseClient;
}

// ---------------------------------------------------------------------------
// Core audit log writer
// ---------------------------------------------------------------------------

/**
 * Write an audit log entry.
 *
 * Attempts to insert into the audit_logs table via supabase-js.
 * Falls back to pino logger if the DB write fails or supabase is not configured.
 *
 * @param params - AuditLogParams describing the event
 */
export async function auditLog(params: AuditLogParams): Promise<void> {
  const record = {
    tenant_id: params.tenantId,
    user_id: params.userId,
    action: params.action,
    entity_type: params.entityType,
    entity_id: params.entityId,
    old_values: params.oldValues,
    new_values: params.newValues,
    ip_address: params.ipAddress,
    user_agent: params.userAgent,
    request_id: params.requestId,
    created_at: new Date().toISOString(),
  };

  const supabase = getSupabase();

  if (supabase) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await supabase.from('audit_logs').insert(record as any);
      if (error) {
        logger.error({ error, record }, 'Failed to insert audit log to Supabase');
        // Fallback to pino
        logger.info({ auditLog: record }, 'Audit log (pino fallback)');
      }
      return;
    } catch (err) {
      logger.error({ err, record }, 'Supabase audit log error — using pino fallback');
      logger.info({ auditLog: record }, 'Audit log (pino fallback)');
      return;
    }
  }

  // Fallback: log via pino
  logger.info({ auditLog: record }, 'Audit log (pino fallback)');
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/**
 * Build the base parameters for a convenience wrapper.
 * Extracts tenantId, userId, ipAddress, userAgent, requestId from context.
 */
function buildOptions(
  options?: AuditLogOptions,
): Pick<AuditLogParams, 'ipAddress' | 'userAgent' | 'requestId'> {
  return {
    ipAddress: options?.ipAddress ?? null,
    userAgent: options?.userAgent ?? null,
    requestId: options?.requestId ?? null,
  };
}

/**
 * Log a 'create' action.
 *
 * @param entityType - Entity type name (e.g., 'lead', 'tenant')
 * @param entityId   - UUID of the created entity
 * @param newValues  - Values that were created
 * @param options    - Optional metadata (ip, user agent, request ID)
 */
export async function logCreate(
  entityType: string,
  entityId: string,
  newValues: Record<string, unknown>,
  options?: AuditLogOptions,
): Promise<void> {
  const opts = buildOptions(options);

  await auditLog({
    action: 'create',
    entityType,
    entityId,
    oldValues: null,
    newValues,
    ...opts,
    tenantId: null, // Will be set by middleware or caller
    userId: null,
  });
}

/**
 * Log an 'update' action.
 *
 * @param entityType - Entity type name (e.g., 'lead', 'tenant')
 * @param entityId   - UUID of the updated entity
 * @param oldValues  - Values before the update
 * @param newValues  - Values after the update
 * @param options    - Optional metadata (ip, user agent, request ID)
 */
export async function logUpdate(
  entityType: string,
  entityId: string,
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  options?: AuditLogOptions,
): Promise<void> {
  const opts = buildOptions(options);

  await auditLog({
    action: 'update',
    entityType,
    entityId,
    oldValues,
    newValues,
    ...opts,
    tenantId: null,
    userId: null,
  });
}

/**
 * Log a 'delete' action.
 *
 * @param entityType - Entity type name
 * @param entityId   - UUID of the deleted entity
 * @param oldValues  - Values that were deleted (for recovery/audit trail)
 * @param options    - Optional metadata (ip, user agent, request ID)
 */
export async function logDelete(
  entityType: string,
  entityId: string,
  oldValues: Record<string, unknown>,
  options?: AuditLogOptions,
): Promise<void> {
  const opts = buildOptions(options);

  await auditLog({
    action: 'delete',
    entityType,
    entityId,
    oldValues,
    newValues: null,
    ...opts,
    tenantId: null,
    userId: null,
  });
}

/**
 * Log a 'login' event.
 *
 * @param userId    - UUID of the user who logged in
 * @param tenantId  - Tenant UUID
 * @param options   - Optional metadata (ip, user agent, request ID)
 */
export async function logLogin(
  userId: string,
  tenantId: string,
  options?: AuditLogOptions,
): Promise<void> {
  const opts = buildOptions(options);

  await auditLog({
    action: 'login',
    entityType: 'user_session',
    entityId: userId,
    oldValues: null,
    newValues: null,
    ...opts,
    tenantId,
    userId,
  });
}

/**
 * Log a 'logout' event.
 *
 * @param userId    - UUID of the user who logged out
 * @param tenantId  - Tenant UUID
 * @param options   - Optional metadata
 */
export async function logLogout(
  userId: string,
  tenantId: string,
  options?: AuditLogOptions,
): Promise<void> {
  const opts = buildOptions(options);

  await auditLog({
    action: 'logout',
    entityType: 'user_session',
    entityId: userId,
    oldValues: null,
    newValues: null,
    ...opts,
    tenantId,
    userId,
  });
}

export type { AuditLogParams, AuditLogOptions };
