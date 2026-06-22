/**
 * Multi-layer tenant configuration cache.
 *
 * Caching strategy (read path):
 *   1. In-memory (Map) — fastest, per-instance cache
 *   2. Redis (via Upstash/ioredis) — distributed cache across instances
 *   3. Database (via internal API fetch) — source of truth
 *
 * Write-through pattern: on successful DB write, update both Redis and
 * invalidate in-memory cache so subsequent reads get fresh data.
 *
 * Cache key pattern: tenant:config:<slug>
 *
 * @module tenantCache
 */

import { CACHE_TTL } from '@/lib/constants';
import type { TenantRoutingInfo } from '@/types/routing';
import Redis from 'ioredis';

// ---------------------------------------------------------------------------
// Cache key constants
// ---------------------------------------------------------------------------

const CACHE_PREFIX = 'tenant:config';
const CACHE_KEY = (slug: string): string => `${CACHE_PREFIX}:${slug}`;

// ---------------------------------------------------------------------------
// In-memory cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: TenantRoutingInfo;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry>();

/** Default TTL for in-memory cache (matches CACHE_TTL.TENANT_CONFIG = 300s) */
const MEMORY_TTL_MS = (CACHE_TTL.TENANT_CONFIG || 300) * 1000;

// ---------------------------------------------------------------------------
// Redis helpers
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;

function getRedisClient(): Redis | null {
  if (redisClient) return redisClient;

  const url = process.env.REDIS_URL;
  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;

  try {
    if (url) {
      redisClient = new Redis(url, {
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        lazyConnect: true,
      });
    } else {
      redisClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 2,
        retryStrategy: (times) => Math.min(times * 50, 2000),
        lazyConnect: true,
      });
    }
    return redisClient;
  } catch (err) {
    console.warn('[tenantCache] Failed to create Redis client:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Database query fallback  (internal API call, same pattern as tenantResolver)
// ---------------------------------------------------------------------------

/**
 * Fetch tenant config from the database via internal API.
 */
async function queryDatabaseBySlug(slug: string): Promise<TenantRoutingInfo | null> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/internal/resolve-tenant?slug=${encodeURIComponent(slug)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
        },
        signal: AbortSignal.timeout(2000),
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.success || !data.data) return null;

    return data.data as TenantRoutingInfo;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[tenantCache] DB query error:', slug, error);
    }
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API — Read
// ---------------------------------------------------------------------------

/**
 * Retrieve tenant configuration using a multi-layer cache strategy.
 *
 * Cache layers (checked in order):
 *   1. In-memory Map
 *   2. Redis (if available)
 *   3. Database (source of truth)
 *
 * On a cache miss in layers 1 or 2, the result is promoted to the faster
 * layers so subsequent lookups are faster.
 *
 * @param slug - Tenant slug (subdomain)
 * @returns TenantRoutingInfo if found, null otherwise
 */
export async function getCachedTenantConfig(
  slug: string,
): Promise<TenantRoutingInfo | null> {
  if (!slug) return null;

  const cacheKey = CACHE_KEY(slug);

  // ── Layer 1: In-memory ──────────────────────────────────────────────────
  const memEntry = memoryCache.get(cacheKey);
  if (memEntry && memEntry.expiresAt > Date.now()) {
    return memEntry.data;
  }
  // Expired entry — remove it
  if (memEntry) {
    memoryCache.delete(cacheKey);
  }

  // ── Layer 2: Redis ───────────────────────────────────────────────────────
  const redis = getRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(cacheKey);
      if (raw) {
        const data: TenantRoutingInfo = JSON.parse(raw);
        // Promote to in-memory cache
        memoryCache.set(cacheKey, {
          data,
          expiresAt: Date.now() + MEMORY_TTL_MS,
        });
        return data;
      }
    } catch (err) {
      console.warn('[tenantCache] Redis read error:', err);
    }
  }

  // ── Layer 3: Database ────────────────────────────────────────────────────
  const dbResult = await queryDatabaseBySlug(slug);
  if (!dbResult) return null;

  // Promote to Redis and in-memory
  await setCachedTenantConfig(slug, dbResult);

  return dbResult;
}

// ---------------------------------------------------------------------------
// Public API — Write
// ---------------------------------------------------------------------------

/**
 * Write tenant configuration to all cache layers.
 *
 * @param slug   - Tenant slug (cache key)
 * @param config - TenantRoutingInfo to cache
 */
export async function setCachedTenantConfig(
  slug: string,
  config: TenantRoutingInfo,
): Promise<void> {
  if (!slug || !config) return;

  const cacheKey = CACHE_KEY(slug);
  const ttlSeconds = CACHE_TTL.TENANT_CONFIG || 300;

  // ── In-memory ────────────────────────────────────────────────────────────
  memoryCache.set(cacheKey, {
    data: config,
    expiresAt: Date.now() + MEMORY_TTL_MS,
  });

  // ── Redis ────────────────────────────────────────────────────────────────
  const redis = getRedisClient();
  if (redis) {
    try {
      const serialised = JSON.stringify(config);
      await redis.setex(cacheKey, ttlSeconds, serialised);
    } catch (err) {
      console.warn('[tenantCache] Redis write error:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Public API — Invalidation
// ---------------------------------------------------------------------------

/**
 * Invalidate tenant configuration across all cache layers.
 *
 * Removes the entry from both in-memory cache and Redis so the next read
 * is forced to go to the database.
 *
 * @param slug - Tenant slug to invalidate (or full cache key)
 */
export async function invalidateTenantConfig(slug: string): Promise<void> {
  if (!slug) return;

  const cacheKey = CACHE_KEY(slug);

  // ── In-memory ────────────────────────────────────────────────────────────
  memoryCache.delete(cacheKey);

  // ── Redis ────────────────────────────────────────────────────────────────
  const redis = getRedisClient();
  if (redis) {
    try {
      await redis.del(cacheKey);
    } catch (err) {
      console.warn('[tenantCache] Redis delete error:', err);
    }
  }
}

/**
 * Invalidate tenant configuration by TenantRoutingInfo (all lookup keys).
 *
 * Calls invalidateTenantConfig for the slug and any additional lookup keys.
 *
 * @param config - The TenantRoutingInfo to evict
 */
export async function invalidateTenantConfigByInfo(
  config: TenantRoutingInfo,
): Promise<void> {
  const slugs = new Set<string>();

  if (config.slug) slugs.add(config.slug);

  await Promise.all(Array.from(slugs).map((slug) => invalidateTenantConfig(slug)));
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Get the base URL for internal API calls.
 */
function getBaseUrl(): string {
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL;
  }
  return 'http://localhost:3000';
}

// ---------------------------------------------------------------------------
// Default export: cache TTL constants
// ---------------------------------------------------------------------------

export const TENANT_CACHE_TTL = {
  /** In-memory cache TTL (5 minutes) */
  MEMORY: MEMORY_TTL_MS,
  /** Redis cache TTL (5 minutes — matches CACHE_TTL.TENANT_CONFIG) */
  REDIS: (CACHE_TTL.TENANT_CONFIG || 300) * 1000,
  /** Edge Config cache TTL (1 hour) */
  EDGE_CONFIG: (CACHE_TTL.EDGE_CONFIG || 3600) * 1000,
} as const;
