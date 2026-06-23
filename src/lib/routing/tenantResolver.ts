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

import { createClient } from '@supabase/supabase-js';
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
// Supabase client helper
// ---------------------------------------------------------------------------

let _supabase: ReturnType<typeof createClient> | null = null;

function getDb() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY.');
  }
  _supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabase;
}

// ---------------------------------------------------------------------------
// Database query helpers (direct Supabase queries, no internal API route)
// ---------------------------------------------------------------------------

/**
 * Query the tenants table by slug via direct Supabase query.
 */
async function queryBySlug(slug: string): Promise<TenantRoutingInfo | null> {
  try {
    const { data, error } = await (getDb()
      .from('tenants') as any)
      .select('id, slug, name, domain, logo_url, primary_color')
      .eq('slug', slug)
      .maybeSingle();

    if (error || !data) return null;

    return {
      tenantId: data.id,
      slug: data.slug,
      name: data.name,
      domain: data.domain ?? null,
      logo_url: data.logo_url ?? null,
      primary_color: data.primary_color ?? null,
    };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[tenant-resolver] queryBySlug error:', slug, err);
    }
    return null;
  }
}

/**
 * Query the tenants table by custom domain via direct Supabase query.
 */
async function queryByDomain(domain: string): Promise<TenantRoutingInfo | null> {
  try {
    const { data, error } = await getDb()
      .from('tenants')
      .select('id, slug, name, domain, logo_url, primary_color')
      .eq('domain', domain)
      .maybeSingle();

    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    return {
      tenantId: row.id as string,
      slug: row.slug as string,
      name: row.name as string,
      domain: (row.domain as string) ?? null,
      logo_url: (row.logo_url as string) ?? null,
      primary_color: (row.primary_color as string) ?? null,
    };
  } catch (err) {
    if (process.env.NODE_ENV === 'development') {
      console.debug('[tenant-resolver] queryByDomain error:', domain, err);
    }
    return null;
  }
}
