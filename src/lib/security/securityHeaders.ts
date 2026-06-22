/**
 * Security headers generator for EstateFlow CRM.
 *
 * Returns a set of HTTP security headers that can be applied to any
 * response via NextResponse or standard Response objects.
 *
 * Includes Content-Security-Policy with optional nonce support,
 * HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy,
 * Permissions-Policy, and other hardening headers.
 *
 * NOTE: This file uses the Web Crypto API (globalThis.crypto) which is
 * available in both Edge and Node.js runtimes. Do NOT import from 'crypto'
 * or 'node:crypto' as those won't work in Edge Runtime.
 */

import type { SecurityHeaders } from '@/types/security';

// ---------------------------------------------------------------------------
// CSP builder
// ---------------------------------------------------------------------------

/**
 * Default Content-Security-Policy directives.
 *
 * Where possible, we restrict to 'self' only. For external services
 * (analytics, CDNs, etc.), the tenant-specific CSP may add domains.
 */
const BASE_CSP_DIRECTIVES: Record<string, string> = {
  "default-src": "'self'",
  "script-src": "'self' 'nonce-{nonce}'",
  "style-src": "'self' 'unsafe-inline'",
  "img-src": "'self' data: blob: https:",
  "font-src": "'self' data:",
  "connect-src": "'self' https:",
  "frame-ancestors": "'none'",
  "form-action": "'self'",
  "base-uri": "'self'",
  "object-src": "'none'",
};

/**
 * Generate a CSP nonce using Web Crypto API.
 * Works in both Edge and Node.js runtimes.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  // Convert Uint8Array to binary string then base64
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

/**
 * Generate a Content-Security-Policy header value.
 *
 * @param nonce       - CSP nonce for inline scripts (generated if not provided)
 * @param tenantSlug  - Optional tenant slug for tenant-specific allowlists
 * @returns CSP header value string
 */
export function generateCSP(nonce?: string, tenantSlug?: string): string {
  const actualNonce = nonce || generateNonce();

  // Start with base directives
  const directives: Record<string, string> = {
    ...BASE_CSP_DIRECTIVES,
  };

  // Add tenant-specific connect-src if provided
  if (tenantSlug) {
    const tenantDomain = `${tenantSlug}.estateflow.app`;
    const currentConnect = directives["connect-src"]!;
    directives["connect-src"] = `${currentConnect} https://${tenantDomain}`;
  }

  // Build the policy string
  const policy = Object.entries(directives)
    .map(([key, value]) => {
      // Replace nonce placeholder
      const resolved = value.replace('{nonce}', actualNonce);
      return `${key} ${resolved}`;
    })
    .join('; ');

  return policy;
}

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

/**
 * Get a complete set of HTTP security headers.
 *
 * @param nonce - Optional CSP nonce. If omitted, one is generated.
 * @returns Record of header-name → header-value
 */
export function getSecurityHeaders(nonce?: string): SecurityHeaders {
  const actualNonce = nonce || generateNonce();

  return {
    'Content-Security-Policy': generateCSP(actualNonce),
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Strict-Transport-Security':
      'max-age=63072000; includeSubDomains; preload',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy':
      'camera=(), microphone=(), geolocation=(self), interest-cohort=()',
    'X-DNS-Prefetch-Control': 'off',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
  };
}
