/**
 * CSRF Protection utility for EstateFlow CRM.
 *
 * Uses the double-submit cookie pattern:
 * 1. On GET /api/auth/csrf, generate a random token and set it as a
 *    non-HttpOnly, SameSite=Strict cookie (`csrf-token`).
 * 2. For state-changing requests (POST/PATCH/PUT/DELETE), require the
 *    `X-CSRF-Token` header to match the cookie value.
 *
 * This is effective because:
 * - SameSite=Strict prevents the cookie from being sent on cross-site requests.
 * - An attacker cannot read the cookie via JavaScript on a cross-origin page,
 *   so they cannot forge the custom header.
 */

import { createHash, randomBytes } from 'crypto';
import type { NextRequest } from 'next/server';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CSRF_COOKIE_NAME = 'csrf-token';
export const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_TOKEN_BYTES = 32; // 256-bit tokens

// In-memory store for issued CSRF tokens (server-side tracking for defence-in-depth)
// Maps token hash -> issued timestamp for optional TTL enforcement.
const TOKEN_STORE = new Map<string, number>();

// Clean up expired tokens every 5 minutes
const CSRF_TOKEN_TTL_MS = 30 * 60 * 1000; // 30 minutes
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [hash, issuedAt] of TOKEN_STORE) {
      if (now - issuedAt > CSRF_TOKEN_TTL_MS) {
        TOKEN_STORE.delete(hash);
      }
    }
  }, 5 * 60 * 1000);
  // Allow Node to exit even if the interval is still running
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

// ---------------------------------------------------------------------------
// Token generation
// ---------------------------------------------------------------------------

/**
 * Generate a new CSRF token and return its raw value.
 * Also stores a SHA-256 hash of the token in the in-memory store.
 */
export function generateCsrfToken(): string {
  ensureCleanup();

  const token = randomBytes(CSRF_TOKEN_BYTES).toString('hex');
  const hash = createHash('sha256').update(token).digest('hex');
  TOKEN_STORE.set(hash, Date.now());

  return token;
}

/**
 * Generate a new CSRF token and return the Set-Cookie header value.
 */
export function generateCsrfCookie(): { token: string; cookieHeader: string } {
  const token = generateCsrfToken();
  const cookieHeader = [
    `${CSRF_COOKIE_NAME}=${token}`,
    'Path=/',
    'SameSite=Strict',
    'HttpOnly=false', // Must be readable by client JS to set the header
    'Secure',
    `Max-Age=${Math.ceil(CSRF_TOKEN_TTL_MS / 1000)}`,
  ].join('; ');

  return { token, cookieHeader };
}

// ---------------------------------------------------------------------------
// Token validation
// ---------------------------------------------------------------------------

/**
 * Validate a CSRF token against the cookie.
 *
 * Checks:
 * 1. The `X-CSRF-Token` header is present and non-empty.
 * 2. The `csrf-token` cookie is present and non-empty.
 * 3. Both values match (string comparison).
 * 4. The token hash exists in the in-memory store (defence-in-depth).
 *
 * @param request - The incoming NextRequest
 * @returns `true` if valid, `false` otherwise
 */
export function validateCsrfToken(request: NextRequest): boolean {
  const headerToken = request.headers.get(CSRF_HEADER_NAME);
  const cookieToken = request.cookies.get(CSRF_COOKIE_NAME)?.value;

  if (!headerToken || !cookieToken) {
    return false;
  }

  if (headerToken !== cookieToken) {
    return false;
  }

  // Defence-in-depth: also check the in-memory store
  const hash = createHash('sha256').update(cookieToken).digest('hex');
  if (!TOKEN_STORE.has(hash)) {
    // Token not recognised - could be a replayed or forged token
    return false;
  }

  return true;
}

/**
 * Extract the CSRF token from the request.
 *
 * @returns The token string or null.
 */
export function extractCsrfToken(request: NextRequest): string | null {
  return request.headers.get(CSRF_HEADER_NAME) || null;
}

// ---------------------------------------------------------------------------
// Helper: determine if a request is state-changing
// ---------------------------------------------------------------------------

/**
 * State-changing HTTP methods that require CSRF protection.
 */
const STATE_CHANGING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Returns true if the request method is state-changing (POST/PATCH/PUT/DELETE).
 */
export function isStateChangingMethod(request: NextRequest): boolean {
  return STATE_CHANGING_METHODS.has(request.method.toUpperCase());
}

// ---------------------------------------------------------------------------
// Handler wrapper
// ---------------------------------------------------------------------------

/**
 * Wrap an API handler with CSRF protection.
 *
 * Returns a 403 Forbidden response if the CSRF check fails.
 * Only enforces CSRF on state-changing methods.
 *
 * @param request  - The incoming NextRequest
 * @param handler  - Async handler to execute if CSRF check passes
 * @returns Handler result or 403 response
 */
export async function withCsrfProtection<T>(
  request: NextRequest,
  handler: () => Promise<T>,
): Promise<T | Response> {
  if (isStateChangingMethod(request)) {
    if (!validateCsrfToken(request)) {
      return new Response(
        JSON.stringify({ success: false, error: 'CSRF token missing or invalid' }),
        {
          status: 403,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
  }

  return handler();
}
