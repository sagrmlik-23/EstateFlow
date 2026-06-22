/**
 * Edge Config cache for tenant routing data.
 *
 * Provides fast, edge-compatible caching of tenant resolution results using
 * @vercel/edge-config. This cache is checked FIRST in the middleware before
 * falling back to a database query, keeping the edge middleware fast.
 *
 * READ operations use the @vercel/edge-config client (read-optimised).
 * WRITE operations (set, delete) use the Vercel REST API, as the client
 * library does not expose write methods.
 *
 * Cache key patterns:
 *   - tenant:slug:<slug>       — resolved by subdomain slug
 *   - tenant:domain:<domain>   — resolved by custom domain
 *   - tenant:id:<id>           — resolved by tenant UUID
 */

import { createClient } from '@vercel/edge-config';
import type { TenantRoutingInfo } from '@/types/routing';

// ---------------------------------------------------------------------------
// Cache key constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'tenant';
const SLUG_PREFIX = `${CACHE_PREFIX}:slug:`;
const DOMAIN_PREFIX = `${CACHE_PREFIX}:domain:`;
const ID_PREFIX = `${CACHE_PREFIX}:id:`;

// ---------------------------------------------------------------------------
// Edge Config client (read-only)
// ---------------------------------------------------------------------------

let edgeConfigClient: ReturnType<typeof createClient> | null = null;

/**
 * Get the Edge Config client instance.
 * Lazily initialised to avoid issues at import time in edge runtime.
 */
function getClient() {
  if (!edgeConfigClient) {
    edgeConfigClient = createClient(
      process.env.EDGE_CONFIG || '',
    );
  }
  return edgeConfigClient;
}

// ---------------------------------------------------------------------------
// REST API helpers (write operations)
// ---------------------------------------------------------------------------

/**
 * Get the Edge Config ID and token from the connection string.
 * The connection string format is: https://<id>.edge-config.vercel.com?token=<token>
 */
function getEdgeConfigCredentials(): { id: string; token: string } | null {
  const connectionString = process.env.EDGE_CONFIG || '';
  if (!connectionString) return null;

  try {
    const url = new URL(connectionString);
    const id = url.hostname.split('.')[0] || '';
    const token = url.searchParams.get('token') || '';
    return { id, token };
  } catch {
    return null;
  }
}

/**
 * Write a value to Edge Config via the Vercel REST API.
 */
async function writeToEdgeConfig(
  key: string,
  value: TenantRoutingInfo,
  ttl: number,
): Promise<void> {
  const creds = getEdgeConfigCredentials();
  if (!creds) return;

  try {
    const response = await fetch(
      `https://api.vercel.com/v1/edge-config/${creds.id}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              operation: 'upsert',
              key,
              value,
            },
          ],
        }),
      },
    );

    if (!response.ok && process.env.NODE_ENV === 'development') {
      const text = await response.text();
      console.debug('[edge-config-api] write error:', response.status, text);
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[edge-config-api] write error:', key, error);
    }
  }
}

/**
 * Delete a value from Edge Config via the Vercel REST API.
 */
async function deleteFromEdgeConfig(key: string): Promise<void> {
  const creds = getEdgeConfigCredentials();
  if (!creds) return;

  try {
    const response = await fetch(
      `https://api.vercel.com/v1/edge-config/${creds.id}/items`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${creds.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          items: [
            {
              operation: 'delete',
              key,
            },
          ],
        }),
      },
    );

    if (!response.ok && process.env.NODE_ENV === 'development') {
      const text = await response.text();
      console.debug('[edge-config-api] delete error:', response.status, text);
    }
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[edge-config-api] delete error:', key, error);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — Read
// ---------------------------------------------------------------------------

/**
 * Retrieve a tenant from the Edge Config cache.
 *
 * @param key  - The cache key value (slug, domain, or UUID)
 * @param type - The type of cache key: 'slug', 'domain', or 'id'
 * @returns TenantRoutingInfo if found in cache, null otherwise
 */
