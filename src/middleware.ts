/**
 * EstateFlow CRM — Edge Middleware (Routing + Auth + Security)
 *
 * ═══════════════════════════════════════════════════════════════════════════════
 * MIDDLEWARE EXECUTION ORDER:
 *   1. TENANT ROUTING     — resolves tenant from hostname, sets x-tenant-* headers
 *   2. AUTH               — validates JWT for protected routes, sets x-user-* headers
 *   3. SECURITY           — adds security headers, applies rate limiting
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Config matcher: All routes except static assets, auth API routes, and SEO files.
 * Public routes skip auth but still get routing and security headers.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { verifyToken } from '@/lib/auth/jwt';
import type { AuthResult, UserRole } from '@/types/auth';
import { resolveTenantFromHost } from '@/lib/routing/tenantResolver';
import type { TenantRoutingInfo } from '@/types/routing';
import { getSecurityHeaders } from '@/lib/security/securityHeaders';
import { extractClientIp } from '@/lib/security/ipUtils';
import { generateCsrfCookie } from '@/lib/security/csrf';
import { Redis } from '@upstash/redis';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

/** Routes that bypass tenant routing (already on the platform domain) */
const SKIP_ROUTING_PREFIXES = [
  '/api/auth',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/sitemap.xml',
  '/robots.txt',
];

/** Routes that do not require authentication */
const PUBLIC_ROUTES = new Set<string>([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/csrf',
  '/api/tenants',
  '/api/webhooks',
  '/_next/static',
  '/_next/image',
  '/favicon.ico',
  '/sitemap.xml',
  '/robots.txt',
]);

/** Headers set by the auth middleware on authenticated requests */
export const AUTH_HEADERS = {
  USER_ID: 'x-user-id',
  USER_ROLE: 'x-user-role',
  TENANT_ID: 'x-tenant-id',
  SESSION_ID: 'x-session-id',
} as const;

/** Headers set by the routing middleware */
export const ROUTING_HEADERS = {
  TENANT_ID: 'x-tenant-id',
  TENANT_SLUG: 'x-tenant-slug',
  TENANT_DOMAIN: 'x-tenant-domain',
} as const;

/** Default redirect for unmatched domains */
const UNMATCHED_DOMAIN_REDIRECT = 'https://estateflow.app/404';

/** Hostnames that are considered local development */
const LOCAL_HOSTNAMES = new Set<string>(['localhost', '127.0.0.1', '0.0.0.0']);

// ═══════════════════════════════════════════════════════════════════════════════
// Upstash Redis (edge-compatible rate limiter)
// ═══════════════════════════════════════════════════════════════════════════════

let upstashRedis: Redis | null = null;

