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
 * common proxy headers first, then falling back to the
 * direct connection IP.
 */
export function extractClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded.split(',').map((s) => s.trim()).filter(Boolean);
    if (ips.length > 0 && ips[0]) return ips[0];
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp) return realIp;

  // Fallback
  return '127.0.0.1';
}
