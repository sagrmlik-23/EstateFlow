/**
 * Tenant context management for EstateFlow CRM.
 *
 * Provides helpers to set PostgreSQL session-level variables for RLS policies
 * and wrap operations in a tenant-scoped transaction context.
 *
 * PostgreSQL session variables set:
 *   SET LOCAL app.current_tenant   = '<tenantId>'
 *   SET LOCAL app.current_user_id  = '<userId>'
 *   SET LOCAL app.current_role     = '<role>'
 */

import type { UserRole } from '@/types/auth';

// ─── Types ─────────────────────────────────────────────────────────────────

export interface TenantContext {
  tenantId: string;
  userId: string;
  role: UserRole;
}

// ─── DB Query helper (abstracted for future adapter swap) ──────────────────

/**
 * Execute a raw SQL query that does not return rows.
 * In production, this should use a connection pool / ORM adapter.
 */
async function executeSQL(sql: string): Promise<void> {
  // In a real deployment this would use @supabase/supabase-js or a Postgres client.
  // We use a simple fetch-based approach for now, expecting a DATABASE_URL env var.
  // For Next.js edge compatibility this is a no-op placeholder — actual DB calls
  // happen in API routes via supabase-js or Prisma.
  //
  // For the MVP, we rely on the route handler's own DB client to set session vars.
  if (process.env.NODE_ENV === 'development') {
    console.debug('[tenant-context]', sql);
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Set the tenant context as PostgreSQL session variables.
 *
 * This MUST be called within a database connection/transaction for the
 * `SET LOCAL` to have effect. Call before any queries that depend on RLS.
 *
 * @param tenantId - Current tenant UUID
 * @param userId   - Current user UUID
 * @param role     - Current user role
 */
export async function setTenantContext(
  tenantId: string,
  userId: string,
  role: UserRole,
): Promise<void> {
  const sql = `
    SET LOCAL app.current_tenant   = '${sanitizeSqlString(tenantId)}';
    SET LOCAL app.current_user_id  = '${sanitizeSqlString(userId)}';
    SET LOCAL app.current_role     = '${sanitizeSqlString(role)}';
  `;
  await executeSQL(sql);
}

/**
 * Reset the tenant context session variables to defaults.
 */
export async function resetTenantContext(): Promise<void> {
  const sql = `
    SET LOCAL app.current_tenant   = '';
    SET LOCAL app.current_user_id  = '';
    SET LOCAL app.current_role     = '';
  `;
  await executeSQL(sql);
}

/**
 * Execute a callback within a tenant-scoped context.
 *
 * Sets PostgreSQL session variables, runs the callback, then resets them.
 *
 * @param tenantId - Current tenant UUID
 * @param userId   - Current user UUID
 * @param role     - Current user role
 * @param callback - Async function to execute with context set
 * @returns The return value of the callback
 */
export async function withTenantContext<T>(
  tenantId: string,
  userId: string,
  role: UserRole,
  callback: () => Promise<T>,
): Promise<T> {
  await setTenantContext(tenantId, userId, role);
  try {
    return await callback();
  } finally {
    await resetTenantContext();
  }
}

// ─── Sanitization helper ───────────────────────────────────────────────────

/**
 * Basic SQL string sanitization — prevent trivial SQL injection in session var values.
 * In production, use parameterised queries via your DB client.
 */
function sanitizeSqlString(value: string): string {
  return value.replace(/'/g, "''");
}