export async function getTenantFromCache(
  key: string,
  type: 'slug' | 'domain' | 'id',
): Promise<TenantRoutingInfo | null> {
  if (!key) return null;

  const cacheKey = buildCacheKey(key, type);
  if (!cacheKey) return null;

  try {
    const client = getClient();
    const data = await client.get<TenantRoutingInfo>(cacheKey);
    return data ?? null;
  } catch (error) {
    // Cache miss or error — fall back to DB query
    if (process.env.NODE_ENV === 'development') {
      console.debug('[edge-config-cache] miss:', cacheKey, error);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — Write
// ---------------------------------------------------------------------------

/**
 * Set a tenant in the Edge Config cache with an optional TTL.
 *
 * Writes entries for all three lookup keys (slug, domain, id) so that
 * subsequent lookups by any key will hit the cache.
 *
 * @param key  - The key to write (typically the tenant slug)
 * @param data - The TenantRoutingInfo to cache
 * @param ttl  - Time-to-live in seconds (default: 3600 / 1 hour)
 */
export async function setTenantInCache(
  key: string,
  data: TenantRoutingInfo,
  ttl: number = 3600,
): Promise<void> {
  if (!key || !data) return;

  // Write by slug
  const slugKey = buildCacheKey(data.slug, 'slug');
  if (slugKey) {
    await writeToEdgeConfig(slugKey, data, ttl);
  }

  // Write by ID
  const idKey = buildCacheKey(data.tenantId, 'id');
  if (idKey) {
    await writeToEdgeConfig(idKey, data, ttl);
  }

  // Write by custom domain (if present)
  if (data.domain) {
    const domainKey = buildCacheKey(data.domain, 'domain');
    if (domainKey) {
      await writeToEdgeConfig(domainKey, data, ttl);
    }
  }
}

/**
 * Warm the Edge Config cache with tenant data after creation or update.
 *
 * @param tenantId - UUID of the tenant
 * @param data     - Full TenantRoutingInfo to cache
 */
export async function warmTenantCache(
  tenantId: string,
  data: TenantRoutingInfo,
): Promise<void> {
  if (!tenantId || !data) return;

  // Use a shorter TTL for freshly-warmed entries (5 minutes)
  await setTenantInCache(tenantId, data, 300);
}

/**
 * Invalidate all Edge Config cache entries for a tenant.
 *
 * Removes entries by slug, domain, and ID so the next request re-resolves.
 *
 * @param tenantId - UUID of the tenant to evict
 */
export async function invalidateTenantCache(
  tenantId: string,
): Promise<void> {
  if (!tenantId) return;

  // We don't know the slug or domain here, so we remove by the ID key.
  // Callers should additionally invalidate by slug and domain separately
  // for full eviction.
  const idKey = buildCacheKey(tenantId, 'id');
  if (idKey) {
    await deleteFromEdgeConfig(idKey);
  }
}

/**
 * Invalidate tenant cache entries by specific keys.
 * Preferred over generic invalidateTenantCache when slug/domain are known.
 *
 * @param slug   - Tenant slug
 * @param domain - Custom domain (optional)
 * @param id     - Tenant UUID
 */
export async function invalidateTenantCacheByKeys(
  slug: string,
  domain: string | null,
  id: string,
): Promise<void> {
  const keys: string[] = [];

  const slugKey = buildCacheKey(slug, 'slug');
  if (slugKey) keys.push(slugKey);

  const idKey = buildCacheKey(id, 'id');
  if (idKey) keys.push(idKey);

  if (domain) {
    const domainKey = buildCacheKey(domain, 'domain');
    if (domainKey) keys.push(domainKey);
  }

  await Promise.all(keys.map((k) => deleteFromEdgeConfig(k)));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build a cache key for the given value and type.
 */
function buildCacheKey(
  value: string,
  type: 'slug' | 'domain' | 'id',
): string | null {
  switch (type) {
    case 'slug':
      return `${SLUG_PREFIX}${value}`;
    case 'domain':
      return `${DOMAIN_PREFIX}${value}`;
    case 'id':
      return `${ID_PREFIX}${value}`;
    default:
      return null;
  }
}
