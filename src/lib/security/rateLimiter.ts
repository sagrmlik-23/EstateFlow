/**
 * Distributed rate limiter backed by Redis (ioredis).
 *
 * Uses a sliding window log algorithm via Redis sorted sets.
 * Each request adds a member with score = current timestamp, and we
 * ZREMRANGEBYSCORE to remove entries older than the window, then ZCARD
 * to count entries in the window.
 *
 * Rate limit tiers:
 *   - ip:       100/min
 *   - tenant:  1000/min
 *   - user:      60/min
 *   - webhook:  100/min
 *   - aiCall:    50/min
 *   - login:      5/15min
 *
 * On Redis failure, the limiter fails open (allows request) and logs a warning.
 */

import Redis from 'ioredis';
import { extractClientIp } from './ipUtils';
export { extractClientIp };
import { RateLimitExceededError, type RateLimitResult } from '@/types/security';
import { RATE_LIMITS } from '@/lib/constants';
import { NextResponse, type NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Redis client singleton
// ---------------------------------------------------------------------------

let redisClient: Redis | null = null;

function getRedis(): Redis | null {
  if (redisClient) return redisClient;

  const host = process.env.REDIS_HOST || 'localhost';
  const port = parseInt(process.env.REDIS_PORT || '6379', 10);
  const password = process.env.REDIS_PASSWORD || undefined;
  const url = process.env.REDIS_URL;

  try {
    if (url) {
      redisClient = new Redis(url, {
        maxRetriesPerRequest: 1,
        retryStrategy: () => null, // Don't retry — fail fast
        lazyConnect: true,
      });
    } else {
      redisClient = new Redis({
        host,
        port,
        password,
        maxRetriesPerRequest: 1,
        retryStrategy: () => null,
        lazyConnect: true,
      });
    }
    return redisClient;
  } catch (err) {
    console.warn('[rateLimiter] Failed to create Redis client:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Rate limit tiers
// ---------------------------------------------------------------------------

export interface RateLimitTierConfig {
  keyPrefix: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMIT_TIERS: Record<string, RateLimitTierConfig> = {
  ip: {
    keyPrefix: 'rl:ip',
    limit: RATE_LIMITS.IP.limit,
    windowSeconds: RATE_LIMITS.IP.windowSeconds,
  },
  tenant: {
    keyPrefix: 'rl:tenant',
    limit: RATE_LIMITS.TENANT.limit,
    windowSeconds: RATE_LIMITS.TENANT.windowSeconds,
  },
  user: {
    keyPrefix: 'rl:user',
    limit: RATE_LIMITS.USER.limit,
    windowSeconds: RATE_LIMITS.USER.windowSeconds,
  },
  webhook: {
    keyPrefix: 'rl:webhook',
    limit: RATE_LIMITS.WEBHOOK.limit,
    windowSeconds: RATE_LIMITS.WEBHOOK.windowSeconds,
  },
  aiCall: {
    keyPrefix: 'rl:ai:call',
    limit: RATE_LIMITS.AI_CALL.limit,
    windowSeconds: RATE_LIMITS.AI_CALL.windowSeconds,
  },
  login: {
    keyPrefix: 'rl:login',
    limit: RATE_LIMITS.LOGIN.limit,
    windowSeconds: RATE_LIMITS.LOGIN.windowSeconds,
  },
};

// ---------------------------------------------------------------------------
// Core rate limit check
// ---------------------------------------------------------------------------

/**
 * Check rate limit for a given key using a sliding window.
 *
 * Uses Redis sorted set. Score = current epoch ms. Removes entries older than
 * the window, counts remaining entries, and adds the current entry.
 *
 * @param key         - Unique key (e.g., "rl:ip:1.2.3.4")
 * @param limit       - Max requests allowed in the window
 * @param windowMs    - Window duration in milliseconds
 * @returns RateLimitResult
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<RateLimitResult> {
  const redis = getRedis();

  // Fail open if Redis is unavailable
  if (!redis) {
    console.warn('[rateLimiter] Redis unavailable — allowing request');
    return {
      allowed: true,
      remaining: limit,
      resetIn: Math.ceil(windowMs / 1000),
      limit,
    };
  }

  const now = Date.now();
  const windowStart = now - windowMs;

  try {
    // Use a MULTI block for atomicity
    const multi = redis.multi();

    // Remove entries outside the window
    multi.zremrangebyscore(key, 0, windowStart);

    // Count remaining entries in the window
    multi.zcard(key);

    // Add current entry
    multi.zadd(key, now, `${now}:${Math.random()}`);

    // Set TTL on the key (window + 10s buffer to prevent premature expiry)
    multi.pexpire(key, windowMs + 10_000);

    const results = await multi.exec();

    if (!results) {
      return { allowed: true, remaining: limit, resetIn: Math.ceil(windowMs / 1000), limit };
    }

    // results[1] is zcard result: [error, count]
    const cardResult = results[1];
    const currentCount = (cardResult?.[1] as number) ?? 0;

    const allowed = currentCount <= limit;
    const remaining = Math.max(0, limit - currentCount);
    const resetIn = Math.ceil((windowStart + windowMs - now + windowMs) / 1000);

    return {
      allowed,
      remaining,
      resetIn: Math.max(1, resetIn),
      limit,
    };
  } catch (err) {
    console.warn('[rateLimiter] Redis error — allowing request:', err);
    return {
      allowed: true,
      remaining: limit,
      resetIn: Math.ceil(windowMs / 1000),
      limit,
    };
  }
}

// ---------------------------------------------------------------------------
// Middleware helper
// ---------------------------------------------------------------------------

/**
 * extractClientIp has been moved to ./ipUtils.ts
 * to allow Edge middleware to import it without pulling in ioredis.
 *
 * @deprecated Use `import { extractClientIp } from './ipUtils'` instead.
 */

/**
 * Apply rate limiting to a request and return appropriate headers.
 *
 * Checks the configured tier, and if rate limited, returns a 429 response
 * with rate-limit headers. Otherwise returns the result with headers to set.
 *
 * @param request    - Incoming NextRequest
 * @param tierKey    - Rate limit tier key (e.g., 'ip', 'user', 'login')
 * @param keySuffix  - Additional suffix for the rate limit key (e.g., user ID)
 * @returns Object with `result` and optional `headers`
 */
export async function withRateLimit(
  request: NextRequest,
  tierKey: string,
  keySuffix?: string,
): Promise<{
  result: RateLimitResult;
  headers: Record<string, string>;
}> {
  const tier = RATE_LIMIT_TIERS[tierKey];
  if (!tier) {
    console.warn(`[rateLimiter] Unknown tier: ${tierKey}`);
    return {
      result: { allowed: true, remaining: 9999, resetIn: 1, limit: 9999 },
      headers: {},
    };
  }

  const suffix = keySuffix || extractClientIp(request);
  const redisKey = `${tier.keyPrefix}:${suffix}`;
  const windowMs = tier.windowSeconds * 1000;

  const result = await checkRateLimit(redisKey, tier.limit, windowMs);

  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(tier.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + result.resetIn)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.resetIn);
  }

  return { result, headers };
}

/**
 * Wraps a handler function with rate limit enforcement.
 *
 * If the rate limit is exceeded, throws RateLimitExceededError.
 *
 * @param handler     - Async handler to execute
 * @param key         - Rate limit Redis key
 * @param limit       - Max requests
 * @param windowMs    - Window in ms
 * @returns Handler result
 */
export async function withRateLimitHandler<T>(
  handler: () => Promise<T>,
  key: string,
  limit: number,
  windowMs: number,
): Promise<T> {
  const result = await checkRateLimit(key, limit, windowMs);

  if (!result.allowed) {
    throw new RateLimitExceededError(result.resetIn);
  }

  return handler();
}

/**
 * Create a rate-limited 429 response with standard headers.
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return new NextResponse(
    JSON.stringify({
      success: false,
      error: 'Too many requests. Please try again later.',
    }),
    {
      status: 429,
      headers: {
        'content-type': 'application/json',
        'Retry-After': String(result.resetIn),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': String(Math.ceil(Date.now() / 1000 + result.resetIn)),
      },
    },
  );
}
