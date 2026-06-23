/**
 * IP extraction utilities for Edge middleware.
 *
 * These functions are deliberately isolated from rateLimiter.ts
 * because the middleware (Edge runtime) cannot import the full
 * rate limiter module which depends on ioredis (Node.js only).
 *
 * Keep this file free of any Node.js-specific imports.
 */
import type { NextRequest } from 'next/server';

/**
 * Extract the client IP address from a request, checking
 * common proxy headers first, then falling back to a
 * unique per-request identifier to avoid a shared rate-limit bucket.
 */
export function extractClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0 && ips[0]) return ips[0];
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Fallback: generate a unique per-request identifier instead of
  // hardcoding 127.0.0.1, which would cause all requests without
  // forwarded headers to share a single rate-limit bucket.
  // The x-request-id header (if set by a proxy) provides a stable
  // identifier; otherwise, fall back to a random UUID.
  const requestId = request.headers.get('x-request-id');
  if (requestId) return `request:${requestId}`;

  return `anon:${crypto.randomUUID()}`;
}
