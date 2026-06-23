/**
 * Health check endpoint for EstateFlow CRM.
 *
 * Returns the operational status of all critical services:
 *   - Database connection (Supabase)
 *   - Redis connection (if configured)
 *   - Application version and uptime
 *
 * Used by monitoring systems (e.g., UptimeRobot, Better Uptime, Vercel Cron).
 *
 * @route GET /api/health
 * @returns {HealthCheckResponse} JSON with status of each service
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { APP_NAME, APP_VERSION } from '@/lib/constants';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ServiceStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  latency?: number;
  message?: string;
}

interface HealthCheckResponse {
  success: boolean;
  timestamp: string;
  app: {
    name: string;
    version: string;
    environment: string;
    uptime: number;
  };
  services: {
    database: ServiceStatus;
    redis: ServiceStatus;
    edgeConfig: ServiceStatus;
  };
}

// ---------------------------------------------------------------------------
// Server start time (for uptime calculation)
// ---------------------------------------------------------------------------

const SERVER_START_TIME = Date.now();

// ---------------------------------------------------------------------------
// Health Check Handlers
// ---------------------------------------------------------------------------

/**
 * Check database connectivity via Supabase.
 *
 * Runs a simple `SELECT 1` query to verify the connection is alive.
 * Returns healthy if the query succeeds within a 3-second timeout.
 */
async function checkDatabase(): Promise<ServiceStatus> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    return {
      status: 'degraded',
      message: 'Supabase not configured — no DATABASE_URL or SUPABASE_URL set',
    };
  }

  const start = performance.now();

  try {
    const supabase = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
      db: { schema: 'public' },
    });

    const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true }).limit(1);

    const latency = Math.round(performance.now() - start);

    if (error) {
      return {
        status: 'unhealthy',
        latency,
        message: `Database query failed: ${error.message}`,
      };
    }

    return { status: 'healthy', latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return {
      status: 'unhealthy',
      latency,
      message: `Database connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check Redis connectivity.
 *
 * Attempts a simple PING command. Returns degraded (not unhealthy) if Redis
 * is not configured, since Redis is optional for cache and rate limiting
 * (the app falls back gracefully).
 */
async function checkRedis(): Promise<ServiceStatus> {
  const hasRedisUrl = !!process.env.REDIS_URL;
  const hasUpstashUrl = !!(
    process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL
  );

  if (!hasRedisUrl && !hasUpstashUrl) {
    return {
      status: 'degraded',
      message: 'Redis not configured — cache and rate limiting use fallback',
    };
  }

  // Check Upstash Redis (edge middleware)
  if (hasUpstashUrl) {
    const { Redis } = await import('@upstash/redis');
    const start = performance.now();

    try {
      const redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN || '',
      });

      const pong: unknown = await redis.ping();
      const latency = Math.round(performance.now() - start);

      const isOk = pong === 'PONG' || pong === true || pong === 'OK';
      if (!isOk) {
        return {
          status: 'unhealthy',
          latency,
          message: `Unexpected PING response: ${String(pong)}`,
        };
      }

      return { status: 'healthy', latency };
    } catch (err) {
      const latency = Math.round(performance.now() - start);
      return {
        status: 'unhealthy',
        latency,
        message: `Upstash Redis error: ${err instanceof Error ? err.message : 'Unknown error'}`,
      };
    }
  }

  // Check ioredis (server-side Redis)
  const { default: Redis } = await import('ioredis');
  const start = performance.now();

  try {
    const redis = new Redis(process.env.REDIS_URL!, {
      maxRetriesPerRequest: 1,
      retryStrategy: () => null,
      lazyConnect: true,
    });

    const pong = await redis.ping();
    const latency = Math.round(performance.now() - start);
    await redis.disconnect();

    if (pong !== 'PONG') {
      return {
        status: 'unhealthy',
        latency,
        message: `Unexpected PING response: ${String(pong)}`,
      };
    }

    return { status: 'healthy', latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return {
      status: 'unhealthy',
      latency,
      message: `Redis connection error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check Edge Config connectivity.
 *
 * Edge Config is optional (used for tenant routing cache).
 * Returns degraded if not configured.
 */
async function checkEdgeConfig(): Promise<ServiceStatus> {
  const connectionString = process.env.EDGE_CONFIG;

  if (!connectionString) {
    return {
      status: 'degraded',
      message: 'Edge Config not configured — tenant routing uses DB fallback',
    };
  }

  const start = performance.now();

  try {
    const { createClient } = await import('@vercel/edge-config');
    const client = createClient(connectionString);
    await client.get('__health_check__');
    const latency = Math.round(performance.now() - start);
    return { status: 'healthy', latency };
  } catch (err) {
    const latency = Math.round(performance.now() - start);
    return {
      status: 'unhealthy',
      latency,
      message: `Edge Config error: ${err instanceof Error ? err.message : 'Unknown error'}`,
    };
  }
}

// ---------------------------------------------------------------------------
// GET handler
// ---------------------------------------------------------------------------

/**
 * GET /api/health
 *
 * Runs all service health checks in parallel and returns a composite status.
 *
 * Response codes:
 *   200 — All services healthy (or only degraded)
 *   503 — One or more services unhealthy
 */
export async function GET(): Promise<NextResponse<HealthCheckResponse>> {
  const [database, redis, edgeConfig] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    checkEdgeConfig(),
  ]);

  const anyUnhealthy = [database, redis, edgeConfig].some(
    (s) => s.status === 'unhealthy',
  );

  const response: HealthCheckResponse = {
    success: !anyUnhealthy,
    timestamp: new Date().toISOString(),
    app: {
      name: APP_NAME,
      version: APP_VERSION,
      environment: process.env.NODE_ENV || 'development',
      uptime: Math.floor((Date.now() - SERVER_START_TIME) / 1000),
    },
    services: {
      database,
      redis,
      edgeConfig,
    },
  };

  // Return 200 if all healthy or degraded (degraded is acceptable), 503 if unhealthy
  const statusCode = anyUnhealthy ? 503 : 200;

  return NextResponse.json(response, {
    status: statusCode,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'X-Health-Check': 'true',
    },
  });
}
