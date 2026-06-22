/**
 * Tenant resolver for EstateFlow CRM multi-tenant routing.
 *
 * Resolves a tenant from the incoming hostname by:
 * 1. Checking the Edge Config cache (fast, edge-compatible)
 * 2. Falling back to a database query
 *
 * The resolver supports:
 * - Custom domain mapping (e.g. realty.example.com → tenant by custom domain)
 * - Subdomain-based routing (e.g. tenant.estateflow.app → tenant by slug)
 * - Local development (localhost → default tenant or null)
 */

import type { NextRequest } from 'next/server';
import type { TenantRoutingInfo } from '@/types/routing';
import { parseSubdomain, isReservedSubdomain } from './subdomainParser';
import { getTenantFromCache } from './edgeConfigCache';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Default tenant slug used in development when no tenant is resolved */
export const DEFAULT_TENANT_SLUG = 'demo';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a tenant from the incoming request hostname.
 *
 * Priority:
 * 1. Edge Config cache by custom domain
 * 2. Edge Config cache by subdomain slug
 * 3. Database query by custom domain
 * 4. Database query by subdomain slug
 *
 * @param host    - The hostname from the request (e.g. "tenant.estateflow.app")
 * @param request - Optional NextRequest for additional context (e.g. headers)
 * @returns TenantRoutingInfo if a tenant is resolved, null otherwise
 */
export async function resolveTenantFromHost(
  host: string,
  request?: NextRequest,
): Promise<TenantRoutingInfo | null> {
  if (!host) return null;

  void request; // Reserved for future use (e.g. forwarding headers to DB)

  // Normalise hostname
  const cleanHost = host.toLowerCase().replace(/:\d+$/, '');

  // Local development — return default tenant or null
  if (
    cleanHost === 'localhost' ||
    cleanHost.startsWith('localhost:') ||
    /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanHost)
  ) {
    // In dev mode, return null and let the middleware handle it
    return null;
  }

  // Parse the hostname to extract subdomain info
  const parsed = parseSubdomain(cleanHost);

  // If this is a custom domain (not estateflow.app), try resolving by domain
  if (parsed.isCustomDomain && !parsed.subdomain) {
    // Custom apex domain — try by domain
    const cached = await getTenantFromCache(cleanHost, 'domain');
    if (cached) return cached;

    // Fall back to DB query
    return await queryByDomain(cleanHost);
  }

  // If we have a subdomain and it's not reserved, resolve by slug
  if (parsed.subdomain && !isReservedSubdomain(parsed.subdomain)) {
    const cached = await getTenantFromCache(parsed.subdomain, 'slug');
    if (cached) return cached;

    // Fall back to DB query
    return await queryBySlug(parsed.subdomain);
  }

  // If this is a subdomain but it's reserved (www, api, admin, etc.)
  // or we're on an apex domain with no subdomain, no tenant to resolve
  return null;
}

/**
 * Resolve a tenant from a subdomain slug.
 *
 * @param subdomain - The subdomain to look up (e.g. "acme-realty")
 * @returns TenantRoutingInfo or null
 */
export async function resolveTenantFromSubdomain(
  subdomain: string,
): Promise<TenantRoutingInfo | null> {
  if (!subdomain || isReservedSubdomain(subdomain)) return null;

  // Check cache first
  const cached = await getTenantFromCache(subdomain, 'slug');
  if (cached) return cached;

  // Fall back to DB
  return await queryBySlug(subdomain);
}

// ---------------------------------------------------------------------------
// Database query helpers
// ---------------------------------------------------------------------------

/**
 * Query the tenants table by slug.
 *
 * In the Edge Runtime, direct database connections are not available.
 * This function uses a fetch-based approach to call an internal API route
 * that performs the actual DB query.
 *
 * In production, this should be replaced with a serverless DB client
 * (e.g. @vercel/postgres, Prisma Accelerate, or supabase-js in a serverless context).
 */
async function queryBySlug(slug: string): Promise<TenantRoutingInfo | null> {
  try {
    // Use internal API route for DB queries (edge-safe approach)
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/internal/resolve-tenant?slug=${encodeURIComponent(slug)}`,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_API_SECRET || '',
        },
        // Timeout after 2 seconds
        signal: AbortSignal.timeout(2000),
      },
    );

    if (!response.ok) return null;

    const data = await response.json();
    if (!data.success || !data.data) return null;

    return data.data as TenantRoutingInfo;
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[tenant-resolver] queryBySlug error:', slug, error);
    }
    return null;
  }
}

/**
 * Query the tenants table by custom domain.
 */
async function queryByDomain(domain: string): Promise<TenantRoutingInfo | null> {
  try {
    const baseUrl = getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/internal/resolve-tenant?domain=${encodeURIComponent(domain)}`,
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
      console.debug('[tenant-resolver] queryByDomain error:', domain, error);
    }
    return null;
  }
}

/**
 * Get the base URL for internal API calls.
 * Falls back to the request origin or a default for development.
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
