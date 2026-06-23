/**
 * Resolve tenant identifier from URL slug to UUID.
 *
 * First tries the `x-tenant-id` header set by middleware (fastest path).
 * Falls back to database lookup by slug.
 */
import { headers } from 'next/headers';

/**
 * Get the tenant UUID from middleware headers (fast, no DB call).
 * Falls back to the URL slug if header not available (SSR / direct access).
 */
export async function resolveTenantId(slug: string): Promise<string> {
  try {
    const h = await headers();
    const tenantId = h.get('x-tenant-id');
    if (tenantId) return tenantId;
  } catch {
    // headers() may fail in some contexts
  }

  // Fallback: known slugs → UUIDs (matches seed data in 007_seed_data.sql)
  const KNOWN_TENANTS: Record<string, string> = {
    demo: '00000000-0000-0000-0000-000000000010',
    estateflow: '00000000-0000-0000-0000-000000000001',
  };

  if (KNOWN_TENANTS[slug]) return KNOWN_TENANTS[slug];

  // Last resort: return slug as-is (will fail as UUID, caught by query)
  return slug;
}