function getUpstashRedis(): Redis | null {
  if (upstashRedis) return upstashRedis;

  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.UPSTASH_REDIS_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.UPSTASH_REDIS_TOKEN;

  if (!url) {
    return null;
  }

  try {
    upstashRedis = new Redis({ url, token: token || '' });
    return upstashRedis;
  } catch {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware — Entry Point
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Next.js Edge Middleware.
 *
 * Phase 1: TENANT ROUTING — resolves tenant from hostname, sets headers.
 * Phase 2: AUTH — validates JWT for protected routes.
 * Phase 3: SECURITY — adds security headers and applies rate limiting.
 */
export async function middleware(request: NextRequest): Promise<NextResponse | Response> {
  const { pathname } = request.nextUrl;

  // ── Phase 0: Skip internal routes ────────────────────────────────────────
  const shouldSkipRouting = SKIP_ROUTING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );

  if (shouldSkipRouting) {
    // For auth API routes, we still need auth + security
    const response = NextResponse.next();
    const authResultOrResponse = await handleAuthPhase(request, response);

    // If auth returned an error, return it with security headers
    if (authResultOrResponse instanceof Response && authResultOrResponse.status >= 400) {
      return addSecurityToResponse(authResultOrResponse, request);
    }

    // Add security headers and rate limiting
    return addSecurityToResponse(authResultOrResponse as NextResponse, request);
  }

  // ── Phase 1: TENANT ROUTING ──────────────────────────────────────────────
  const host = request.headers.get('host') || '';
  const routingResult = await handleTenantRouting(request, host);

  // If routing returned a redirect/error response, add security headers
  if (routingResult.status >= 300) {
    return addSecurityToResponse(routingResult, request);
  }

  // ── Phase 2: AUTH ────────────────────────────────────────────────────────
  const authResult = await handleAuthPhase(request, routingResult as NextResponse);

  // If auth returned an error, add security headers and return
  if (authResult instanceof Response && authResult.status >= 400) {
    return addSecurityToResponse(authResult, request);
  }

  const response = authResult as NextResponse;

  // ── Phase 3: SECURITY ────────────────────────────────────────────────────
  return addSecurityToResponse(response, request);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 1: Tenant Routing
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve the tenant from the request hostname and set routing headers.
 */
async function handleTenantRouting(
  request: NextRequest,
  host: string,
): Promise<NextResponse | Response> {
  // Development mode — pass through without tenant resolution
  if (isLocalDevelopment(host)) {
    const requestHeaders = new Headers(request.headers);
    if (process.env.NODE_ENV === 'development') {
      requestHeaders.set(ROUTING_HEADERS.TENANT_ID, '00000000-0000-0000-0000-000000000010');
      requestHeaders.set(ROUTING_HEADERS.TENANT_SLUG, 'demo');
    }
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    if (process.env.NODE_ENV === 'development') {
      response.headers.set(ROUTING_HEADERS.TENANT_ID, '00000000-0000-0000-0000-000000000010');
      response.headers.set(ROUTING_HEADERS.TENANT_SLUG, 'demo');
    }
    return response;
  }

  const tenant = await resolveTenantFromHost(host, request);

  if (!tenant) {
    return redirectToPlatform(request, UNMATCHED_DOMAIN_REDIRECT);
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(ROUTING_HEADERS.TENANT_ID, tenant.tenantId);
  requestHeaders.set(ROUTING_HEADERS.TENANT_SLUG, tenant.slug);
  requestHeaders.set(ROUTING_HEADERS.TENANT_DOMAIN, host);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(ROUTING_HEADERS.TENANT_ID, tenant.tenantId);
  response.headers.set(ROUTING_HEADERS.TENANT_SLUG, tenant.slug);
  response.headers.set(ROUTING_HEADERS.TENANT_DOMAIN, host);

  return response;
}

function redirectToPlatform(
  request: NextRequest,
  targetUrl: string,
): Response {
  const { pathname, search } = request.nextUrl;
  const redirectUrl = new URL(targetUrl);
  redirectUrl.searchParams.set('from', pathname + search);
  return Response.redirect(redirectUrl.toString(), 302);
}

function isLocalDevelopment(host: string): boolean {
  const cleanHost = host.toLowerCase().replace(/:\d+$/, '');
  return LOCAL_HOSTNAMES.has(cleanHost);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 2: Authentication
// ═══════════════════════════════════════════════════════════════════════════════

async function handleAuthPhase(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse | Response> {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return response;
  }

  // In development mode on localhost, skip auth for easier testing
  const host = request.headers.get('host') || '';
  if (process.env.NODE_ENV === 'development' && isLocalDevelopment(host)) {
    // Set default dev user context
    response.headers.set(AUTH_HEADERS.USER_ID, 'dev-user-id');
    response.headers.set(AUTH_HEADERS.USER_ROLE, 'tenant_admin');
    return response;
  }

  return authenticateSync(request, response);
}

async function authenticateSync(
  request: NextRequest,
  response: NextResponse,
): Promise<NextResponse | Response> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorizedResponse();
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return unauthorizedResponse();
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return unauthorizedResponse();
  }

  // Read tenant from response headers (set by routing phase)
  const routingTenantId = response.headers.get('x-tenant-id');
  if (routingTenantId && routingTenantId !== payload.tenantId) {
    return unauthorizedResponse();
  }

  response.headers.set(AUTH_HEADERS.USER_ID, payload.userId);
  response.headers.set(AUTH_HEADERS.USER_ROLE, payload.role);
  if (!routingTenantId) {
    response.headers.set(AUTH_HEADERS.TENANT_ID, payload.tenantId);
  }
  response.headers.set(AUTH_HEADERS.SESSION_ID, crypto.randomUUID());

  // Set CSRF token cookie for state-changing request protection
  try {
    const { cookieHeader } = generateCsrfCookie();
    response.headers.set('Set-Cookie', cookieHeader);
  } catch (err) {
    console.warn('[middleware:auth] Failed to generate CSRF cookie:', err);
  }

  return response;
}

export async function authenticate(request: NextRequest): Promise<AuthResult | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return null;
  }

  const payload = await verifyToken(token);
  if (!payload) {
    return null;
  }

  // Read tenant from request headers (set by routing middleware via NextResponse.next)
  const routingTenantId = request.headers.get('x-tenant-id');
  if (routingTenantId && routingTenantId !== payload.tenantId) {
    return null;
  }

  return {
    userId: payload.userId,
    role: payload.role as UserRole,
    tenantId: payload.tenantId,
    sessionId: crypto.randomUUID(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Phase 3: Security
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Rate limit tiers for edge middleware.
 * Uses Upstash Redis (edge-compatible) for rate limiting.
 */
const EDGE_RATE_LIMITS = {
  ip: { limit: 100, windowSeconds: 60 },
  login: { limit: 5, windowSeconds: 900 },
} as const;

/**
 * Add security headers and rate limiting to a response.
 *
 * @param response - The response to add security to
 * @param request  - The original request for context extraction
 * @returns The response with security headers and optional rate limit headers
 */
async function addSecurityToResponse(
  response: Response | NextResponse,
  request: NextRequest,
): Promise<NextResponse | Response> {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');

  // ── Handle immutable responses (redirects, rewrites) ──────────────────────
  // Edge Runtime throws "TypeError: immutable" if we try to set headers on
  // a NextResponse.redirect() or NextResponse.rewrite(). In that case, clone
  // into a new NextResponse with the desired headers.
  let workingResponse: NextResponse;
  try {
    // Quick test — a genuine redirect will throw here
    workingResponse = response instanceof NextResponse
      ? response
      : new NextResponse(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: response.headers,
        });
    // Test if headers are mutable
    workingResponse.headers.set('x-test', 'test');
    workingResponse.headers.delete('x-test');
  } catch {
    // Headers are immutable — create a new response with the same body
    const body = response.body ? await response.text() : null;
    workingResponse = new NextResponse(body, {
      status: response.status,
      statusText: response.statusText,
    });
  }

  // ── Security Headers ─────────────────────────────────────────────────────
  const headers = getSecurityHeaders();

  for (const [key, value] of Object.entries(headers)) {
    workingResponse.headers.set(key as string, value as string);
  }

  // ── Explicit Security Hardening (overrides helpers for defence in depth) ─
  workingResponse.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains',
  );
  workingResponse.headers.set('X-Content-Type-Options', 'nosniff');
  workingResponse.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  workingResponse.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  );

  // ── Rate Limiting (API routes only) ──────────────────────────────────────
  if (isApiRoute) {
    const redis = getUpstashRedis();

    if (redis) {
      const clientIp = extractClientIp(request);
      const isLoginRoute = pathname === '/api/auth/login';
      const isRegisterRoute = pathname === '/api/auth/register';

      // Determine tier — both login and register use the strict login tier
      const isAuthRoute = isLoginRoute || isRegisterRoute;
      const tier = isAuthRoute ? EDGE_RATE_LIMITS.login : EDGE_RATE_LIMITS.ip;
      const key = isLoginRoute
        ? `rl:login:${clientIp}`
        : isRegisterRoute
          ? `rl:register:${clientIp}`
          : `rl:ip:${clientIp}`;

      try {
        const now = Date.now();
        const windowMs = tier.windowSeconds * 1000;
        const windowKey = Math.floor(now / windowMs).toString();

        // Sliding window using Upstash
        const count = await redis.incr(`${key}:${windowKey}`);
        if (count === 1) {
          // First request in this window — set expiry
          await redis.expire(`${key}:${windowKey}`, tier.windowSeconds);
        }

        const remaining = Math.max(0, tier.limit - count);

        workingResponse.headers.set('X-RateLimit-Limit', String(tier.limit));
        workingResponse.headers.set('X-RateLimit-Remaining', String(remaining));
        workingResponse.headers.set(
          'X-RateLimit-Reset',
          String(Math.floor((now + windowMs) / 1000)),
        );

        if (count > tier.limit) {
          // Rate limited — return 429
          const retryAfter = Math.ceil(
            (Math.floor(now / windowMs) * windowMs + windowMs - now) / 1000,
          );
          workingResponse.headers.set('Retry-After', String(retryAfter));

          // Only return 429 for authorized routes (not public auth pages)
          // Login rate limit is already enforced by the count check above
          const responseHeaders: Record<string, string> = {};
          workingResponse.headers.forEach((val, key) => {
            responseHeaders[key] = val;
          });

          return new Response(
            JSON.stringify({
              success: false,
              error: 'Too many requests. Please try again later.',
            }),
            {
              status: 429,
              headers: responseHeaders,
            },
          );
        }
      } catch (err) {
        // Fail open: allow request through if Redis errors
        console.warn('[middleware:security] Rate limit check failed:', err);
      }
    }
  }

  return workingResponse;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Internal Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function isPublicRoute(pathname: string): boolean {
  // Exact-match routes: must match the full pathname exactly
  const EXACT_ROUTES = new Set(['/api/tenants', '/api/webhooks']);
  if (EXACT_ROUTES.has(pathname)) return true;

  const publicRoutes = Array.from(PUBLIC_ROUTES);
  return publicRoutes.some((route) => {
    // For non-exact routes, use startsWith to allow sub-paths
    if (EXACT_ROUTES.has(route)) return false;
    return pathname === route || pathname.startsWith(route);
  });
}

function unauthorizedResponse(): Response {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: {
      'content-type': 'application/json',
      'www-authenticate': 'Bearer realm="api"',
    },
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Middleware Config
// ═══════════════════════════════════════════════════════════════════════════════

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)',
  ],
};
